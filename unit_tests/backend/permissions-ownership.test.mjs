import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSnapshot, databaseCommand, databaseRows, sqlLiteral } from "./helpers/database.mjs";
import { workoutId, workoutPayload } from "./helpers/fixtures.mjs";
import { json, request, rpc } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

test("RLS exposes own rows and shared machines while hiding another user's hierarchy", async () => {
  const { users, machineId } = await loadState();
  const aId = workoutId(users.a.id, { serial: 400 });
  const bId = workoutId(users.b.id, { serial: 401 });
  assert.equal((await rpc("saveWorkout", users.a.session.accessToken, { payload: workoutPayload(aId, { machineId, prefix: "Owner A" }) })).response.status, 200);
  assert.equal((await rpc("saveWorkout", users.b.session.accessToken, { payload: workoutPayload(bId, { machineId, prefix: "Owner B" }) })).response.status, 200);

  for (const [owner, ownId, otherId] of [[users.a, aId, bId], [users.b, bId, aId]]) {
    const own = await request(`/rest/v1/workouts?workoutID=eq.${encodeURIComponent(ownId)}&select=*`, {}, { accessToken: owner.session.accessToken });
    const other = await request(`/rest/v1/workouts?workoutID=eq.${encodeURIComponent(otherId)}&select=*`, {}, { accessToken: owner.session.accessToken });
    const machines = await request(`/rest/v1/machines?ID=eq.${machineId}&select=*`, {}, { accessToken: owner.session.accessToken });
    assert.equal(own.response.status, 200);
    assert.equal(own.body.length, 1);
    assert.deepEqual(other.body, []);
    assert.deepEqual(machines.body, [{ ID: machineId }]);
  }
  for (const table of ["users", "workouts", "exercises", "sets"]) {
    const visible = await request(`/rest/v1/${table}?select=*`, {}, { accessToken: users.a.session.accessToken });
    assert.equal(visible.response.status, 200);
    assert.ok(visible.body.every((row) => row.user === users.a.id));
  }
});

test("authenticated users cannot directly insert, update, or delete application rows", async () => {
  const { users } = await loadState();
  const id = workoutId(users.a.id, { serial: 410 });
  assert.equal((await rpc("saveWorkout", users.a.session.accessToken, { payload: workoutPayload(id, { prefix: "Immutable" }) })).response.status, 200);
  const before = aggregateSnapshot(id);
  const mutations = [
    ["users", "POST", { user: users.a.id, name: "duplicate" }],
    ["machines", "POST", {}],
    ["workouts", "POST", { workoutID: workoutId(users.a.id, { serial: 411 }), user: users.a.id, start_time: new Date().toISOString(), end_time: new Date().toISOString(), local_timezone: "Etc/UTC" }],
    ["exercises", "POST", { user: users.a.id, workoutID: id, exercise_name: "Bypass", exercise_number: 99 }],
    ["sets", "POST", { user: users.a.id, workoutID: id, exerciseID: before[0].exercises[0].ID, reps: 1, weight_g: 1, set_number: 99 }],
    [`users?user=eq.${users.a.id}`, "PATCH", { name: "Changed" }],
    [`workouts?workoutID=eq.${encodeURIComponent(id)}`, "DELETE", null],
  ];
  for (const [path, method, body] of mutations) {
    const result = await request(`/rest/v1/${path}`, body === null ? { method } : json(method, body), { accessToken: users.a.session.accessToken });
    assert.ok(result.response.status >= 400, `${method} ${path}`);
  }
  assert.deepEqual(aggregateSnapshot(id), before);
});

test("ownership derives from the caller and parent constraints reject mismatches", async () => {
  const { users, machineId } = await loadState();
  const aId = workoutId(users.a.id, { serial: 420 });
  const bId = workoutId(users.b.id, { serial: 421 });
  const cross = await rpc("saveWorkout", users.b.session.accessToken, { payload: workoutPayload(aId) });
  assert.equal(cross.response.status, 403);
  assert.equal(cross.body.code, "PT403");
  assert.equal((await rpc("saveWorkout", users.a.session.accessToken, { payload: workoutPayload(aId, { machineId }) })).response.status, 200);
  assert.equal((await rpc("saveWorkout", users.b.session.accessToken, { payload: workoutPayload(bId, { machineId }) })).response.status, 200);
  assert.equal((await rpc("saveWorkout", users.b.session.accessToken, { payload: workoutPayload(aId) })).response.status, 403);
  const aExercise = aggregateSnapshot(aId)[0].exercises[0];
  assert.throws(() => databaseCommand(`insert into public.sets ("user", "workoutID", "exerciseID", reps, weight_g, set_number)
    values (${sqlLiteral(users.b.id)}::uuid, ${sqlLiteral(aId)}, ${sqlLiteral(aExercise.ID)}::uuid, 1, 1, 99)`), /foreign key/i);
});

test("all tables use RLS and every current RPC has intentional grants and search path", async () => {
  const tables = databaseRows(`select c.relname, c.relrowsecurity,
    has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
    has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
    has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as authenticated_write
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('users','machines','workouts','exercises','sets') order by c.relname`);
  assert.equal(tables.length, 5);
  assert.ok(tables.every((row) => row.relrowsecurity && !row.anon_access && row.authenticated_select && !row.authenticated_write));
  const functions = databaseRows(`select p.proname, p.prosecdef, p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('saveWorkout','getWorkouts','getUserEULAStatus','acknowledgeEULA','deleteAllWorkouts','deleteUser') order by p.proname`);
  assert.equal(functions.length, 6);
  assert.ok(functions.every((row) => !row.anon_execute && row.authenticated_execute && row.proconfig.includes("search_path=pg_catalog")));
  assert.equal(functions.find((row) => row.proname === "saveWorkout").prosecdef, true);
  assert.equal(functions.find((row) => row.proname === "getWorkouts").prosecdef, false);

  const { users } = await loadState();
  for (const name of ["saveWorkout", "getWorkouts", "getUserEULAStatus", "acknowledgeEULA", "deleteAllWorkouts", "deleteUser"]) {
    const body = name === "saveWorkout" ? { payload: {} } : {};
    const anonymous = await request(`/rest/v1/rpc/${name}`, json("POST", body));
    assert.notEqual(anonymous.response.status, 200, name);
  }
  assert.equal((await rpc("getWorkouts", users.authOnly.session.accessToken)).response.status, 403);
});

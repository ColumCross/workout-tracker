import assert from "node:assert/strict";
import test from "node:test";
import { databaseRows, hierarchyCounts, sqlLiteral } from "./helpers/database.mjs";
import { workoutId, workoutPayload } from "./helpers/fixtures.mjs";
import { assertNoStore } from "./helpers/assertions.mjs";
import { edge, request, rpc } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

test("bulk deletion removes only the caller hierarchy and retains profile acknowledgement", async () => {
  const { users, machineId } = await loadState();
  const user = users.bulk;
  const bBefore = hierarchyCounts(users.b.id);
  for (const serial of [600, 601]) {
    const id = workoutId(user.id, { serial });
    assert.equal((await rpc("saveWorkout", user.session.accessToken, { payload: workoutPayload(id, { machineId, prefix: `Delete ${serial}` }) })).response.status, 200);
  }
  const acknowledgement = await rpc("acknowledgeEULA", user.session.accessToken);
  const result = await edge("deleteAllWorkouts", user.session.accessToken, { method: "DELETE" });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, { success: true });
  assertNoStore(result);
  assert.deepEqual(hierarchyCounts(user.id), { workouts: 0, exercises: 0, sets: 0 });
  assert.deepEqual(hierarchyCounts(users.b.id), bBefore);
  assert.equal(databaseRows(`select eula_acknowledged from public.users where "user" = ${sqlLiteral(user.id)}::uuid`)[0].eula_acknowledged, acknowledgement.body);
  assert.equal(databaseRows(`select count(*)::integer as count from public.machines where "ID" = ${sqlLiteral(machineId)}::uuid`)[0].count, 1);
  assert.equal((await rpc("deleteAllWorkouts", user.session.accessToken)).body, true);
});

test("account-data deletion is complete, preserves Auth identity, and blocks future member operations", async () => {
  const { users, machineId } = await loadState();
  const user = users.delete;
  const id = workoutId(user.id, { serial: 610 });
  assert.equal((await rpc("saveWorkout", user.session.accessToken, { payload: workoutPayload(id, { machineId, prefix: "Final" }) })).response.status, 200);
  const result = await edge("deleteUser", user.session.accessToken, { method: "DELETE" });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, { success: true });
  assertNoStore(result);
  assert.deepEqual(hierarchyCounts(user.id), { workouts: 0, exercises: 0, sets: 0 });
  assert.deepEqual(databaseRows(`select * from public.users where "user" = ${sqlLiteral(user.id)}::uuid`), []);
  assert.equal(databaseRows(`select count(*)::integer as count from auth.users where id = ${sqlLiteral(user.id)}::uuid`)[0].count, 1);
  assert.equal((await rpc("getWorkouts", user.session.accessToken)).response.status, 403);
  assert.equal((await edge("deleteUser", user.session.accessToken, { method: "DELETE" })).response.status, 403);
});

test("save/delete concurrency produces a serialized complete outcome without orphans", async () => {
  const { users } = await loadState();
  const user = users.concurrent;
  const id = workoutId(user.id, { serial: 620 });
  const [saved, deleted] = await Promise.all([
    rpc("saveWorkout", user.session.accessToken, { payload: workoutPayload(id, { prefix: "Race" }) }),
    rpc("deleteAllWorkouts", user.session.accessToken),
  ]);
  assert.equal(saved.response.status, 200);
  assert.equal(deleted.response.status, 200);
  const counts = hierarchyCounts(user.id);
  assert.ok(
    (counts.workouts === 0 && counts.exercises === 0 && counts.sets === 0)
    || (counts.workouts === 1 && counts.exercises === 2 && counts.sets === 3),
  );
  const orphans = databaseRows(`select
    (select count(*)::integer from public.exercises e left join public.workouts w on w."workoutID" = e."workoutID" and w."user" = e."user" where e."user" = ${sqlLiteral(user.id)}::uuid and w."workoutID" is null) as exercises,
    (select count(*)::integer from public.sets s left join public.exercises e on e."ID" = s."exerciseID" and e."user" = s."user" and e."workoutID" = s."workoutID" where s."user" = ${sqlLiteral(user.id)}::uuid and e."ID" is null) as sets`)[0];
  assert.deepEqual(orphans, { exercises: 0, sets: 0 });
});

test("deletion wrappers reject anonymous, Auth-only, and unsupported-method callers", async () => {
  const { users } = await loadState();
  for (const name of ["deleteAllWorkouts", "deleteUser"]) {
    assert.equal((await request(`/functions/v1/${name}`, { method: "DELETE" })).response.status, 401);
    assert.equal((await edge(name, users.authOnly.session.accessToken, { method: "DELETE" })).response.status, 403);
    const wrongMethod = await edge(name, users.b.session.accessToken, { method: "POST" });
    assert.equal(wrongMethod.response.status, 405);
    assert.equal(wrongMethod.response.headers.get("allow"), "DELETE, OPTIONS");
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { databaseCommand, sqlLiteral } from "./helpers/database.mjs";
import { workoutId } from "./helpers/fixtures.mjs";
import { assertNoStore } from "./helpers/assertions.mjs";
import { edge, rpc } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

function historyPayload(id, label, setNumber) {
  return { workoutID: id, local_timezone: "Europe/Dublin", exercises: [{ exercise_name: label, sets: [{ reps: setNumber + 1, weight_g: setNumber * 1000, set_number: setNumber }] }] };
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

test("history is ordered, ID-free, caller-scoped, and excludes empty workouts", async () => {
  const { users } = await loadState();
  const now = Date.now();
  const aOlder = workoutId(users.a.id, { timestamp: now - 30_000, serial: 500 });
  const aNewer = workoutId(users.a.id, { timestamp: now - 10_000, serial: 501 });
  const bId = workoutId(users.b.id, { timestamp: now - 20_000, serial: 502 });
  const olderPayload = {
    workoutID: aOlder,
    local_timezone: "Europe/Dublin",
    exercises: [
      { exercise_name: "A older", sets: [{ reps: 7, weight_g: 6000, set_number: 6 }, { reps: 6, weight_g: 5000, set_number: 5 }] },
      { exercise_name: "A older second", sets: [{ reps: 5, weight_g: 4000, set_number: 4 }] },
    ],
  };
  for (const [user, payload] of [
    [users.a, historyPayload(aNewer, "A newer", 8)],
    [users.a, olderPayload],
    [users.b, historyPayload(bId, "B private", 7)],
  ]) assert.equal((await rpc("saveWorkout", user.session.accessToken, { payload })).response.status, 200);
  const emptyId = workoutId(users.a.id, { timestamp: now - 5_000, serial: 503 });
  databaseCommand(`insert into public.workouts ("workoutID", "user", start_time, end_time, local_timezone)
    values (${sqlLiteral(emptyId)}, ${sqlLiteral(users.a.id)}::uuid, to_timestamp(${now - 5_000}::double precision / 1000), clock_timestamp(), 'Etc/UTC')`);

  const result = await edge("getWorkouts", users.a.session.accessToken, { query: `?userId=${users.a.id}` });
  assert.equal(result.response.status, 200);
  assertNoStore(result);
  const selected = result.body.workouts.filter((workout) => ["A older", "A newer"].includes(workout.exercises[0]?.exercise_name));
  assert.deepEqual(selected.map((workout) => workout.exercises[0].exercise_name), ["A older", "A newer"]);
  assert.deepEqual(selected[0].exercises.map((exercise) => exercise.exercise_number), [1, 2]);
  assert.deepEqual(selected[0].exercises[0].sets.map((set) => set.set_number), [5, 6]);
  assert.deepEqual(selected.map((workout) => workout.exercises[0].sets[0].set_number), [5, 8]);
  assert.ok(!JSON.stringify(result.body).includes("B private"));
  const keys = collectKeys(selected);
  for (const forbidden of ["workoutID", "ID", "user", "exerciseID", "exercise", "machine_id"]) assert.equal(keys.has(forbidden), false);

  const direct = await rpc("getWorkouts", users.a.session.accessToken);
  assert.equal(direct.response.status, 200);
  assert.ok(!JSON.stringify(direct.body).includes("B private"));
});

test("history wrapper validates exactly one matching UUID and returns empty history", async () => {
  const { users } = await loadState();
  for (const query of ["", "?userId=invalid", `?userId=${users.a.id}&userId=${users.a.id}`]) {
    assert.equal((await edge("getWorkouts", users.a.session.accessToken, { query })).response.status, 400);
  }
  assert.equal((await edge("getWorkouts", users.a.session.accessToken, { query: `?userId=${users.b.id}` })).response.status, 403);
  const empty = await edge("getWorkouts", users.concurrent.session.accessToken, { query: `?userId=${users.concurrent.id}` });
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body, { workouts: [] });
  assert.equal((await edge("getWorkouts", users.authOnly.session.accessToken, { query: `?userId=${users.authOnly.id}` })).response.status, 403);
});

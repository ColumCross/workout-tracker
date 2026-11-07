import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSnapshot, hierarchyCounts } from "./helpers/database.mjs";
import { workoutId, workoutPayload } from "./helpers/fixtures.mjs";
import { rpc } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

test("saveWorkout atomically stores the complete normalized aggregate", async () => {
  const { users, machineId } = await loadState();
  const id = workoutId(users.a.id);
  const before = Date.now();
  const result = await rpc("saveWorkout", users.a.session.accessToken, { payload: workoutPayload(id, { machineId, prefix: "Atomic", timezone: "Europe/Dublin" }) });
  const after = Date.now();
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, [{ success: true, workoutID: id }]);
  const [saved] = aggregateSnapshot(id);
  assert.equal(saved.workout.user, users.a.id);
  assert.equal(saved.workout.local_timezone, "Europe/Dublin");
  assert.equal(Date.parse(saved.workout.start_time), Number(id.split("-", 1)[0]));
  assert.ok(Date.parse(saved.workout.end_time) >= before && Date.parse(saved.workout.end_time) <= after);
  assert.deepEqual(saved.exercises.map((item) => [item.exercise_name, item.exercise_number, item.exercise]), [["Atomic press", 1, machineId], ["Atomic row", 2, null]]);
  assert.deepEqual(saved.sets.map((item) => [item.reps, item.weight_g, item.set_number]), [[10, 80000, 1], [8, 85000, 2], [12, 0, 3]]);
  assert.ok([...saved.exercises, ...saved.sets].every((item) => item.user === users.a.id && item.workoutID === id));
});

test("duplicate retries preserve every workout, exercise, set, and timestamp field", async () => {
  const { users } = await loadState();
  const id = workoutId(users.a.id);
  const original = workoutPayload(id, { prefix: "First" });
  assert.equal((await rpc("saveWorkout", users.a.session.accessToken, { payload: original })).response.status, 200);
  const snapshot = aggregateSnapshot(id);
  const changed = workoutPayload(id, { prefix: "Changed", timezone: "Pacific/Auckland" });
  changed.exercises = [{ exercise_name: "Changed", sets: [{ reps: 1, weight_g: 1, set_number: 9 }] }];
  for (const payload of [original, changed, { workoutID: id }]) {
    const retried = await rpc("saveWorkout", users.a.session.accessToken, { payload });
    assert.equal(retried.response.status, 200);
    assert.deepEqual(aggregateSnapshot(id), snapshot);
  }
});

test("late validation failure rolls back all tables and corrected retry uses the same ID", async () => {
  const { users } = await loadState();
  const id = workoutId(users.a.id);
  const before = hierarchyCounts(users.a.id);
  const invalid = workoutPayload(id, { prefix: "Rollback" });
  invalid.exercises[1].sets[0].reps = 0;
  const failed = await rpc("saveWorkout", users.a.session.accessToken, { payload: invalid });
  assert.equal(failed.body.code, "23514");
  assert.deepEqual(aggregateSnapshot(id), []);
  assert.deepEqual(hierarchyCounts(users.a.id), before);
  assert.equal((await rpc("saveWorkout", users.a.session.accessToken, { payload: workoutPayload(id, { prefix: "Corrected" }) })).response.status, 200);
  assert.equal(aggregateSnapshot(id)[0].sets.length, 3);
});

test("concurrent valid saves serialize to one complete, unmixed candidate", async () => {
  const { users } = await loadState();
  const id = workoutId(users.a.id);
  const first = workoutPayload(id, { prefix: "Candidate A", timezone: "Etc/UTC" });
  const second = { workoutID: id, local_timezone: "Asia/Tokyo", exercises: [{ exercise_name: "Candidate B", sets: [{ reps: 3, weight_g: 4, set_number: 7 }] }] };
  const results = await Promise.all([
    rpc("saveWorkout", users.a.session.accessToken, { payload: first }),
    rpc("saveWorkout", users.a.session.accessToken, { payload: second }),
  ]);
  assert.ok(results.every(({ response }) => response.status === 200));
  const [saved] = aggregateSnapshot(id);
  const candidateA = saved.workout.local_timezone === "Etc/UTC" && saved.exercises.length === 2 && saved.sets.length === 3 && saved.exercises[0].exercise_name === "Candidate A press";
  const candidateB = saved.workout.local_timezone === "Asia/Tokyo" && saved.exercises.length === 1 && saved.sets.length === 1 && saved.sets[0].set_number === 7;
  assert.equal(candidateA || candidateB, true);
});

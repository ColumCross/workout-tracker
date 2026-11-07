import assert from "node:assert/strict";
import test from "node:test";
import { assertNoAggregate, assertRpcError } from "./helpers/assertions.mjs";
import { clone, workoutId, workoutPayload } from "./helpers/fixtures.mjs";
import { rpc } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

test("saveWorkout rejects malformed top-level and workout ID values with the intended error", async () => {
  const { users } = await loadState();
  const token = users.a.session.accessToken;
  for (const [name, payload, message] of [
    ["null payload", null, /JSON object/],
    ["array payload", [], /JSON object/],
    ["missing ID", {}, /workoutID must be a string/],
    ["numeric ID", { workoutID: 1 }, /workoutID must be a string/],
    ["malformed ID", { workoutID: "malformed" }, /timestamp-random-user format/],
    ["short random ID", workoutPayload(`${Date.now()}-123-${users.a.id}`), /timestamp-random-user format/],
    ["out-of-range timestamp", workoutPayload(`253402300800000-0000000000000001-${users.a.id}`), /outside the supported range/],
    ["future timestamp", workoutPayload(workoutId(users.a.id, { timestamp: Date.now() + 600_000, serial: 91 })), /too far in the future/],
  ]) {
    const result = await rpc("saveWorkout", token, { payload });
    assertRpcError(result, "22023", message, name);
    if (typeof payload?.workoutID === "string") assertNoAggregate(payload.workoutID);
  }
});

test("saveWorkout validates fields, nesting, numeric boundaries, and rolls back each rejection", async () => {
  const { users } = await loadState();
  const token = users.a.session.accessToken;
  const cases = [
    ["unsupported payload field", (p) => { p.extra = true; }, "22023", /unsupported fields/],
    ["missing timezone", (p) => { delete p.local_timezone; }, "23502", /local_timezone/],
    ["empty exercises", (p) => { p.exercises = []; }, "22023", /nonempty array/],
    ["wrong exercises type", (p) => { p.exercises = {}; }, "22023", /nonempty array/],
    ["nonobject exercise", (p) => { p.exercises = [null]; }, "22023", /JSON object/],
    ["exercise field", (p) => { p.exercises[0].extra = true; }, "22023", /unsupported fields/],
    ["blank name", (p) => { p.exercises[0].exercise_name = "  "; }, "22023", /nonblank string/],
    ["missing sets", (p) => { delete p.exercises[0].sets; }, "22023", /nonempty array/],
    ["nonobject set", (p) => { p.exercises[0].sets = [null]; }, "22023", /JSON object/],
    ["set field", (p) => { p.exercises[0].sets[0].extra = true; }, "22023", /unsupported fields/],
    ["string reps", (p) => { p.exercises[0].sets[0].reps = "10"; }, "22023", /positive integer/],
    ["fraction reps", (p) => { p.exercises[0].sets[0].reps = 1.5; }, "22023", /positive integer/],
    ["zero reps", (p) => { p.exercises[0].sets[0].reps = 0; }, "23514", /sets_reps_check/],
    ["negative weight", (p) => { p.exercises[0].sets[0].weight_g = -1; }, "22023", /nonnegative integer/],
    ["overflow weight", (p) => { p.exercises[0].sets[0].weight_g = 2147483648; }, "22003", /out of range/],
    ["zero set number", (p) => { p.exercises[0].sets[0].set_number = 0; }, "23514", /sets_set_number_check/],
    ["duplicate set number", (p) => { p.exercises[1].sets[0].set_number = 1; }, "23505", /sets_workoutID_set_number_key/],
    ["bad machine UUID", (p) => { p.exercises[0].machine_id = "invalid"; }, "22023", /UUID or null/],
    ["missing machine", (p) => { p.exercises[0].machine_id = "00000000-0000-0000-0000-000000000001"; }, "23503", /unavailable/],
  ];
  let serial = 200;
  for (const [name, mutate, code, message] of cases) {
    const id = workoutId(users.a.id, { serial: serial++ });
    const payload = clone(workoutPayload(id));
    mutate(payload);
    const result = await rpc("saveWorkout", token, { payload });
    assertRpcError(result, code, message);
    assertNoAggregate(id);
    assert.ok(name);
  }
});

test("saveWorkout accepts documented boundaries and rejects count limits above 100", async () => {
  const { users } = await loadState();
  const token = users.a.session.accessToken;
  const validId = workoutId(users.a.id, { serial: 300 });
  // Current RPC validation requires a non-null database value but does not validate IANA timezone text.
  const valid = { workoutID: validId, local_timezone: "", exercises: [{ exercise_name: " Boundary ", sets: [{ reps: 2147483647, weight_g: 2147483647, set_number: 2147483647 }] }] };
  assert.equal((await rpc("saveWorkout", token, { payload: valid })).response.status, 200);

  const hundredExercisesId = workoutId(users.a.id, { serial: 303 });
  const hundredExercises = {
    workoutID: hundredExercisesId,
    local_timezone: "Etc/UTC",
    exercises: Array.from({ length: 100 }, (_, index) => ({
      exercise_name: `Exercise ${index + 1}`,
      sets: [{ reps: 1, weight_g: 0, set_number: index + 1 }],
    })),
  };
  assert.equal((await rpc("saveWorkout", token, { payload: hundredExercises })).response.status, 200);

  const hundredSetsId = workoutId(users.a.id, { serial: 304 });
  const hundredSets = {
    workoutID: hundredSetsId,
    local_timezone: "Etc/UTC",
    exercises: [{
      exercise_name: "One hundred sets",
      sets: Array.from({ length: 100 }, (_, index) => ({ reps: 1, weight_g: 0, set_number: index + 1 })),
    }],
  };
  assert.equal((await rpc("saveWorkout", token, { payload: hundredSets })).response.status, 200);

  const tooManyExercisesId = workoutId(users.a.id, { serial: 301 });
  const tooManyExercises = workoutPayload(tooManyExercisesId);
  tooManyExercises.exercises = Array.from({ length: 101 }, (_, index) => ({ exercise_name: `Exercise ${index}`, sets: [{ reps: 1, weight_g: 0, set_number: index + 1 }] }));
  assertRpcError(await rpc("saveWorkout", token, { payload: tooManyExercises }), "22023", /maximum count/);
  assertNoAggregate(tooManyExercisesId);

  const tooManySetsId = workoutId(users.a.id, { serial: 302 });
  const tooManySets = workoutPayload(tooManySetsId);
  tooManySets.exercises = [{ exercise_name: "Sets", sets: Array.from({ length: 101 }, (_, index) => ({ reps: 1, weight_g: 0, set_number: index + 1 })) }];
  assertRpcError(await rpc("saveWorkout", token, { payload: tooManySets }), "22023", /maximum count/);
  assertNoAggregate(tooManySetsId);

  const oversizedId = workoutId(users.a.id, { serial: 305 });
  const oversized = workoutPayload(oversizedId);
  oversized.exercises[0].exercise_name = "x".repeat(1_048_577);
  assertRpcError(await rpc("saveWorkout", token, { payload: oversized }), "22023", /maximum size/);
  assertNoAggregate(oversizedId);
});

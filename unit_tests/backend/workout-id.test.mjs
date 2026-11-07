import assert from "node:assert/strict";
import test from "node:test";
import { hierarchyCounts } from "./helpers/database.mjs";
import { assertNoStore } from "./helpers/assertions.mjs";
import { edge, request } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

test("getWorkoutID returns unique caller-bound IDs without database writes", async () => {
  const state = await loadState();
  for (const label of ["a", "b"]) {
    const user = state.users[label];
    const before = hierarchyCounts(user.id);
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 6 }, () => edge("getWorkoutID", user.session.accessToken)));
    const finished = Date.now();
    assert.ok(results.every(({ response }) => response.status === 200));
    assert.equal(new Set(results.map(({ body }) => body.workoutID)).size, results.length);
    for (const result of results) {
      assertNoStore(result);
      assert.match(result.body.workoutID, new RegExp(`^[0-9]{1,16}-[0-9]{16}-${user.id}$`, "i"));
      const timestamp = Number(result.body.workoutID.split("-", 1)[0]);
      assert.ok(timestamp >= started - 1_000 && timestamp <= finished + 1_000);
    }
    assert.deepEqual(hierarchyCounts(user.id), before);
  }
});

test("getWorkoutID rejects absent, invalid, Auth-only, and wrong-method callers", async () => {
  const state = await loadState();
  assert.equal((await request("/functions/v1/getWorkoutID")).response.status, 401);
  assert.equal((await edge("getWorkoutID", "invalid-token")).response.status, 401);
  const memberDenied = await edge("getWorkoutID", state.users.authOnly.session.accessToken);
  assert.equal(memberDenied.response.status, 403);
  assertNoStore(memberDenied);
  const wrongMethod = await edge("getWorkoutID", state.users.a.session.accessToken, { method: "POST" });
  assert.equal(wrongMethod.response.status, 405);
  assert.equal(wrongMethod.response.headers.get("allow"), "GET, OPTIONS");
  const preflight = await request("/functions/v1/getWorkoutID", {
    method: "OPTIONS",
    headers: { Origin: "http://127.0.0.1:3000", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,apikey" },
  });
  assert.ok([200, 204].includes(preflight.response.status));
  assert.ok(preflight.response.headers.get("access-control-allow-methods")?.includes("GET"));
});

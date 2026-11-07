import assert from "node:assert/strict";
import test from "node:test";
import { databaseRows, sqlLiteral } from "./helpers/database.mjs";
import { assertNoStore } from "./helpers/assertions.mjs";
import { edge, rpc } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

test("EULA acknowledgement uses server time, updates only the caller, and reads back exactly", async () => {
  const { users } = await loadState();
  const initial = await edge("getUserEULAStatus", users.a.session.accessToken);
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.body, { eulaAcknowledged: false });
  const before = Date.now();
  const accepted = await edge("acknowledgeEULA", users.a.session.accessToken, { method: "POST" });
  const after = Date.now();
  assert.equal(accepted.response.status, 200);
  assertNoStore(accepted);
  assert.ok(accepted.body.eulaAcknowledged >= before && accepted.body.eulaAcknowledged <= after);
  assert.deepEqual((await edge("getUserEULAStatus", users.a.session.accessToken)).body, accepted.body);
  assert.equal(databaseRows(`select eula_acknowledged from public.users where "user" = ${sqlLiteral(users.b.id)}::uuid`)[0].eula_acknowledged, null);

  await new Promise((resolve) => setTimeout(resolve, 2));
  const repeated = await rpc("acknowledgeEULA", users.a.session.accessToken);
  assert.equal(repeated.response.status, 200);
  assert.ok(repeated.body >= accepted.body.eulaAcknowledged);
});

test("EULA paths reject anonymous, invalid, Auth-only, and unsupported methods", async () => {
  const { users } = await loadState();
  for (const name of ["getUserEULAStatus", "acknowledgeEULA"]) {
    assert.equal((await edge(name, "invalid-token", { method: name === "acknowledgeEULA" ? "POST" : "GET" })).response.status, 401);
    assert.equal((await edge(name, users.authOnly.session.accessToken, { method: name === "acknowledgeEULA" ? "POST" : "GET" })).response.status, 403);
  }
  const wrongGet = await edge("getUserEULAStatus", users.a.session.accessToken, { method: "POST" });
  const wrongPost = await edge("acknowledgeEULA", users.a.session.accessToken, { method: "GET" });
  assert.equal(wrongGet.response.status, 405);
  assert.equal(wrongPost.response.status, 405);
  assert.equal((await rpc("getUserEULAStatus", users.authOnly.session.accessToken)).response.status, 403);
});

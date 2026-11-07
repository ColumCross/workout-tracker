import assert from "node:assert/strict";
import { aggregateSnapshot } from "./database.mjs";

export function assertRpcError(result, code, messagePattern, label = "RPC rejection") {
  assert.notEqual(result.response.status, 200, label);
  assert.equal(result.body?.code, code, label);
  if (messagePattern) assert.match(result.body?.message ?? "", messagePattern, label);
}

export function assertNoAggregate(id) {
  assert.deepEqual(aggregateSnapshot(id), []);
}

export function assertNoStore(result) {
  assert.equal(result.response.headers.get("cache-control"), "no-store");
}

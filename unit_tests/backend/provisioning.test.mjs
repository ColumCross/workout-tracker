import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { repositoryRoot } from "./helpers/config.mjs";

const syntheticId = "11111111-1111-4111-8111-111111111111";

async function withProvisioningServer({ profileStatus = 201, deleteStatus = 204 }, assertion) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, path: request.url, body, authorization: request.headers.authorization });
    if (request.method === "POST" && request.url === "/auth/v1/admin/users") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: syntheticId }));
      return;
    }
    if (request.method === "POST" && request.url === "/rest/v1/users") {
      response.writeHead(profileStatus, { "Content-Type": "application/json" });
      response.end(profileStatus < 300 ? JSON.stringify({}) : JSON.stringify({ message: "profile rejected" }));
      return;
    }
    if (request.method === "DELETE" && request.url === `/auth/v1/admin/users/${syntheticId}`) {
      response.writeHead(deleteStatus, { "Content-Type": "application/json" });
      response.end(deleteStatus < 300 ? JSON.stringify({}) : JSON.stringify({ message: "rollback rejected" }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    const child = spawn(process.execPath, ["scripts/provision-user.mjs", "synthetic@example.test", "Synthetic User"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${address.port}`,
        SUPABASE_SECRET_KEY: "synthetic-admin-key",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const [status] = await once(child, "close");
    const result = { status, stdout, stderr };
    await assertion(result, requests);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("provisioning creates a confirmed Auth identity and matching profile", async () => {
  await withProvisioningServer({}, (result, requests) => {
    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(syntheticId));
    assert.deepEqual(requests.map(({ method, path }) => [method, path]), [
      ["POST", "/auth/v1/admin/users"],
      ["POST", "/rest/v1/users"],
    ]);
    assert.deepEqual(JSON.parse(requests[0].body), { email: "synthetic@example.test", email_confirm: true });
    assert.deepEqual(JSON.parse(requests[1].body), { user: syntheticId, name: "Synthetic User" });
    assert.ok(requests.every(({ authorization }) => authorization === "Bearer synthetic-admin-key"));
  });
});

test("profile failure removes the newly created Auth identity", async () => {
  await withProvisioningServer({ profileStatus: 409 }, (result, requests) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Rollback succeeded/);
    assert.deepEqual(requests.map(({ method }) => method), ["POST", "POST", "DELETE"]);
  });
});

test("a failed rollback reports the orphaned Auth identity", async () => {
  await withProvisioningServer({ profileStatus: 409, deleteStatus: 503 }, (result, requests) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /orphaned/);
    assert.match(result.stderr, new RegExp(syntheticId));
    assert.deepEqual(requests.map(({ method }) => method), ["POST", "POST", "DELETE"]);
  });
});

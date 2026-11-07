import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { databaseCommand, databaseRows, sqlLiteral } from "../helpers/database.mjs";
import { localConfig, repositoryRoot } from "../helpers/config.mjs";
import { request } from "../helpers/http.mjs";

const command = process.argv[2];
const email = process.env.GOOGLE_SMOKE_EMAIL?.trim().toLowerCase();
const directory = resolve(tmpdir(), "workout-tracker-google-smoke");
const statePath = resolve(directory, "state.json");
const sessionPath = resolve(directory, "session.json");

if (!email || !email.includes("@")) throw new Error("Set GOOGLE_SMOKE_EMAIL to the account selected during Google login.");
if (!["prepare", "login", "repeat", "cleanup"].includes(command)) throw new Error("Usage: run.mjs prepare|login|repeat|cleanup");

function authUsers() {
  return databaseRows(`select id, email from auth.users where lower(email) = ${sqlLiteral(email)}`);
}

function googleIdentities(id) {
  return databaseRows(`select id, user_id from auth.identities where user_id = ${sqlLiteral(id)}::uuid and provider = 'google' order by id`);
}

async function loadState() {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(state.email, email, "Smoke state belongs to another email.");
  return state;
}

async function prepare() {
  const config = localConfig();
  assert.deepEqual(authUsers(), [], "Refusing to modify an existing Auth user.");
  execFileSync(process.execPath, ["scripts/provision-user.mjs", email, "Google smoke user"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SUPABASE_URL: config.url,
      SUPABASE_SECRET_KEY: config.serviceRoleKey,
    },
    stdio: "inherit",
  });
  const [user] = authUsers();
  assert.ok(user?.id);
  assert.deepEqual(googleIdentities(user.id), []);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(statePath, `${JSON.stringify({ email, id: user.id })}\n`, { mode: 0o600 });
  console.log(`Prepared synthetic Google smoke fixture ${user.id}.`);
}

async function authenticate(expectedIdentityCount) {
  const state = await loadState();
  assert.equal(googleIdentities(state.id).length, expectedIdentityCount);
  await rm(sessionPath, { force: true });
  try {
    execFileSync(process.execPath, ["--env-file=.env", "scripts/local-google-login.mjs", "--out", sessionPath, "--timeout", "300"], {
      cwd: repositoryRoot,
      stdio: "inherit",
      timeout: 360_000,
    });
    const environment = JSON.parse(await readFile(sessionPath, "utf8"));
    const values = Object.fromEntries(environment.variables.map(({ name, value }) => [name, value]));
    assert.equal(values.supabase_user_id, state.id);
    const current = await request("/auth/v1/user", {}, { accessToken: values.supabase_access_token });
    assert.equal(current.response.status, 200);
    assert.equal(current.body.id, state.id);
    assert.equal(current.body.email?.toLowerCase(), email);
    assert.equal(googleIdentities(state.id).length, 1);
    assert.equal(authUsers().length, 1);
  } finally {
    await rm(sessionPath, { force: true });
  }
}

async function cleanup() {
  const state = await loadState();
  const [user] = authUsers();
  assert.equal(user?.id, state.id, "Fixture identity changed; cleanup stopped.");
  databaseCommand(`delete from public.sets where "user" = ${sqlLiteral(state.id)}::uuid;
    delete from public.exercises where "user" = ${sqlLiteral(state.id)}::uuid;
    delete from public.workouts where "user" = ${sqlLiteral(state.id)}::uuid;
    delete from public.users where "user" = ${sqlLiteral(state.id)}::uuid;`);
  const removed = await request(`/auth/v1/admin/users/${state.id}`, { method: "DELETE" }, { service: true });
  assert.ok(removed.response.ok || removed.response.status === 404);
  await rm(dirname(statePath), { recursive: true, force: true });
}

if (command === "prepare") await prepare();
else if (command === "login") await authenticate(0);
else if (command === "repeat") await authenticate(1);
else await cleanup();

import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { brunoEnvironmentPath, localConfig, runtimeStatePath } from "./config.mjs";
import { databaseCommand, sqlLiteral } from "./database.mjs";
import { createSession, json, request } from "./http.mjs";

async function persist(state) {
  const path = runtimeStatePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function createAuthUser(email) {
  const result = await request("/auth/v1/admin/users", json("POST", { email, email_confirm: true }), { service: true });
  if (!result.response.ok || !result.body?.id) throw new Error(`Fixture Auth creation failed (${result.response.status}).`);
  return result.body.id;
}

function base64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function expiredToken(user, secret, issuer) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const payload = base64Url({
    aud: "authenticated",
    exp: now - 60,
    iat: now - 3600,
    iss: `${issuer}/auth/v1`,
    role: "authenticated",
    sub: user.id,
    email: user.email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    session_id: randomUUID(),
    is_anonymous: false,
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

async function writeBrunoEnvironment(state) {
  const config = localConfig();
  const missingMachineId = randomUUID();
  const authOnlyWorkoutId = `${Date.now()}-9999999999999999-${state.users.authOnly.id}`;
  const values = {
    base_url: config.url,
    publishable_key: config.anonKey,
    user_a_id: state.users.a.id,
    user_b_id: state.users.b.id,
    auth_only_user_id: state.users.authOnly.id,
    bulk_user_id: state.users.bulk.id,
    delete_user_id: state.users.delete.id,
    shared_machine_id: state.machineId,
    missing_machine_id: missingMachineId,
    signup_email: `rejected-${state.runId}@example.test`,
    signup_password: "Synthetic-password-123",
    signup_phone: "+15555550199",
    workout_id_a: "",
    workout_id_b: "",
    rollback_workout_id: "",
    validation_workout_id: "",
    bulk_workout_id: "",
    delete_workout_id: "",
    auth_only_workout_id: authOnlyWorkoutId,
    exercise_id_a: "",
    eula_first_timestamp: "",
    eula_second_timestamp: "",
    revoked_refresh_token_a: "",
    revoked_refresh_token_b: "",
    access_token_a: state.users.a.session.accessToken,
    refresh_token_a: state.users.a.session.refreshToken,
    access_token_b: state.users.b.session.accessToken,
    refresh_token_b: state.users.b.session.refreshToken,
    auth_only_access_token: state.users.authOnly.session.accessToken,
    bulk_access_token: state.users.bulk.session.accessToken,
    delete_access_token: state.users.delete.session.accessToken,
    invalid_token: "not-a-jwt",
    expired_token: expiredToken(state.users.authOnly, config.jwtSecret, config.url),
  };
  const secretNames = new Set([
    "signup_password",
    "access_token_a",
    "refresh_token_a",
    "access_token_b",
    "refresh_token_b",
    "auth_only_access_token",
    "bulk_access_token",
    "delete_access_token",
    "invalid_token",
    "expired_token",
    "revoked_refresh_token_a",
    "revoked_refresh_token_b",
  ]);
  const path = brunoEnvironmentPath();
  await writeFile(path, `${JSON.stringify({
    name: "workout-tracker-local-runtime",
    variables: Object.entries(values).map(([name, value]) => ({ name, value: String(value), enabled: true, secret: secretNames.has(name) })),
  }, null, 2)}\n`, { mode: 0o600 });
  state.brunoEnvironmentPath = path;
  await persist(state);
}

export async function setupFixtures() {
  const path = runtimeStatePath();
  try {
    await readFile(path, "utf8");
    throw new Error(`Existing fixture journal found at ${path}; run cleanup.mjs before setup.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const runId = randomUUID();
  const state = { version: 1, runId, machineId: null, users: {} };
  await persist(state);
  const definitions = [
    ["a", true], ["b", true], ["authOnly", false], ["bulk", true], ["delete", true], ["concurrent", true],
  ];

  for (const [label, member] of definitions) {
    const email = `backend-${label}-${runId}@example.test`;
    const id = await createAuthUser(email);
    state.users[label] = { id, email, member, session: null };
    await persist(state);
    if (member) {
      databaseCommand(`insert into public.users ("user", name, weight_g, height_cm) values (${sqlLiteral(id)}::uuid, ${sqlLiteral(`Synthetic ${label}`)}, 70000, 170)`);
    }
  }

  state.machineId = databaseCommand('insert into public.machines default values returning "ID"');
  await persist(state);
  for (const user of Object.values(state.users)) {
    user.session = await createSession(user.email);
    await persist(state);
  }
  await writeBrunoEnvironment(state);
  return state;
}

export async function cleanupFixtures() {
  const path = runtimeStatePath();
  let state;
  try { state = JSON.parse(await readFile(path, "utf8")); } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  const failures = [];
  const ids = Object.values(state.users ?? {}).map((user) => user.id).filter(Boolean);
  for (const id of ids) {
    try {
      databaseCommand(`delete from public.sets where "user" = ${sqlLiteral(id)}::uuid;
        delete from public.exercises where "user" = ${sqlLiteral(id)}::uuid;
        delete from public.workouts where "user" = ${sqlLiteral(id)}::uuid;
        delete from public.users where "user" = ${sqlLiteral(id)}::uuid;`);
    } catch (error) { failures.push(`database cleanup for ${id}: ${error.message}`); }
  }
  if (state.machineId) {
    try { databaseCommand(`delete from public.machines where "ID" = ${sqlLiteral(state.machineId)}::uuid`); }
    catch (error) { failures.push(`machine cleanup: ${error.message}`); }
  }
  for (const id of ids) {
    try {
      const result = await request(`/auth/v1/admin/users/${id}`, { method: "DELETE" }, { service: true });
      if (!result.response.ok && result.response.status !== 404) failures.push(`Auth cleanup for ${id}: HTTP ${result.response.status}`);
    } catch (error) { failures.push(`Auth cleanup for ${id}: ${error.message}`); }
  }

  if (failures.length) {
    state.cleanupFailures = failures;
    await persist(state);
    throw new AggregateError(failures.map((message) => new Error(message)), `Cleanup incomplete; journal retained at ${path}.`);
  }
  await rm(dirname(path), { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { repositoryRoot } from "./helpers/config.mjs";
import { databaseRows, sqlLiteral } from "./helpers/database.mjs";
import { json, request } from "./helpers/http.mjs";
import { loadState } from "./helpers/state.mjs";

test("versioned Auth configuration permits only provisioned Google identities", async () => {
  const config = await readFile(`${repositoryRoot}/supabase/config.toml`, "utf8");
  assert.match(config, /\[auth\][\s\S]*?enable_signup = false/);
  assert.match(config, /\[auth\][\s\S]*?enable_anonymous_sign_ins = false/);
  assert.match(config, /\[auth\.email\][\s\S]*?enable_signup = false/);
  assert.match(config, /\[auth\.sms\][\s\S]*?enable_signup = false/);
  const redirects = config.match(/additional_redirect_urls\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  for (const required of ["http://127.0.0.1:8081/auth/callback", "http://localhost:8081/auth/callback", "workouttracker://auth/callback"]) {
    assert.ok(redirects.includes(`"${required}"`), required);
  }
  const google = config.split("[auth.external.google]", 2)[1].split("[auth.web3.solana]", 1)[0];
  assert.match(google, /enabled = true/);
  assert.match(google, /client_id = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID\)"/);
  assert.match(google, /secret = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET\)"/);

  const template = await readFile(`${repositoryRoot}/.env.example`, "utf8");
  assert.match(template, /^SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=""$/m);
  assert.match(template, /^SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=""$/m);
});

test("runtime Auth settings reject signup and generated sessions retain fixture UUIDs", async () => {
  const state = await loadState();
  const settings = await request("/auth/v1/settings");
  assert.equal(settings.response.status, 200);
  assert.equal(settings.body.disable_signup, true);

  for (const label of ["a", "b", "authOnly"]) {
    const fixture = state.users[label];
    const current = await request("/auth/v1/user", {}, { accessToken: fixture.session.accessToken });
    assert.equal(current.response.status, 200);
    assert.equal(current.body.id, fixture.id);
    assert.equal(current.body.email?.toLowerCase(), fixture.email.toLowerCase());
  }

  const email = `rejected-${randomUUID()}@example.test`;
  const rejected = await request("/auth/v1/signup", json("POST", { email, password: "Synthetic-password-123" }));
  assert.notEqual(rejected.response.status, 200);
  assert.deepEqual(databaseRows(`select id from auth.users where email = ${sqlLiteral(email)}`), []);
});

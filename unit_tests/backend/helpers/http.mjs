import { localConfig } from "./config.mjs";

export async function request(path, options = {}, { accessToken, service = false } = {}) {
  const config = localConfig();
  const key = service ? config.serviceRoleKey : config.anonKey;
  const response = await fetch(new URL(path, config.url), {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken ?? key}`,
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

export function json(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function rpc(name, accessToken, body = {}) {
  return request(`/rest/v1/rpc/${name}`, json("POST", body), { accessToken });
}

export function edge(name, accessToken, { method = "GET", query = "" } = {}) {
  return request(`/functions/v1/${name}${query}`, { method }, { accessToken });
}

export async function createSession(email) {
  const link = await request("/auth/v1/admin/generate_link", json("POST", { type: "magiclink", email }), { service: true });
  if (!link.response.ok || !link.body?.hashed_token) throw new Error(`Could not generate a local session (${link.response.status}).`);
  const session = await request("/auth/v1/verify", json("POST", { type: "magiclink", token_hash: link.body.hashed_token }));
  if (!session.response.ok || !session.body?.access_token) {
    throw new Error(`Could not verify a local session (${session.response.status}).`);
  }
  return { accessToken: session.body.access_token, refreshToken: session.body.refresh_token };
}

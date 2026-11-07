import type { Session } from "@supabase/supabase-js";

import { getSupabase } from "@/lib/supabase";

export async function getUserEULAStatus() {
  const body = await requestPrivacyAPI("getUserEULAStatus", "GET");
  const acknowledged = body.eulaAcknowledged;
  if (acknowledged !== false && typeof acknowledged !== "number") {
    throw new Error("The server returned an unexpected EULA status.");
  }
  return acknowledged;
}

export async function acknowledgeEULA() {
  const body = await requestPrivacyAPI("acknowledgeEULA", "POST");
  const acknowledged = body.eulaAcknowledged;
  if (typeof acknowledged !== "number") throw new Error("The server returned an unexpected acknowledgement response.");
  return acknowledged;
}

export async function deleteUser() {
  const body = await requestPrivacyAPI("deleteUser", "DELETE");
  if (body.success !== true) throw new Error("The server did not confirm account deletion.");
}

async function requestPrivacyAPI(functionName: string, method: "GET" | "POST" | "DELETE") {
  const supabase = getSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Sign in again before continuing.");

  let response = await request(functionName, method, session);
  if (response.status === 401) {
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !data.session) throw new Error("Your session has expired. Sign in again.");
    response = await request(functionName, method, data.session);
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "Unable to complete the request.");
  }
  if (!body) throw new Error("The server returned an unreadable response.");
  return body;
}

function request(functionName: string, method: "GET" | "POST" | "DELETE", session: Session) {
  return fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  });
}

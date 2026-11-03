import { withSupabase } from "npm:@supabase/server@1";
import postgres from "npm:postgres@3.4.7";

// Server-only connection. Callers cannot read public.users directly. The lookup
// below is parameterized and scoped exclusively to the validated session UUID.
const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
const sql = databaseUrl
  ? postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 20 })
  : null;

function randomDigits(length: number): string {
  let result = "";

  while (result.length < length) {
    const values = crypto.getRandomValues(new Uint8Array(32));

    for (const value of values) {
      // Reject the final six byte values so modulo ten is unbiased.
      if (value < 250) {
        result += String(value % 10);
      }

      if (result.length === length) {
        return result;
      }
    }
  }

  return result;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "GET") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: "GET, OPTIONS" } },
      );
    }

    const userId = context.userClaims?.id;
    if (!userId) {
      return Response.json({ error: "Authentication is required" }, { status: 401 });
    }

    try {
      if (!sql) throw new Error("Membership lookup is not configured");
      const [membership] = await sql`
        select exists(select 1 from public.users where "user" = ${userId}::uuid) as allowed
      `;
      if (!membership.allowed) {
        return Response.json(
          { error: "The authenticated user is not provisioned" },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      }
    } catch {
      // Fail closed without exposing database configuration or credentials.
      return Response.json(
        { error: "Unable to verify application membership" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const workoutID = `${Date.now()}-${randomDigits(16)}-${userId}`;

    return Response.json(
      { workoutID },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
};

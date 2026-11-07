import { withSupabase } from "npm:@supabase/server@1";

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: "POST, OPTIONS" } },
      );
    }

    const { data, error } = await context.supabase.rpc("acknowledgeEULA");
    if (error || typeof data !== "number") {
      const status = error?.code === "42501" || error?.code === "PT403" ? 403 : 503;
      return Response.json(
        { error: status === 403 ? "The authenticated user is not provisioned" : "Unable to acknowledge the EULA" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { eulaAcknowledged: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
};

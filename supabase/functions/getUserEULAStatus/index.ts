import { withSupabase } from "npm:@supabase/server@1";

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "GET") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: "GET, OPTIONS" } },
      );
    }

    const { data, error } = await context.supabase.rpc("getUserEULAStatus");
    if (error) {
      const status = error.code === "42501" || error.code === "PT403" ? 403 : 503;
      return Response.json(
        { error: status === 403 ? "The authenticated user is not provisioned" : "Unable to retrieve EULA status" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { eulaAcknowledged: data ?? false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
};

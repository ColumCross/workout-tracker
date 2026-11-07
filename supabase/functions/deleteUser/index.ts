import { withSupabase } from "npm:@supabase/server@1";

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "DELETE") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: "DELETE, OPTIONS" } },
      );
    }

    const { data, error } = await context.supabase.rpc("deleteUser");
    if (error || data !== true) {
      const status = error?.code === "42501" || error?.code === "PT403" ? 403 : 503;
      return Response.json(
        { error: status === 403 ? "The authenticated user is not provisioned" : "Unable to delete user data" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  }),
};

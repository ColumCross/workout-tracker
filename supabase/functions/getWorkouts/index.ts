import { withSupabase } from "npm:@supabase/server@1";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "GET") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: "GET, OPTIONS" } },
      );
    }

    const userIds = new URL(request.url).searchParams.getAll("userId");
    const userId = userIds[0];
    const authenticatedUserId = context.userClaims?.id;

    if (userIds.length !== 1 || !userId || !uuidPattern.test(userId)) {
      return Response.json(
        { error: "userId must be one UUID" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!authenticatedUserId) {
      return Response.json(
        { error: "Authentication is required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (userId !== authenticatedUserId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data, error } = await context.supabase.rpc("getWorkouts");

    if (error) {
      const status = error.code === "42501" || error.code === "PT403" ? 403 : 503;
      const message = status === 403
        ? "The authenticated user is not provisioned"
        : "Unable to retrieve workouts";

      return Response.json(
        { error: message },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { workouts: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
};

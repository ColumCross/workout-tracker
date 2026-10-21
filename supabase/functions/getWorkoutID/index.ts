import { withSupabase } from "npm:@supabase/server@1";

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
  fetch: withSupabase({ auth: "user" }, (request, context) => {
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

    const workoutID = `${Date.now()}-${randomDigits(16)}-${userId}`;

    return Response.json(
      { workoutID },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
};

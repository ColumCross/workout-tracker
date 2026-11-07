import { getSupabase } from "@/lib/supabase";
import { getWorkoutID, getWorkouts, supabaseWorkoutGateway } from "@/features/workout/workoutGateway";
import type { WorkoutPreview } from "@/features/workout/viewModel";

jest.mock("@/lib/supabase", () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = jest.mocked(getSupabase);
const userID = "11111111-1111-4111-8111-111111111111";

function session(token = "token", id = userID) {
  return { access_token: token, user: { id } } as never;
}

function response(status: number, body: unknown, readable = true) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: readable ? jest.fn().mockResolvedValue(body) : jest.fn().mockRejectedValue(new Error("bad json")),
  } as never;
}

const snapshot: WorkoutPreview = {
  localKey: "workout-local",
  workoutID: `1793700000000-1234567890123456-${userID}`,
  ownerID: userID,
  localTimezone: "Europe/Dublin",
  stage: "summary",
  exercises: [
    { localKey: "exercise-1", displayName: "Bench press", sets: [{ localKey: "set-1", reps: 10, weight: 60.125 }] },
    { localKey: "exercise-2", displayName: "Row", sets: [{ localKey: "set-2", reps: 8, weight: 0 }, { localKey: "set-3", reps: 7, weight: 12.3456 }] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe("workout save gateway", () => {
  test.each([
    { success: true, workoutID: snapshot.workoutID },
    [{ success: true, workoutID: snapshot.workoutID }],
  ])("maps the aggregate and accepts a confirmed result", async (rpcResult) => {
    const rpc = jest.fn().mockResolvedValue({ data: rpcResult, error: null });
    mockGetSupabase.mockReturnValue({ rpc } as never);

    await expect(supabaseWorkoutGateway.saveWorkout(snapshot)).resolves.toEqual({ kind: "saved", reference: snapshot.workoutID });
    expect(rpc).toHaveBeenCalledWith("saveWorkout", {
      payload: {
        workoutID: snapshot.workoutID,
        local_timezone: "Europe/Dublin",
        exercises: [
          { exercise_name: "Bench press", machine_id: null, sets: [{ reps: 10, weight_g: 60125, set_number: 1 }] },
          { exercise_name: "Row", machine_id: null, sets: [{ reps: 8, weight_g: 0, set_number: 2 }, { reps: 7, weight_g: 12346, set_number: 3 }] },
        ],
      },
    });
  });

  test("passes through RPC errors", async () => {
    const failure = new Error("save unavailable");
    mockGetSupabase.mockReturnValue({ rpc: jest.fn().mockResolvedValue({ data: null, error: failure }) } as never);
    await expect(supabaseWorkoutGateway.saveWorkout(snapshot)).rejects.toBe(failure);
  });

  test.each([
    null,
    { success: false, workoutID: snapshot.workoutID },
    { success: true, workoutID: "another-id" },
  ])("rejects an unconfirmed response %#", async (data) => {
    mockGetSupabase.mockReturnValue({ rpc: jest.fn().mockResolvedValue({ data, error: null }) } as never);
    await expect(supabaseWorkoutGateway.saveWorkout(snapshot)).rejects.toThrow("did not confirm");
  });
});

describe("workout ID gateway", () => {
  test("uses the current session and public headers", async () => {
    mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session() } }) } } as never);
    jest.mocked(fetch).mockResolvedValue(response(200, { workoutID: snapshot.workoutID }));

    await expect(getWorkoutID()).resolves.toBe(snapshot.workoutID);
    expect(fetch).toHaveBeenCalledWith("https://test.supabase.invalid/functions/v1/getWorkoutID", {
      method: "GET",
      headers: { Authorization: "Bearer token", apikey: "test-public-key" },
    });
  });

  test("does not call the API without a session", async () => {
    mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) } } as never);
    await expect(getWorkoutID()).rejects.toThrow("Sign in again");
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    [response(403, { error: "Not a member" }), "Not a member"],
    [response(401, { error: "Session expired" }), "Session expired"],
    [response(200, {}), "Unable to start"],
    [response(503, null, false), "Unable to start"],
  ])("handles invalid ID response %#", async (apiResponse, message) => {
    const refreshSession = jest.fn();
    mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session() } }), refreshSession } } as never);
    jest.mocked(fetch).mockResolvedValue(apiResponse);
    await expect(getWorkoutID()).rejects.toThrow(message);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("reports gateway", () => {
  const report = { start_time: "2026-11-03T10:00:00Z", end_time: "2026-11-03T11:00:00Z", local_timezone: "Europe/Dublin", exercises: [] };

  test("encodes the caller ID and returns the report envelope", async () => {
    const encodedID = "user/with?reserved";
    mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session("first", encodedID) }, error: null }) } } as never);
    jest.mocked(fetch).mockResolvedValue(response(200, { workouts: [report] }));
    await expect(getWorkouts()).resolves.toEqual([report]);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`userId=${encodeURIComponent(encodedID)}`), expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer first", apikey: "test-public-key" } }));
  });

  test("refreshes exactly once after 401", async () => {
    const refreshSession = jest.fn().mockResolvedValue({ data: { session: session("refreshed") }, error: null });
    mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session("old") }, error: null }), refreshSession } } as never);
    jest.mocked(fetch).mockResolvedValueOnce(response(401, { error: "expired" })).mockResolvedValueOnce(response(200, { workouts: [] }));
    await expect(getWorkouts()).resolves.toEqual([]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(jest.mocked(fetch).mock.calls[1][1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer refreshed" }) }));
  });

  test.each([
    [response(200, null, false), "unreadable reports"],
    [response(200, {}), "unexpected reports"],
    [response(503, { message: "History unavailable" }), "History unavailable"],
    [response(503, {}), "Unable to load reports"],
  ])("rejects malformed and failed report response %#", async (apiResponse, message) => {
    mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session() }, error: null }) } } as never);
    jest.mocked(fetch).mockResolvedValue(apiResponse);
    await expect(getWorkouts()).rejects.toThrow(message);
  });

  test("rejects refresh failure and a second 401", async () => {
    const auth = { getSession: jest.fn().mockResolvedValue({ data: { session: session() }, error: null }), refreshSession: jest.fn().mockResolvedValue({ data: { session: session("new") }, error: null }) };
    mockGetSupabase.mockReturnValue({ auth } as never);
    jest.mocked(fetch).mockResolvedValue(response(401, {}));
    await expect(getWorkouts()).rejects.toThrow("session has expired");
    expect(fetch).toHaveBeenCalledTimes(2);

    auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error("refresh failed") } as never);
    jest.mocked(fetch).mockClear().mockResolvedValue(response(401, {}));
    await expect(getWorkouts()).rejects.toThrow("session has expired");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

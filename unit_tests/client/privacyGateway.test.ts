import { getSupabase } from "@/lib/supabase";
import { acknowledgeEULA, deleteUser, getUserEULAStatus } from "@/features/privacy/privacyGateway";

jest.mock("@/lib/supabase", () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = jest.mocked(getSupabase);

function response(status: number, body: unknown, readable = true) {
  return { ok: status >= 200 && status < 300, status, json: readable ? jest.fn().mockResolvedValue(body) : jest.fn().mockRejectedValue(new Error("bad json")) } as never;
}

function session(token = "token") {
  return { access_token: token, user: { id: "11111111-1111-4111-8111-111111111111" } };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session() }, error: null }), refreshSession: jest.fn() } } as never);
});

test.each([false, 1793480400000])("accepts valid acknowledgement status %p", async (status) => {
  jest.mocked(fetch).mockResolvedValue(response(200, { eulaAcknowledged: status }));
  await expect(getUserEULAStatus()).resolves.toBe(status);
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/getUserEULAStatus$/), expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer token", apikey: "test-public-key" } }));
});

test("uses the operation methods and validates successful responses", async () => {
  jest.mocked(fetch)
    .mockResolvedValueOnce(response(200, { eulaAcknowledged: 1793480400000 }))
    .mockResolvedValueOnce(response(200, { success: true }));
  await expect(acknowledgeEULA()).resolves.toBe(1793480400000);
  await expect(deleteUser()).resolves.toBeUndefined();
  expect(jest.mocked(fetch).mock.calls.map((call) => (call[1] as RequestInit).method)).toEqual(["POST", "DELETE"]);
});

test.each([
  [getUserEULAStatus, { eulaAcknowledged: "yes" }, "unexpected EULA"],
  [acknowledgeEULA, { eulaAcknowledged: false }, "unexpected acknowledgement"],
  [deleteUser, { success: false }, "did not confirm"],
])("validates operation response %#", async (operation, body, message) => {
  jest.mocked(fetch).mockResolvedValue(response(200, body));
  await expect(operation()).rejects.toThrow(message);
});

test("refreshes once on 401 and uses the refreshed bearer", async () => {
  const refreshSession = jest.fn().mockResolvedValue({ data: { session: session("new-token") }, error: null });
  mockGetSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session("old-token") }, error: null }), refreshSession } } as never);
  jest.mocked(fetch).mockResolvedValueOnce(response(401, {})).mockResolvedValueOnce(response(200, { eulaAcknowledged: false }));
  await expect(getUserEULAStatus()).resolves.toBe(false);
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(jest.mocked(fetch).mock.calls[1][1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer new-token" }) }));
});

test("reports session, refresh, unreadable, and API failures", async () => {
  mockGetSupabase.mockReturnValueOnce({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }) } } as never);
  await expect(getUserEULAStatus()).rejects.toThrow("Sign in again");

  const refreshSession = jest.fn().mockResolvedValue({ data: { session: null }, error: new Error("expired") });
  mockGetSupabase.mockReturnValueOnce({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session() }, error: null }), refreshSession } } as never);
  jest.mocked(fetch).mockResolvedValueOnce(response(401, {}));
  await expect(getUserEULAStatus()).rejects.toThrow("session has expired");

  jest.mocked(fetch).mockResolvedValueOnce(response(503, { error: "Service unavailable" }));
  await expect(getUserEULAStatus()).rejects.toThrow("Service unavailable");

  jest.mocked(fetch).mockResolvedValueOnce(response(200, null, false));
  await expect(getUserEULAStatus()).rejects.toThrow("unreadable response");
});

test("does not refresh repeatedly and preserves network failures", async () => {
  const refreshSession = jest.fn().mockResolvedValue({ data: { session: session("new-token") }, error: null });
  mockGetSupabase.mockReturnValueOnce({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: session() }, error: null }), refreshSession } } as never);
  jest.mocked(fetch).mockResolvedValue(response(401, {}));
  await expect(getUserEULAStatus()).rejects.toThrow("Unable to complete the request");
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);

  const networkError = new Error("network offline");
  jest.mocked(fetch).mockReset().mockRejectedValue(networkError);
  await expect(getUserEULAStatus()).rejects.toBe(networkError);
});

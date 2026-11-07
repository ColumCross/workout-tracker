const mockCreateClient = jest.fn();
const mockAddEventListener = jest.fn();

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.invalid";
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  jest.doMock("@supabase/supabase-js", () => ({ createClient: mockCreateClient }));
  jest.doMock("react-native", () => ({ AppState: { addEventListener: mockAddEventListener } }));
});

test("configures persisted refreshable Auth and follows application activity", () => {
  const client = { auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() } };
  mockCreateClient.mockReturnValue(client);
  let onAppStateChange!: (state: string) => void;
  mockAddEventListener.mockImplementation((_event: string, callback: (state: string) => void) => {
    onAppStateChange = callback;
    return { remove: jest.fn() };
  });
  const { getSupabase } = require("../../client/src/lib/supabase") as typeof import("@/lib/supabase");

  expect(getSupabase()).toBe(client);
  expect(mockCreateClient).toHaveBeenCalledWith("https://test.supabase.invalid", "test-public-key", {
    auth: expect.objectContaining({ autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: "pkce" }),
  });

  onAppStateChange("active");
  expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  onAppStateChange("background");
  expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
});

test("fails before creating a client when public configuration is missing", () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  const { getSupabase } = require("../../client/src/lib/supabase") as typeof import("@/lib/supabase");
  expect(getSupabase).toThrow("EXPO_PUBLIC_SUPABASE_URL");
  expect(mockCreateClient).not.toHaveBeenCalled();
});

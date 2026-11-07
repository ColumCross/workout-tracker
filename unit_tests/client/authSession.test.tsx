import { AuthRequest } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { AuthSessionProvider, useAuthSession } from "@/features/auth/authSession";
import { getUserEULAStatus } from "@/features/privacy/privacyGateway";
import { getSupabase } from "@/lib/supabase";

jest.mock("expo-auth-session", () => ({
  AuthRequest: jest.fn(),
  makeRedirectUri: jest.fn(() => "workouttracker://auth/callback"),
  ResponseType: { IdToken: "id_token" },
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  CryptoEncoding: { HEX: "hex" },
  randomUUID: jest.fn(() => "raw-nonce"),
  digestStringAsync: jest.fn(async () => "hashed-nonce"),
}));
jest.mock("expo-web-browser", () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("@/lib/supabase", () => ({ getSupabase: jest.fn() }));
jest.mock("@/features/privacy/privacyGateway", () => ({ getUserEULAStatus: jest.fn() }));
jest.mock("@/features/privacy/policy", () => ({
  policyConfigurationError: null,
  policyEffectiveAt: Date.UTC(2026, 10, 1),
}));

const mockAuthRequest = jest.mocked(AuthRequest);
const mockGetSupabase = jest.mocked(getSupabase);
const mockGetUserEULAStatus = jest.mocked(getUserEULAStatus);
const mockRouterReplace = jest.mocked(router.replace);
const mockPromptAsync = jest.fn();
const mockMakeAuthUrlAsync = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockSignOut = jest.fn();

function wrapper({ children }: PropsWithChildren) {
  return <AuthSessionProvider>{children}</AuthSessionProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "test-google-client-id";
  mockPromptAsync.mockResolvedValue({ type: "success", params: { id_token: "google-id-token" } });
  mockMakeAuthUrlAsync.mockResolvedValue("https://accounts.google.invalid/auth");
  mockAuthRequest.mockImplementation(() => ({ promptAsync: mockPromptAsync, makeAuthUrlAsync: mockMakeAuthUrlAsync }) as never);
  mockSignInWithIdToken.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockGetUserEULAStatus.mockResolvedValue(Date.UTC(2026, 10, 1));
  mockGetSupabase.mockReturnValue({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithIdToken: mockSignInWithIdToken,
      signOut: mockSignOut,
    },
  } as never);
});

test("prepares OpenID/email OAuth with a hashed nonce and exchanges the raw nonce", async () => {
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.googleSignInReady).toBe(true));
  const config = mockAuthRequest.mock.calls[0][0];
  expect(config).toEqual(expect.objectContaining({
    clientId: "test-google-client-id",
    redirectUri: "workouttracker://auth/callback",
    responseType: "id_token",
    scopes: ["openid", "https://www.googleapis.com/auth/userinfo.email"],
    usePKCE: false,
    extraParams: { nonce: "hashed-nonce" },
  }));
  expect(config.scopes).not.toContain("profile");
  expect(Crypto.digestStringAsync).toHaveBeenCalledWith("SHA256", "raw-nonce", { encoding: "hex" });

  await act(async () => { await result.current.signInWithGoogle(); });
  expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: "google", token: "google-id-token", nonce: "raw-nonce" });
  expect(mockRouterReplace).toHaveBeenCalledWith("/home");
});

test.each([
  [false, "/privacy-policy"],
  [Date.UTC(2026, 9, 31), "/privacy-policy"],
  [Date.UTC(2026, 10, 1), "/home"],
  [Date.UTC(2026, 10, 2), "/home"],
])("routes acknowledgement %p to %s", async (acknowledged, route) => {
  mockGetUserEULAStatus.mockResolvedValue(acknowledged);
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.googleSignInReady).toBe(true));
  await act(async () => { await result.current.signInWithGoogle(); });
  expect(mockRouterReplace).toHaveBeenCalledWith(route);
});

test("cancellation performs no exchange and prepares a retry", async () => {
  mockPromptAsync.mockResolvedValueOnce({ type: "cancel" });
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.googleSignInReady).toBe(true));
  await act(async () => { await result.current.signInWithGoogle(); });
  expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  await waitFor(() => expect(mockAuthRequest).toHaveBeenCalledTimes(2));
  expect(result.current.googleSignInReady).toBe(true);
});

test("guards duplicate submissions while the OAuth prompt is pending", async () => {
  let resolvePrompt!: (value: unknown) => void;
  mockPromptAsync.mockReturnValueOnce(new Promise((resolve) => { resolvePrompt = resolve; }));
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.googleSignInReady).toBe(true));
  let first!: Promise<void>;
  await act(async () => {
    first = result.current.signInWithGoogle();
    void result.current.signInWithGoogle();
    expect(mockPromptAsync).toHaveBeenCalledTimes(1);
    resolvePrompt({ type: "cancel" });
    await first;
  });
});

test.each([
  [{ type: "error", error: { description: "Google refused" } }, "Google refused"],
  [{ type: "success", params: {} }, "without an ID token"],
])("surfaces OAuth response failure %#", async (oauthResult, message) => {
  mockPromptAsync.mockResolvedValueOnce(oauthResult);
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.googleSignInReady).toBe(true));
  await act(async () => { await expect(result.current.signInWithGoogle()).rejects.toThrow(message); });
});

test("surfaces a rejected Supabase exchange and sign-out", async () => {
  mockSignInWithIdToken.mockResolvedValueOnce({ error: new Error("Not provisioned") });
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.googleSignInReady).toBe(true));
  await act(async () => { await expect(result.current.signInWithGoogle()).rejects.toThrow("Not provisioned"); });

  mockSignOut.mockResolvedValueOnce({ error: new Error("Sign-out failed") });
  await expect(result.current.signOut()).rejects.toThrow("Sign-out failed");
});

test("reports missing Google configuration and failed session restoration", async () => {
  delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  mockGetSupabase.mockReturnValueOnce({
    auth: {
      getSession: jest.fn().mockRejectedValue(new Error("storage unavailable")),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithIdToken: mockSignInWithIdToken,
      signOut: mockSignOut,
    },
  } as never);
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.session).toBeNull();
  expect(result.current.configurationError).toContain("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID");
  expect(result.current.googleSignInReady).toBe(false);
});

test("surfaces OAuth preparation failure", async () => {
  jest.mocked(Crypto.digestStringAsync).mockRejectedValueOnce(new Error("Crypto unavailable"));
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.configurationError).toBe("Crypto unavailable"));
  expect(result.current.googleSignInReady).toBe(false);
});

test("updates the exposed session when Auth state changes", async () => {
  let onAuthStateChange!: (_event: string, session: unknown) => void;
  const auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: jest.fn((callback) => {
      onAuthStateChange = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    signInWithIdToken: mockSignInWithIdToken,
    signOut: mockSignOut,
  };
  mockGetSupabase.mockReturnValue({ auth } as never);
  const { result } = await renderHook(() => useAuthSession(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const nextSession = { access_token: "next", user: { id: "22222222-2222-4222-8222-222222222222" } };
  await act(async () => { onAuthStateChange("SIGNED_IN", nextSession); });
  expect(result.current.session).toBe(nextSession);
  await act(async () => { onAuthStateChange("SIGNED_OUT", null); });
  expect(result.current.session).toBeNull();
});

import type { Session } from "@supabase/supabase-js";
import { AuthRequest, makeRedirectUri, ResponseType } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { type Href, router } from "expo-router";
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from "react";
import { useRef } from "react";
import { Platform } from "react-native";

import appConfig from "../../../app.json";

import { getSupabase } from "@/lib/supabase";
import { policyConfigurationError, policyEffectiveAt } from "@/features/privacy/policy";
import { getUserEULAStatus } from "@/features/privacy/privacyGateway";

WebBrowser.maybeCompleteAuthSession();

type AuthSessionContextValue = {
  session: Session | null;
  loading: boolean;
  configurationError: string | null;
  googleSignInReady: boolean;
  loginCheckPending: boolean;
  loginCheckError: string | null;
  signInWithGoogle: () => Promise<void>;
  retryLoginCheck: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";

type PreparedGoogleSignIn = {
  request: AuthRequest;
  rawNonce: string;
};

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [preparedGoogleSignIn, setPreparedGoogleSignIn] = useState<PreparedGoogleSignIn | null>(null);
  const [googleSignInAttempt, setGoogleSignInAttempt] = useState(0);
  const [loginCheckPending, setLoginCheckPending] = useState(false);
  const [loginCheckError, setLoginCheckError] = useState<string | null>(null);
  const signInInProgress = useRef(false);

  const checkEULAStatus = async () => {
    setLoginCheckPending(true);
    setLoginCheckError(null);
    try {
      if (policyConfigurationError || policyEffectiveAt === null) {
        throw new Error(policyConfigurationError ?? "The bundled privacy policy has an invalid effective date.");
      }
      const acknowledged = await getUserEULAStatus();
      setLoginCheckPending(false);
      router.replace((acknowledged === false || acknowledged < policyEffectiveAt ? "/privacy-policy" : "/home") as Href);
    } catch (error) {
      setLoginCheckError(messageFrom(error));
      setLoginCheckPending(false);
    }
  };

  useEffect(() => {
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data, error }) => {
        setSession(error ? null : data.session);
        setLoading(false);
      }).catch(() => {
        setSession(null);
        setLoading(false);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
      });
      return () => listener.subscription.unsubscribe();
    } catch (error) {
      setConfigurationError(messageFrom(error));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!clientId) {
      setConfigurationError("Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in client/.env.local.");
      return;
    }

    let active = true;
    const prepareGoogleSignIn = async () => {
      try {
        const rawNonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          rawNonce,
          { encoding: Crypto.CryptoEncoding.HEX },
        );
        // Production web exports are hosted under the configured repository path.
        const basePath = Platform.OS === "web" && !__DEV__
          ? appConfig.expo.experiments.baseUrl.replace(/^\/+|\/+$/g, "")
          : "";
        const request = new AuthRequest({
          clientId,
          redirectUri: makeRedirectUri({
            scheme: "workouttracker",
            path: basePath ? `${basePath}/auth/callback` : "auth/callback",
          }),
          responseType: ResponseType.IdToken,
          scopes: ["openid", "https://www.googleapis.com/auth/userinfo.email"],
          usePKCE: false,
          extraParams: { nonce: hashedNonce },
        });
        await request.makeAuthUrlAsync({ authorizationEndpoint: googleAuthorizationEndpoint });
        if (active) setPreparedGoogleSignIn({ request, rawNonce });
      } catch (error) {
        if (active) setConfigurationError(messageFrom(error));
      }
    };
    void prepareGoogleSignIn();
    return () => { active = false; };
  }, [googleSignInAttempt]);

  const signInWithGoogle = async () => {
    const supabase = getSupabase();
    if (signInInProgress.current || !preparedGoogleSignIn) return;

    signInInProgress.current = true;
    setPreparedGoogleSignIn(null);
    setLoginCheckPending(true);
    setLoginCheckError(null);
    try {
      const result = await preparedGoogleSignIn.request.promptAsync({ authorizationEndpoint: googleAuthorizationEndpoint });
      if (result.type === "error") throw new Error(result.error?.description ?? "Google login failed.");
      if (result.type !== "success") return;

      const idToken = result.params.id_token;
      if (!idToken) throw new Error("Google login returned without an ID token.");
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce: preparedGoogleSignIn.rawNonce,
      });
      if (error) throw error;
      await checkEULAStatus();
    } finally {
      signInInProgress.current = false;
      setLoginCheckPending(false);
      setGoogleSignInAttempt((attempt) => attempt + 1);
    }
  };

  const signOut = async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthSessionContext.Provider value={{
      session,
      loading,
      configurationError,
      googleSignInReady: Boolean(preparedGoogleSignIn),
      loginCheckPending,
      loginCheckError,
      signInWithGoogle,
      retryLoginCheck: checkEULAStatus,
      signOut,
    }}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used within AuthSessionProvider");
  return context;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Authentication failed.";
}

import { useState } from "react";
import { Text, useTheme } from "react-native-paper";

import { useAuthSession } from "@/features/auth/authSession";
import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";

export function EntryScreen() {
  const theme = useTheme();
  const { configurationError, googleSignInReady, loginCheckError, loginCheckPending, retryLoginCheck, signInWithGoogle } = useAuthSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (loginCheckError) await retryLoginCheck();
      else await signInWithGoogle();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Screen centered>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Workout tracker</Text>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>Sign in to record and save your workouts.</Text>
      {configurationError || loginCheckError || error ? <Text style={{ color: theme.colors.error }}>{configurationError ?? loginCheckError ?? error}</Text> : null}
      <GhostButton disabled={Boolean(configurationError) || loginCheckPending || (!loginCheckError && !googleSignInReady) || submitting} loading={submitting || loginCheckPending} onPress={signIn}>{loginCheckError ? "Retry" : "Sign in with Google"}</GhostButton>
    </Screen>
  );
}

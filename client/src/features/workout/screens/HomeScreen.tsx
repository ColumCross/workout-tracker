import { useState } from "react";
import { Text, useTheme } from "react-native-paper";

import { useAuthSession } from "@/features/auth/authSession";
import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";
import { usePreviewSession } from "../previewSession";
import type { WorkoutStage } from "../viewModel";

export function HomeScreen({ onNewWorkout, onResumeWorkout, onReports }: { onNewWorkout: () => void; onResumeWorkout: (stage: WorkoutStage) => void; onReports: () => void }) {
  const theme = useTheme();
  const { signOut } = useAuthSession();
  const { beginWorkout, draftError, preview, reset } = usePreviewSession();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await beginWorkout();
      onNewWorkout();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start a workout.");
    } finally {
      setStarting(false);
    }
  };
  const logout = async () => {
    setError(null);
    try {
      await signOut();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign out.");
    }
  };
  return (
    <Screen centered>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Workout tracker</Text>
      {draftError || error ? <Text style={{ color: theme.colors.error }}>{draftError ?? error}</Text> : null}
      {preview ? <GhostButton onPress={() => onResumeWorkout(preview.stage)}>Resume workout</GhostButton> : <GhostButton loading={starting} onPress={start}>New workout</GhostButton>}
      {preview ? <GhostButton onPress={reset}>Discard unfinished workout</GhostButton> : null}
      <GhostButton onPress={onReports}>Reports</GhostButton>
      <GhostButton onPress={logout}>Sign out</GhostButton>
    </Screen>
  );
}

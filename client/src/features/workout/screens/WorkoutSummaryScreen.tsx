import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Card, Divider, List, Text, useTheme } from "react-native-paper";

import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";
import { usePreviewSession } from "../previewSession";
import { copy } from "../copy";
import { formatWeight } from "../viewModel";

export function WorkoutSummaryScreen({ onRestart, onNextExercise, onMissingSession }: { onRestart: () => void; onNextExercise: () => void; onMissingSession: () => void }) {
  const theme = useTheme();
  const { preview, reset, beginNextExercise, submitWorkout, submissionError, submissionStatus, draftError } = usePreviewSession();
  useEffect(() => { if (!preview?.exercises.length) onMissingSession(); }, [preview, onMissingSession]);
  if (!preview?.exercises.length) return null;
  const continuePreview = () => { beginNextExercise(); onNextExercise(); };
  const finish = () => { reset(); onRestart(); };
  const submitting = submissionStatus === "submitting";
  const saved = submissionStatus === "saved";
  return (
    <Screen>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Summary of exercises</Text>
      {preview.exercises.map((exercise) => (
        <Card key={exercise.localKey} mode="outlined">
          <Card.Title title={exercise.displayName} />
          <Card.Content>
            {exercise.sets.map((entry, index) => <View key={entry.localKey}><List.Item title={`Set ${index + 1} · ${entry.reps} reps · ${formatWeight(entry.weight)} ${copy.unit}`} /><Divider /></View>)}
          </Card.Content>
        </Card>
      ))}
      {submissionError || draftError ? <Text style={{ color: theme.colors.error }}>{submissionError ?? draftError}</Text> : null}
      {saved ? <Text variant="titleMedium" style={{ color: theme.colors.primary }}>Workout saved.</Text> : null}
      <View style={styles.actions}>
        {!saved ? <GhostButton disabled={submitting} onPress={continuePreview}>Next Exercise</GhostButton> : null}
        <GhostButton loading={submitting} onPress={saved ? finish : submitWorkout}>{saved ? "Done" : submissionStatus === "error" ? "Retry save" : "End and save"}</GhostButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: 12, marginTop: "auto" } });

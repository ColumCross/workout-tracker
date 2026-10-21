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
  const { preview, reset, beginNextExercise } = usePreviewSession();
  useEffect(() => { if (!preview?.exercises.length) onMissingSession(); }, [preview, onMissingSession]);
  if (!preview?.exercises.length) return null;
  const continuePreview = () => { beginNextExercise(); onNextExercise(); };
  const endPreview = () => { reset(); onRestart(); };
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
      <View style={styles.actions}><GhostButton onPress={continuePreview}>Next Exercise</GhostButton><GhostButton onPress={endPreview}>End</GhostButton></View>
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: 12, marginTop: "auto" } });

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card, Dialog, Divider, List, Portal, Text, useTheme } from "react-native-paper";

import { copy } from "../copy";
import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";
import { usePreviewSession } from "../previewSession";
import { formatWeight } from "../viewModel";

type Props = {
  onRestart: () => void;
  onNextExercise: () => void;
  onMissingSession: () => void;
};

export function WorkoutSummaryScreen({
  onRestart,
  onNextExercise,
  onMissingSession,
}: Props) {
  const theme = useTheme();
  const {
    preview,
    reset,
    beginNextExercise,
    showWorkoutSummary,
    submitWorkout,
    submissionError,
    submissionStatus,
    draftError,
  } = usePreviewSession();
  const [discardVisible, setDiscardVisible] = useState(false);

  useEffect(() => {
    if (!preview?.exercises.length) {
      onMissingSession();
    }
  }, [preview, onMissingSession]);

  if (!preview?.exercises.length) {
    return null;
  }

  const continuePreview = () => {
    beginNextExercise();
    onNextExercise();
  };

  const finish = () => {
    reset();
    onRestart();
  };

  const discard = () => {
    setDiscardVisible(false);
    reset();
    onRestart();
  };

  const isExerciseSummary = preview.stage === "exercise-summary";
  const exercises = isExerciseSummary ? [preview.exercises.at(-1)!] : preview.exercises;
  const submitting = submissionStatus === "submitting";
  const saved = submissionStatus === "saved";

  return (
    <Screen>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>
        {isExerciseSummary
          ? `Summary of ${exercises[0].displayName}`
          : "Summary of exercises"}
      </Text>
      {exercises.map((exercise) => (
        <Card key={exercise.localKey} mode="outlined">
          <Card.Title title={exercise.displayName} />
          <Card.Content>
            {exercise.sets.map((entry, index) => (
              <View key={entry.localKey}>
                <List.Item
                  title={`Set ${index + 1} · ${entry.reps} reps · ${formatWeight(entry.weight)} ${copy.unit}`}
                />
                <Divider />
              </View>
            ))}
          </Card.Content>
        </Card>
      ))}
      {submissionError || draftError ? (
        <Text style={{ color: theme.colors.error }}>
          {submissionError ?? draftError}
        </Text>
      ) : null}
      {saved ? (
        <Text variant="titleMedium" style={{ color: theme.colors.primary }}>
          Workout saved.
        </Text>
      ) : null}
      <View style={styles.actions}>
        {isExerciseSummary ? (
          <>
            <GhostButton onPress={continuePreview}>Next Exercise</GhostButton>
            <GhostButton onPress={showWorkoutSummary}>End Workout</GhostButton>
          </>
        ) : !saved ? (
          <>
            <GhostButton loading={submitting} onPress={submitWorkout}>
              Save Workout
            </GhostButton>
            <GhostButton disabled={submitting} onPress={() => setDiscardVisible(true)}>
              Discard Workout
            </GhostButton>
          </>
        ) : (
          <GhostButton onPress={finish}>Done</GhostButton>
        )}
      </View>
      <Portal>
        <Dialog visible={discardVisible} onDismiss={() => setDiscardVisible(false)}>
          <Dialog.Title>Discard workout?</Dialog.Title>
          <Dialog.Content>
            <Text>This workout has not been saved.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <GhostButton onPress={() => setDiscardVisible(false)}>Cancel</GhostButton>
            <GhostButton onPress={discard}>Discard Workout</GhostButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: "auto",
  },
});

import { useEffect, useState } from "react";
import { HelperText, Text, TextInput, useTheme } from "react-native-paper";

import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";
import { usePreviewSession } from "../previewSession";

export function ExerciseNameScreen({ onComplete, onCancel, onReturnToSummary }: { onComplete: () => void; onCancel: () => void; onReturnToSummary: () => void }) {
  const theme = useTheme();
  const { preview, addExercise, reset } = usePreviewSession();
  const [name, setName] = useState("");
  const [showError, setShowError] = useState(false);
  useEffect(() => { if (!preview) onCancel(); }, [preview, onCancel]);
  const next = () => {
    if (addExercise(name)) onComplete();
    else setShowError(true);
  };
  return (
    <Screen centered>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Set Exercise</Text>
      <TextInput label="Exercise" value={name} onChangeText={(text) => { setName(text); setShowError(false); }} autoFocus returnKeyType="next" onSubmitEditing={next} error={showError} />
      {showError ? <HelperText type="error">Enter an exercise name.</HelperText> : null}
      <GhostButton onPress={next}>Next</GhostButton>
      <GhostButton onPress={() => {
        if (preview?.exercises.length) onReturnToSummary();
        else { reset(); onCancel(); }
      }}>Back</GhostButton>
    </Screen>
  );
}

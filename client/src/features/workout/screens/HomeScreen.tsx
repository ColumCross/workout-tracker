import { Text, useTheme } from "react-native-paper";

import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";
import { usePreviewSession } from "../previewSession";

export function HomeScreen({ onNewWorkout }: { onNewWorkout: () => void }) {
  const theme = useTheme();
  const { beginWorkout } = usePreviewSession();
  const start = () => { beginWorkout(); onNewWorkout(); };
  return (
    <Screen centered>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Workout tracker</Text>
      <GhostButton onPress={start}>New workout</GhostButton>
      <GhostButton disabled>Reports</GhostButton>
    </Screen>
  );
}

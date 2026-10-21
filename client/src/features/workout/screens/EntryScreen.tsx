import { Text, useTheme } from "react-native-paper";

import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";

export function EntryScreen({ onContinue }: { onContinue: () => void }) {
  const theme = useTheme();
  return (
    <Screen centered>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Workout tracker</Text>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>Login is a placeholder for this preview.</Text>
      <GhostButton onPress={onContinue}>Next</GhostButton>
    </Screen>
  );
}

import { Text, useTheme } from "react-native-paper";

import { Screen } from "@/features/workout/components/Screen";

export default function AuthCallbackRoute() {
  const theme = useTheme();
  return (
    <Screen centered>
      <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>Completing sign in...</Text>
    </Screen>
  );
}

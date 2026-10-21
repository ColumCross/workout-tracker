import { StyleSheet, View } from "react-native";
import { Divider, IconButton, Text, useTheme } from "react-native-paper";

import { formatDuration } from "../viewModel";

type RestTimerStripProps = {
  remainingSeconds: number;
  paused: boolean;
  completed: boolean;
  onTogglePause: () => void;
};

export function RestTimerStrip({ remainingSeconds, paused, completed, onTogglePause }: RestTimerStripProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.row}>
        <Text variant="titleLarge" style={[styles.time, { color: theme.colors.onSurface }]}>{formatDuration(remainingSeconds)}</Text>
        <IconButton mode="outlined" style={styles.control} icon={paused ? "play" : "pause"} accessibilityLabel={paused ? "Resume rest timer" : "Pause rest timer"} onPress={onTogglePause} disabled={completed} />
      </View>
      <Divider />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4, paddingHorizontal: 20, paddingTop: 8 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  time: { fontVariant: ["tabular-nums"] },
  control: { borderRadius: 0, borderWidth: 1 },
});

import { StyleSheet, View } from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";

import { timerAccent } from "@/theme/themes";

export function ExerciseHeader({ name, onEdit }: { name: string; onEdit: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="headlineSmall" style={[styles.name, { color: theme.colors.onSurface }]}>{name}</Text>
      <IconButton style={styles.edit} icon="pencil" iconColor={theme.dark ? timerAccent.dark : timerAccent.light} accessibilityLabel="Edit exercise name" onPress={onEdit} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", alignSelf: "center", flexDirection: "row", justifyContent: "center", maxWidth: "100%" },
  name: { flexShrink: 1, textAlign: "center" },
  edit: { margin: 0 },
});

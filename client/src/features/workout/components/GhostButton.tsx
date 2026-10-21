import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";
import { Button, useTheme } from "react-native-paper";

type GhostButtonProps = ComponentProps<typeof Button>;

export function GhostButton({ contentStyle, style, textColor, ...props }: GhostButtonProps) {
  const theme = useTheme();
  return <Button {...props} mode="outlined" textColor={textColor ?? theme.colors.onSurface} style={[styles.button, { backgroundColor: theme.colors.surface, borderColor: theme.colors.onSurface }, style]} contentStyle={[styles.content, contentStyle]} />;
}

const styles = StyleSheet.create({ button: { borderRadius: 0, borderWidth: 1 }, content: { minHeight: 48 } });

import type { PropsWithChildren, ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";

import { contentEntering, contentExiting, layoutTransition } from "../motion";

export function Screen({ children, centered = false, fixedHeader }: PropsWithChildren<{ centered?: boolean; fixedHeader?: ReactNode }>) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        {fixedHeader}
        <ScrollView contentContainerStyle={[styles.scroll, centered && styles.centered]} keyboardShouldPersistTaps="handled">
          <Animated.View entering={contentEntering} exiting={contentExiting} layout={layoutTransition} style={styles.content}>{children}</Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20 },
  centered: { justifyContent: "center" },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", gap: 16 },
});

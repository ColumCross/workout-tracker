import { useEffect, useRef } from "react";
import RotaryTimer from "react-native-rotary-timer";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "react-native-paper";
import { cancelAnimation, Easing, useSharedValue, withTiming } from "react-native-reanimated";

import { copy } from "../copy";
import { formatDuration } from "../viewModel";
import { timerAccent } from "@/theme/themes";

type CircularRestTimerProps = {
  mode: "selecting" | "counting-down";
  selectedSeconds: number;
  remainingSeconds?: number;
  running?: boolean;
  onChangeSeconds?: (seconds: number) => void;
};

const EmptyTimerAdornment = () => null;

export function RestTimerAdapter({ mode, selectedSeconds, remainingSeconds = 0, running = false, onChangeSeconds }: CircularRestTimerProps) {
  const theme = useTheme();
  const accent = theme.dark ? timerAccent.dark : timerAccent.light;
  const rotation = useSharedValue(0);
  const previousMode = useRef(mode);
  const isSelecting = mode === "selecting";
  const displayedSeconds = isSelecting ? selectedSeconds : remainingSeconds;

  useEffect(() => {
    // Selection and countdown share the same ten-minute scale.
    const seconds = isSelecting ? selectedSeconds : remainingSeconds;
    const clampedSeconds = Math.max(0, Math.min(copy.maxDurationSeconds, seconds));
    const nextRotation = (2 * Math.PI * clampedSeconds) / copy.maxDurationSeconds;
    const enteredCountdown = previousMode.current !== mode && !isSelecting;
    previousMode.current = mode;
    cancelAnimation(rotation);
    rotation.value = running && !enteredCountdown
      ? withTiming(nextRotation, { duration: 260, easing: Easing.linear })
      : nextRotation;
  }, [isSelecting, mode, remainingSeconds, rotation, running, selectedSeconds]);

  useEffect(() => () => cancelAnimation(rotation), [rotation]);

  return (
    <View style={styles.wrapper}>
      <RotaryTimer
        size={248}
        initialRotation={0}
        rotationSharedValue={rotation}
        minRotation={0}
        maxRotation={2 * Math.PI}
        isEditable={isSelecting}
        snapTicksCount={copy.maxDurationSeconds / copy.durationStepSeconds}
        ticksCount={0}
        ringWidth={12}
        ringActiveColor="#FFFFFF"
        ringInactiveColor={theme.colors.outlineVariant}
        markerColor={accent}
        markerSize={20}
        MarkerComponent={isSelecting ? undefined : EmptyTimerAdornment}
        HintComponent={EmptyTimerAdornment}
        LabelComponent={EmptyTimerAdornment}
        backgroundColor={theme.colors.surface}
        onChange={isSelecting && onChangeSeconds ? (radians) => {
          const nextSeconds = Math.round((radians / (2 * Math.PI)) * copy.maxDurationSeconds / copy.durationStepSeconds) * copy.durationStepSeconds;
          onChangeSeconds(Math.max(0, Math.min(copy.maxDurationSeconds, nextSeconds)));
        } : undefined}
      />
      <Text accessibilityLiveRegion="none" style={styles.label}>{formatDuration(displayedSeconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", height: 248, justifyContent: "center", width: 248 },
  label: { color: "#FFFFFF", fontFamily: "Roboto_500Medium", fontSize: 56, fontVariant: ["tabular-nums"], fontWeight: "500", lineHeight: 64, position: "absolute" },
});

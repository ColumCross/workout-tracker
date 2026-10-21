import { useEffect, useRef, useState } from "react";
import { usePreventRemove } from "expo-router";
import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { Dialog, HelperText, IconButton, Portal, Text, TextInput, useTheme } from "react-native-paper";

import { copy } from "../copy";
import { ExerciseHeader } from "../components/ExerciseHeader";
import { GhostButton } from "../components/GhostButton";
import { RenameExerciseDialog } from "../components/RenameExerciseDialog";
import { RestTimerAdapter } from "../components/RestTimerAdapter";
import { RestTimerStrip } from "../components/RestTimerStrip";
import { Screen } from "../components/Screen";
import { contentEntering, contentExiting, layoutTransition } from "../motion";
import { getActiveExercise, usePreviewSession } from "../previewSession";
import { parseReps, parseWeight } from "../viewModel";

type Props = { onFinished: () => void; onDiscarded: () => void; onMissingSession: () => void };

export function WorkoutSessionScreen({ onFinished, onDiscarded, onMissingSession }: Props) {
  const theme = useTheme();
  const session = usePreviewSession();
  const exercise = getActiveExercise(session.preview);
  const [renameVisible, setRenameVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);
  const [repsText, setRepsText] = useState("");
  const [weightText, setWeightText] = useState("");
  const [repsError, setRepsError] = useState(false);
  const [weightError, setWeightError] = useState(false);
  const submitting = useRef(false);
  const blockedRepeat = useRef<(() => void) | null>(null);
  const [preventExit, setPreventExit] = useState(true);

  useEffect(() => { if (!exercise) onMissingSession(); }, [exercise, onMissingSession]);
  useEffect(() => {
    if (session.mode === "resting" && session.timerStatus === "completed") session.showReady();
  }, [session]);
  usePreventRemove(preventExit && Boolean(exercise), ({ repeat }) => { blockedRepeat.current = repeat; setDiscardVisible(true); });
  if (!exercise) return null;

  const nextSetNumber = exercise.sets.length + 1;
  const pauseOrResume = () => session.timerStatus === "paused" ? session.resumeRest() : session.pauseRest();
  const enterSet = () => {
    if (submitting.current) return;
    const reps = parseReps(repsText);
    const weight = parseWeight(weightText);
    setRepsError(reps === null);
    setWeightError(weight === null);
    if (reps === null || weight === null) return;
    submitting.current = true;
    if (session.recordSet(reps, weight)) {
      setRepsError(false);
      setWeightError(false);
    }
    setTimeout(() => { submitting.current = false; }, 0);
  };
  const discard = () => {
    session.reset();
    setDiscardVisible(false);
    setPreventExit(false);
    setTimeout(() => { if (blockedRepeat.current) blockedRepeat.current(); else onDiscarded(); }, 0);
  };
  const finish = () => { setPreventExit(false); session.endExercise(); setTimeout(onFinished, 0); };
  const isReady = session.mode === "ready";
  const isEntry = session.mode === "entry";
  const isResting = session.mode === "resting";

  return (
    <Screen centered={!isEntry} fixedHeader={isEntry ? <RestTimerStrip remainingSeconds={session.remainingSeconds} paused={session.timerStatus === "paused"} completed={session.timerStatus === "completed"} onTogglePause={pauseOrResume} /> : undefined}>
      <Animated.View layout={layoutTransition} style={styles.header}><ExerciseHeader name={exercise.displayName} onEdit={() => setRenameVisible(true)} /></Animated.View>
      {!isEntry ? <Animated.View layout={layoutTransition} style={styles.timer}><RestTimerAdapter mode={isReady ? "selecting" : "counting-down"} selectedSeconds={session.selectedDurationSeconds} remainingSeconds={session.remainingSeconds} running={session.timerStatus === "running"} onChangeSeconds={session.setSelectedDuration} /></Animated.View> : null}

      {isReady ? <Animated.View entering={contentEntering} exiting={contentExiting} layout={layoutTransition} style={styles.ready}><GhostButton onPress={session.startRest}>Rest</GhostButton>{exercise.sets.length > 0 ? <GhostButton onPress={finish}>End Exercise</GhostButton> : null}</Animated.View> : null}

      {isEntry ? <Animated.View entering={contentEntering} exiting={contentExiting} layout={layoutTransition} style={styles.entry}>{session.timerStatus === "completed" ? <Text style={{ color: theme.colors.onSurfaceVariant }}>Rest complete</Text> : null}<Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>Set {nextSetNumber}</Text><TextInput label="Reps" value={repsText} onChangeText={(text) => { setRepsText(text); setRepsError(false); }} keyboardType="number-pad" error={repsError} />{repsError ? <HelperText type="error">Enter a positive whole number.</HelperText> : null}<TextInput label="Weight" value={weightText} onChangeText={(text) => { setWeightText(text); setWeightError(false); }} keyboardType="decimal-pad" error={weightError} right={<TextInput.Affix text={copy.unit} />} />{weightError ? <HelperText type="error">Enter a non-negative number.</HelperText> : null}<GhostButton onPress={enterSet}>Enter</GhostButton></Animated.View> : null}

      {isResting ? <Animated.View entering={contentEntering} exiting={contentExiting} layout={layoutTransition} style={styles.resting}><Text variant="displaySmall" style={[styles.restingLabel, { color: theme.colors.onSurface }]}>{session.timerStatus === "paused" ? "Paused" : "Resting"}</Text><TimerControl paused={session.timerStatus === "paused"} onPress={pauseOrResume} /></Animated.View> : null}

      <RenameExerciseDialog visible={renameVisible} initialName={exercise.displayName} onDismiss={() => setRenameVisible(false)} onSave={session.renameExercise} />
      <DiscardDialog visible={discardVisible} onDismiss={() => setDiscardVisible(false)} onDiscard={discard} />
    </Screen>
  );
}

function TimerControl({ paused, disabled = false, onPress }: { paused: boolean; disabled?: boolean; onPress: () => void }) {
  return <IconButton mode="outlined" style={styles.timerControl} icon={paused ? "play" : "pause"} accessibilityLabel={paused ? "Resume rest timer" : "Pause rest timer"} onPress={onPress} disabled={disabled} />;
}

function DiscardDialog({ visible, onDismiss, onDiscard }: { visible: boolean; onDismiss: () => void; onDiscard: () => void }) {
  return <Portal><Dialog visible={visible} onDismiss={onDismiss}><Dialog.Title>Discard workout?</Dialog.Title><Dialog.Content><Text>This preview has not been saved.</Text></Dialog.Content><Dialog.Actions><GhostButton onPress={onDismiss}>Cancel</GhostButton><GhostButton onPress={onDiscard}>Discard</GhostButton></Dialog.Actions></Dialog></Portal>;
}

const styles = StyleSheet.create({
  header: { alignSelf: "center", width: "100%" },
  ready: { gap: 16 },
  entry: { gap: 12 },
  timer: { alignItems: "center", alignSelf: "center" },
  timerControl: { borderRadius: 0, borderWidth: 1 },
  resting: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "center" },
  restingLabel: { flexShrink: 1 },
});

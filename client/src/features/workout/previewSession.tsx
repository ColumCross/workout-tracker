import { AppState } from "react-native";
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from "react";

import { copy } from "./copy";
import { createLocalKey, type ExerciseView, type RecordedSetView, type SessionMode, type TimerStatus, type WorkoutPreview } from "./viewModel";

type PreviewSessionContextValue = {
  preview: WorkoutPreview | null;
  mode: SessionMode;
  selectedDurationSeconds: number;
  remainingSeconds: number;
  timerStatus: TimerStatus;
  beginWorkout: () => void;
  beginNextExercise: () => void;
  addExercise: (displayName: string) => boolean;
  renameExercise: (displayName: string) => boolean;
  setSelectedDuration: (seconds: number) => void;
  startRest: () => void;
  pauseRest: () => void;
  resumeRest: () => void;
  recordSet: (reps: number, weight: number) => boolean;
  showResting: () => void;
  showReady: () => void;
  endExercise: () => void;
  reset: () => void;
};

const PreviewSessionContext = createContext<PreviewSessionContextValue | null>(null);

function clampDuration(seconds: number) {
  const clamped = Math.max(0, Math.min(copy.maxDurationSeconds, seconds));
  return Math.round(clamped / copy.durationStepSeconds) * copy.durationStepSeconds;
}

export function PreviewSessionProvider({ children }: PropsWithChildren) {
  const [preview, setPreview] = useState<WorkoutPreview | null>(null);
  const [mode, setMode] = useState<SessionMode>("ready");
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState<TimerStatus>("idle");
  const deadlineMs = useRef<number | null>(null);
  const pausedRemainingMs = useRef(0);
  const runId = useRef(0);
  const acceptingExercise = useRef(false);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTicker = () => {
    if (intervalId.current) clearInterval(intervalId.current);
    intervalId.current = null;
  };

  const completeRun = (id: number) => {
    if (id !== runId.current) return;
    clearTicker();
    deadlineMs.current = null;
    pausedRemainingMs.current = 0;
    setRemainingSeconds(0);
    setTimerStatus("completed");
  };

  const refreshRemaining = () => {
    if (deadlineMs.current === null) return;
    const milliseconds = Math.max(0, deadlineMs.current - Date.now());
    setRemainingSeconds(milliseconds / 1000);
    if (milliseconds === 0) completeRun(runId.current);
  };

  const startTicker = () => {
    clearTicker();
    intervalId.current = setInterval(refreshRemaining, 250);
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || deadlineMs.current === null) return;
      const milliseconds = Math.max(0, deadlineMs.current - Date.now());
      setRemainingSeconds(milliseconds / 1000);
      if (milliseconds === 0) {
        clearTicker();
        deadlineMs.current = null;
        pausedRemainingMs.current = 0;
        setTimerStatus("completed");
      }
    });
    return () => {
      subscription.remove();
      clearTicker();
    };
  }, []);

  const reset = () => {
    acceptingExercise.current = false;
    runId.current += 1;
    clearTicker();
    deadlineMs.current = null;
    pausedRemainingMs.current = 0;
    setPreview(null);
    setMode("ready");
    setSelectedDurationSeconds(0);
    setRemainingSeconds(0);
    setTimerStatus("idle");
  };

  const beginWorkout = () => {
    reset();
    acceptingExercise.current = true;
    setPreview({ localKey: createLocalKey(), exercises: [] });
  };

  const beginNextExercise = () => {
    if (!preview) return;
    acceptingExercise.current = true;
    runId.current += 1;
    clearTicker();
    deadlineMs.current = null;
    pausedRemainingMs.current = 0;
    setMode("ready");
    setSelectedDurationSeconds(0);
    setRemainingSeconds(0);
    setTimerStatus("idle");
  };

  const activeExercise = () => getActiveExercise(preview);

  const addExercise = (displayName: string) => {
    const trimmedName = displayName.trim();
    if (!preview || !trimmedName || !acceptingExercise.current) return false;
    acceptingExercise.current = false;
    const exercise = { localKey: createLocalKey(), displayName: trimmedName, sets: [] };
    setPreview((current) => current && {
      ...current,
      exercises: [...current.exercises, exercise],
    });
    setMode("ready");
    return true;
  };

  const renameExercise = (displayName: string) => {
    const trimmedName = displayName.trim();
    const active = activeExercise();
    if (!trimmedName || !active) return false;
    setPreview((current) => current && {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.localKey === active.localKey ? { ...exercise, displayName: trimmedName } : exercise),
    });
    return true;
  };

  const startRest = () => {
    const duration = selectedDurationSeconds;
    runId.current += 1;
    setMode("entry");
    if (duration === 0) {
      clearTicker();
      setRemainingSeconds(0);
      setTimerStatus("completed");
      return;
    }
    deadlineMs.current = Date.now() + duration * 1000;
    pausedRemainingMs.current = duration * 1000;
    setRemainingSeconds(duration);
    setTimerStatus("running");
    startTicker();
  };

  const pauseRest = () => {
    if (timerStatus !== "running" || deadlineMs.current === null) return;
    pausedRemainingMs.current = Math.max(0, deadlineMs.current - Date.now());
    clearTicker();
    deadlineMs.current = null;
    setRemainingSeconds(pausedRemainingMs.current / 1000);
    setTimerStatus(pausedRemainingMs.current === 0 ? "completed" : "paused");
  };

  const resumeRest = () => {
    if (timerStatus !== "paused" || pausedRemainingMs.current <= 0) return;
    deadlineMs.current = Date.now() + pausedRemainingMs.current;
    setTimerStatus("running");
    startTicker();
  };

  const recordSet = (reps: number, weight: number) => {
    const exercise = activeExercise();
    if (!exercise || mode !== "entry") return false;
    const recordedSet: RecordedSetView = { localKey: createLocalKey(), reps, weight };
    setPreview((current) => current && {
      ...current,
      exercises: current.exercises.map((entry) => entry.localKey === exercise.localKey ? { ...entry, sets: [...entry.sets, recordedSet] } : entry),
    });
    if (timerStatus === "running" || timerStatus === "paused") setMode("resting");
    else setMode("ready");
    return true;
  };

  const endExercise = () => {
    runId.current += 1;
    clearTicker();
    deadlineMs.current = null;
    setTimerStatus("completed");
  };

  return (
    <PreviewSessionContext.Provider value={{
      preview,
      mode,
      selectedDurationSeconds,
      remainingSeconds,
      timerStatus,
      beginWorkout,
      beginNextExercise,
      addExercise,
      renameExercise,
      setSelectedDuration: (seconds) => setSelectedDurationSeconds(clampDuration(seconds)),
      startRest,
      pauseRest,
      resumeRest,
      recordSet,
      showResting: () => setMode("resting"),
      showReady: () => setMode("ready"),
      endExercise,
      reset,
    }}>
      {children}
    </PreviewSessionContext.Provider>
  );
}

export function usePreviewSession() {
  const context = useContext(PreviewSessionContext);
  if (!context) throw new Error("usePreviewSession must be used within PreviewSessionProvider");
  return context;
}

export function getActiveExercise(preview: WorkoutPreview | null): ExerciseView | null {
  return preview?.exercises[preview.exercises.length - 1] ?? null;
}

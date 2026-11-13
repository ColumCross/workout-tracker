import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from "react";

import { useAuthSession } from "@/features/auth/authSession";
import { copy } from "./copy";
import { createLocalKey, type ExerciseView, type RecordedSetView, type SessionMode, type TimerStatus, type WorkoutPreview } from "./viewModel";
import { getWorkoutID, supabaseWorkoutGateway } from "./workoutGateway";

export type SubmissionStatus = "idle" | "submitting" | "error" | "saved";

type PreviewSessionContextValue = {
  preview: WorkoutPreview | null;
  mode: SessionMode;
  selectedDurationSeconds: number;
  remainingSeconds: number;
  timerStatus: TimerStatus;
  submissionStatus: SubmissionStatus;
  submissionError: string | null;
  draftError: string | null;
  beginWorkout: () => Promise<void>;
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
  showExerciseSummary: () => void;
  showWorkoutSummary: () => void;
  submitWorkout: () => Promise<void>;
  reset: () => void;
};

const PreviewSessionContext = createContext<PreviewSessionContextValue | null>(null);

function clampDuration(seconds: number) {
  const clamped = Math.max(0, Math.min(copy.maxDurationSeconds, seconds));
  return Math.round(clamped / copy.durationStepSeconds) * copy.durationStepSeconds;
}

export function PreviewSessionProvider({ children }: PropsWithChildren) {
  const { loading: authLoading, session } = useAuthSession();
  const userID = session?.user.id ?? null;
  const [preview, setPreview] = useState<WorkoutPreview | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [hydratedUserID, setHydratedUserID] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [mode, setMode] = useState<SessionMode>("ready");
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState<TimerStatus>("idle");
  const deadlineMs = useRef<number | null>(null);
  const pausedRemainingMs = useRef(0);
  const runId = useRef(0);
  const acceptingExercise = useRef(false);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    acceptingExercise.current = false;
    runId.current += 1;
    if (intervalId.current) clearInterval(intervalId.current);
    intervalId.current = null;
    deadlineMs.current = null;
    pausedRemainingMs.current = 0;
    setMode("ready");
    setSelectedDurationSeconds(0);
    setRemainingSeconds(0);
    setTimerStatus("idle");
    setDraftHydrated(false);
    setPreview(null);
    setDraftError(null);
    setSubmissionStatus("idle");
    setSubmissionError(null);
    const hydrateDraft = async () => {
      try {
        const stored = userID ? await AsyncStorage.getItem(draftKey(userID)) : null;
        if (!active) return;
        if (stored && userID) {
          const parsed: unknown = JSON.parse(stored);
          if (isWorkoutPreview(parsed, userID)) {
            setPreview(parsed);
            acceptingExercise.current = parsed.stage === "exercise";
          }
          else await AsyncStorage.removeItem(draftKey(userID));
        }
      } catch {
        if (active) setDraftError("This device could not restore the unfinished workout draft.");
      }
      if (active) {
        setHydratedUserID(userID);
        setDraftHydrated(true);
      }
    };
    void hydrateDraft();
    return () => { active = false; };
  }, [userID]);

  useEffect(() => {
    if (!draftHydrated || !userID || submissionStatus === "saved") return;
    let active = true;
    const persistDraft = async () => {
      try {
        if (preview?.ownerID === userID) await AsyncStorage.setItem(draftKey(userID), JSON.stringify(preview));
        else if (!preview) await AsyncStorage.removeItem(draftKey(userID));
        if (active) setDraftError(null);
      } catch {
        if (active) setDraftError("This device could not persist the unfinished workout draft.");
      }
    };
    void persistDraft();
    return () => { active = false; };
  }, [draftHydrated, preview, submissionStatus, userID]);

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
    setSubmissionStatus("idle");
    setSubmissionError(null);
    if (userID) {
      AsyncStorage.removeItem(draftKey(userID))
        .then(() => setDraftError(null))
        .catch(() => setDraftError("This device could not remove the workout draft."));
    }
  };

  const beginWorkout = async () => {
    if (!userID) throw new Error("Sign in again before starting a workout.");
    if (preview) throw new Error("Resume or discard the unfinished workout first.");
    const workoutID = await getWorkoutID();
    acceptingExercise.current = true;
    setPreview({
      localKey: createLocalKey(),
      workoutID,
      ownerID: userID,
      localTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      stage: "exercise",
      exercises: [],
    });
    setSubmissionStatus("idle");
    setSubmissionError(null);
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
    setPreview((current) => current && { ...current, stage: "exercise" });
  };

  const activeExercise = () => getActiveExercise(preview);

  const addExercise = (displayName: string) => {
    const trimmedName = displayName.trim();
    if (!preview || !trimmedName || !acceptingExercise.current) return false;
    acceptingExercise.current = false;
    const exercise = { localKey: createLocalKey(), displayName: trimmedName, sets: [] };
    setPreview((current) => current && {
      ...current,
      stage: "session",
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
    setPreview((current) => current && { ...current, stage: "exercise-summary" });
  };

  const showWorkoutSummary = () => {
    setPreview((current) => current && { ...current, stage: "summary" });
  };

  const showExerciseSummary = () => {
    setPreview((current) => current && { ...current, stage: "exercise-summary" });
  };

  const submitWorkout = async () => {
    if (!preview || submissionStatus === "submitting" || submissionStatus === "saved") return;
    setSubmissionStatus("submitting");
    setSubmissionError(null);
    try {
      await supabaseWorkoutGateway.saveWorkout(preview);
      setSubmissionStatus("saved");
      if (userID) {
        try {
          await AsyncStorage.removeItem(draftKey(userID));
          setDraftError(null);
        } catch {
          setDraftError("The workout was saved, but this device could not remove its local draft.");
        }
      }
    } catch (error) {
      setSubmissionStatus("error");
      setSubmissionError(error instanceof Error ? error.message : "Unable to save the workout.");
    }
  };

  if (authLoading || !draftHydrated || hydratedUserID !== userID) return null;

  return (
    <PreviewSessionContext.Provider value={{
      preview,
      mode,
      selectedDurationSeconds,
      remainingSeconds,
      timerStatus,
      submissionStatus,
      submissionError,
      draftError,
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
      showExerciseSummary,
      showWorkoutSummary,
      submitWorkout,
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

function draftKey(userID: string) {
  return `workout-tracker:draft:${userID}`;
}

function isWorkoutPreview(value: unknown, userID: string): value is WorkoutPreview {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkoutPreview>;
  return candidate.ownerID === userID
    && typeof candidate.localKey === "string"
    && typeof candidate.workoutID === "string"
    && candidate.workoutID.endsWith(`-${userID}`)
    && typeof candidate.localTimezone === "string"
    && (candidate.stage === "exercise" || candidate.stage === "session" || candidate.stage === "exercise-summary" || candidate.stage === "summary")
    && Array.isArray(candidate.exercises)
    && (candidate.stage === "exercise" || candidate.exercises.length > 0)
    && candidate.exercises.every((exercise) => Boolean(exercise)
      && typeof exercise.localKey === "string"
      && typeof exercise.displayName === "string"
      && exercise.displayName.trim().length > 0
      && Array.isArray(exercise.sets)
      && exercise.sets.every((set) => Boolean(set)
        && typeof set.localKey === "string"
        && Number.isSafeInteger(set.reps)
        && set.reps > 0
        && typeof set.weight === "number"
        && Number.isFinite(set.weight)
        && set.weight >= 0
        && Math.round(set.weight * 1000) <= 2147483647))
    && (
      (candidate.stage !== "exercise-summary" && candidate.stage !== "summary")
      || candidate.exercises.every((exercise) => exercise.sets.length > 0)
    );
}

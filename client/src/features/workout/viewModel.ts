export type RecordedSetView = { localKey: string; reps: number; weight: number };

export type ExerciseView = {
  localKey: string;
  displayName: string;
  sets: RecordedSetView[];
};

export type WorkoutStage = "exercise" | "session" | "exercise-summary" | "summary";

export type WorkoutPreview = {
  localKey: string;
  workoutID: string;
  ownerID: string;
  localTimezone: string;
  stage: WorkoutStage;
  exercises: ExerciseView[];
};

export type TimerStatus = "idle" | "running" | "paused" | "completed";
export type SessionMode = "ready" | "entry" | "resting";

export function createLocalKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseReps(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2147483647 ? parsed : null;
}

export function parseWeight(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  const grams = Math.round(parsed * 1000);
  return Number.isFinite(parsed) && parsed >= 0 && Number.isSafeInteger(grams) && grams <= 2147483647 ? parsed : null;
}

export function formatDuration(seconds: number) {
  const wholeSeconds = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, "0")}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function formatWeight(weight: number) {
  return Number.isInteger(weight) ? String(weight) : String(weight);
}

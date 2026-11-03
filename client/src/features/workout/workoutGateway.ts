import type { Session } from "@supabase/supabase-js";

import type { WorkoutPreview } from "./viewModel";
import { getSupabase } from "@/lib/supabase";

export type SaveOutcome = { kind: "saved"; reference: string };
export type WorkoutReportSet = { set_number: number; reps: number; weight_g: number };
export type WorkoutReportExercise = { exercise_name: string; exercise_number: number; sets: WorkoutReportSet[] };
export type WorkoutReport = {
  start_time: string;
  end_time: string;
  local_timezone: string;
  exercises: WorkoutReportExercise[];
};

export interface WorkoutGateway {
  saveWorkout(snapshot: WorkoutPreview): Promise<SaveOutcome>;
}

export async function getWorkoutID() {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in again before starting a workout.");

  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/getWorkoutID`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  });
  const body = await response.json().catch(() => ({})) as { workoutID?: string; error?: string };
  if (!response.ok || !body.workoutID) throw new Error(body.error ?? "Unable to start a workout.");
  return body.workoutID;
}

export async function getWorkouts(): Promise<WorkoutReport[]> {
  const supabase = getSupabase();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error("Sign in again before viewing reports.");

  let response = await requestWorkouts(session);

  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) throw new Error("Your session has expired. Sign in again.");
    response = await requestWorkouts(data.session);
    if (response.status === 401) throw new Error("Your session has expired. Sign in again.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("The server returned an unreadable reports response.");
  }
  if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to load reports."));
  if (!body || typeof body !== "object" || !Array.isArray((body as { workouts?: unknown }).workouts)) {
    throw new Error("The server returned an unexpected reports response.");
  }
  return (body as { workouts: WorkoutReport[] }).workouts;
}

function requestWorkouts(session: Session) {
  return fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/getWorkouts?userId=${encodeURIComponent(session.user.id)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      },
    },
  );
}

function apiErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error === "string") return error;
  if (typeof message === "string") return message;
  return fallback;
}

export const supabaseWorkoutGateway: WorkoutGateway = {
  async saveWorkout(snapshot) {
    let setNumber = 0;
    const payload = {
      workoutID: snapshot.workoutID,
      local_timezone: snapshot.localTimezone,
      exercises: snapshot.exercises.map((exercise) => ({
        exercise_name: exercise.displayName,
        machine_id: null,
        sets: exercise.sets.map((entry) => ({
          reps: entry.reps,
          weight_g: Math.round(entry.weight * 1000),
          set_number: ++setNumber,
        })),
      })),
    };
    const { data, error } = await getSupabase().rpc("saveWorkout", { payload });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success || result.workoutID !== snapshot.workoutID) {
      throw new Error("The server did not confirm the workout save.");
    }
    return { kind: "saved", reference: result.workoutID };
  },
};

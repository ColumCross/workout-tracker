import type { WorkoutPreview } from "./viewModel";

export type SaveOutcome = { kind: "preview-only" } | { kind: "saved"; reference: string };

export interface WorkoutGateway {
  saveWorkout(snapshot: WorkoutPreview): Promise<SaveOutcome>;
}

// Replace this executable preview seam with the authenticated save adapter later.
export const previewWorkoutGateway: WorkoutGateway = {
  async saveWorkout() {
    return { kind: "preview-only" };
  },
};

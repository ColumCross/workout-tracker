import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { PaperProvider } from "react-native-paper";

import { useAuthSession } from "@/features/auth/authSession";
import { usePreviewSession } from "@/features/workout/previewSession";
import { ExerciseNameScreen } from "@/features/workout/screens/ExerciseNameScreen";
import { HomeScreen } from "@/features/workout/screens/HomeScreen";
import { WorkoutSummaryScreen } from "@/features/workout/screens/WorkoutSummaryScreen";

jest.mock("@/features/auth/authSession", () => ({ useAuthSession: jest.fn() }));
jest.mock("@/features/workout/previewSession", () => ({ usePreviewSession: jest.fn() }));
jest.mock("@/features/workout/components/Screen", () => {
  const { View: MockView } = require("react-native");
  return { Screen: ({ children }: PropsWithChildren) => <MockView>{children}</MockView> };
});
jest.mock("@/features/workout/components/GhostButton", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    GhostButton: ({ children, onPress, disabled, loading }: PropsWithChildren<{ onPress: () => void; disabled?: boolean; loading?: boolean }>) => (
      <MockPressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }} disabled={disabled || loading} onPress={onPress}><MockText onPress={onPress}>{children}</MockText></MockPressable>
    ),
  };
});

const mockUseAuthSession = jest.mocked(useAuthSession);
const mockUsePreviewSession = jest.mocked(usePreviewSession);

beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await cleanup(); });

async function pressAsync(screen: { getByText: Function }, name: string) {
  const handler = screen.getByText(name).props.onPress;
  await act(async () => { await handler(); });
}

test("home starts once, routes resume by stage, discards immediately, and reports sign-out errors", async () => {
  const beginWorkout = jest.fn().mockResolvedValue(undefined);
  const reset = jest.fn();
  const signOut = jest.fn().mockRejectedValue(new Error("Sign-out unavailable"));
  mockUseAuthSession.mockReturnValue({ signOut } as never);
  mockUsePreviewSession.mockReturnValue({ beginWorkout, draftError: null, preview: null, reset } as never);
  const onNewWorkout = jest.fn();
  const screen = await render(<HomeScreen onNewWorkout={onNewWorkout} onResumeWorkout={jest.fn()} onReports={jest.fn()} onPrivacyPolicy={jest.fn()} />);
  await pressAsync(screen, "New workout");
  await waitFor(() => expect(onNewWorkout).toHaveBeenCalledTimes(1));
  await pressAsync(screen, "Sign out");
  await waitFor(() => expect(screen.getByText("Sign-out unavailable")).toBeTruthy());
  await screen.unmount();

  const onResumeWorkout = jest.fn();
  mockUsePreviewSession.mockReturnValue({ beginWorkout, draftError: null, preview: { stage: "summary" }, reset } as never);
  const resumed = await render(<HomeScreen onNewWorkout={jest.fn()} onResumeWorkout={onResumeWorkout} onReports={jest.fn()} onPrivacyPolicy={jest.fn()} />);
  await pressAsync(resumed, "Resume workout");
  await pressAsync(resumed, "Discard unfinished workout");
  expect(onResumeWorkout).toHaveBeenCalledWith("summary");
  expect(reset).toHaveBeenCalledTimes(1);
  await resumed.unmount();

  mockUsePreviewSession.mockReturnValue({ beginWorkout, draftError: null, preview: { stage: "exercise-summary" }, reset } as never);
  const exerciseSummary = await render(<HomeScreen onNewWorkout={jest.fn()} onResumeWorkout={onResumeWorkout} onReports={jest.fn()} onPrivacyPolicy={jest.fn()} />);
  await pressAsync(exerciseSummary, "Resume workout");
  expect(onResumeWorkout).toHaveBeenLastCalledWith("exercise-summary");
  await exerciseSummary.unmount();
});

test("exercise naming validates, trims through the provider, and uses stage-sensitive Back", async () => {
  const addExercise = jest.fn((name: string) => name.trim().length > 0);
  const reset = jest.fn();
  mockUsePreviewSession.mockReturnValue({ preview: { exercises: [] }, addExercise, reset, showExerciseSummary: jest.fn() } as never);
  const onComplete = jest.fn();
  const onCancel = jest.fn();
  const screen = await render(<ExerciseNameScreen onComplete={onComplete} onCancel={onCancel} onReturnToSummary={jest.fn()} />);
  await pressAsync(screen, "Next");
  expect(screen.getByText("Enter an exercise name.")).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId("text-input-flat"), "  Bench  ");
  await pressAsync(screen, "Next");
  expect(addExercise).toHaveBeenLastCalledWith("  Bench  ");
  expect(onComplete).toHaveBeenCalledTimes(1);
  await pressAsync(screen, "Back");
  expect(reset).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  await screen.unmount();

  const onReturnToSummary = jest.fn();
  const showExerciseSummary = jest.fn();
  mockUsePreviewSession.mockReturnValue({ preview: { exercises: [{}] }, addExercise, reset, showExerciseSummary } as never);
  const later = await render(<ExerciseNameScreen onComplete={jest.fn()} onCancel={jest.fn()} onReturnToSummary={onReturnToSummary} />);
  await pressAsync(later, "Back");
  expect(showExerciseSummary).toHaveBeenCalledTimes(1);
  expect(onReturnToSummary).toHaveBeenCalledTimes(1);
  await later.unmount();
});

test("exercise summary displays only the completed exercise and can advance to workout summary", async () => {
  const beginNextExercise = jest.fn();
  const showWorkoutSummary = jest.fn();
  mockUsePreviewSession.mockReturnValue({
    preview: {
      stage: "exercise-summary",
      exercises: [
        { localKey: "first", displayName: "Squat", sets: [{ localKey: "first-set", reps: 5, weight: 100 }] },
        { localKey: "last", displayName: "Bench", sets: [{ localKey: "last-set", reps: 10, weight: 60.5 }] },
      ],
    },
    beginNextExercise,
    showWorkoutSummary,
    submissionError: null,
    submissionStatus: "idle",
    draftError: null,
  } as never);

  const onNextExercise = jest.fn();
  const screen = await render(
    <PaperProvider>
      <WorkoutSummaryScreen onRestart={jest.fn()} onNextExercise={onNextExercise} onMissingSession={jest.fn()} />
    </PaperProvider>,
  );
  expect(screen.getByText("Summary of Bench")).toBeTruthy();
  expect(screen.getByText("Set 1 · 10 reps · 60.5 kg")).toBeTruthy();
  expect(screen.queryByText("Set 1 · 5 reps · 100 kg")).toBeNull();
  await pressAsync(screen, "Next Exercise");
  expect(beginNextExercise).toHaveBeenCalledTimes(1);
  expect(onNextExercise).toHaveBeenCalledTimes(1);
  await pressAsync(screen, "End Workout");
  expect(showWorkoutSummary).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

test("workout summary saves, confirms discard, and retains the saved done action", async () => {
  const beginNextExercise = jest.fn();
  const submitWorkout = jest.fn();
  const reset = jest.fn();
  const showWorkoutSummary = jest.fn();
  const base = {
    preview: { stage: "summary", exercises: [{ localKey: "exercise", displayName: "Bench", sets: [{ localKey: "set", reps: 10, weight: 60.5 }] }] },
    reset,
    beginNextExercise,
    showWorkoutSummary,
    submitWorkout,
    submissionError: "Save failed",
    submissionStatus: "error",
    draftError: null,
  };
  mockUsePreviewSession.mockReturnValue(base as never);
  const onNextExercise = jest.fn();
  const onRestartAfterDiscard = jest.fn();
  const first = await render(
    <PaperProvider>
      <WorkoutSummaryScreen onRestart={onRestartAfterDiscard} onNextExercise={onNextExercise} onMissingSession={jest.fn()} />
    </PaperProvider>,
  );
  expect(first.getByText("Summary of exercises")).toBeTruthy();
  expect(first.getByText("Set 1 · 10 reps · 60.5 kg")).toBeTruthy();
  expect(first.getByText("Save failed")).toBeTruthy();
  await pressAsync(first, "Save Workout");
  expect(submitWorkout).toHaveBeenCalledTimes(1);
  await act(async () => { await first.getAllByText("Discard Workout")[0].props.onPress(); });
  expect(first.getByText("Discard workout?")).toBeTruthy();
  await pressAsync(first, "Cancel");
  expect(reset).not.toHaveBeenCalled();
  await act(async () => { await first.getAllByText("Discard Workout")[0].props.onPress(); });
  const discardButtons = first.getAllByText("Discard Workout");
  await act(async () => { await discardButtons.at(-1).props.onPress(); });
  expect(reset).toHaveBeenCalledTimes(1);
  expect(onRestartAfterDiscard).toHaveBeenCalledTimes(1);
  await first.unmount();

  reset.mockClear();
  const onRestart = jest.fn();
  mockUsePreviewSession.mockReturnValue({ ...base, submissionError: null, submissionStatus: "saved" } as never);
  const saved = await render(
    <PaperProvider>
      <WorkoutSummaryScreen onRestart={onRestart} onNextExercise={jest.fn()} onMissingSession={jest.fn()} />
    </PaperProvider>,
  );
  expect(saved.getByText("Workout saved.")).toBeTruthy();
  await pressAsync(saved, "Done");
  expect(reset).toHaveBeenCalledTimes(1);
  expect(onRestart).toHaveBeenCalledTimes(1);
  await saved.unmount();
});

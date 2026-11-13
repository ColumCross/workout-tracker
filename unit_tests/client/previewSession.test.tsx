import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { useAuthSession } from "@/features/auth/authSession";
import { PreviewSessionProvider, usePreviewSession } from "@/features/workout/previewSession";
import { getWorkoutID, supabaseWorkoutGateway } from "@/features/workout/workoutGateway";

jest.mock("@/features/auth/authSession", () => ({ useAuthSession: jest.fn() }));
jest.mock("@/features/workout/workoutGateway", () => ({
  getWorkoutID: jest.fn(),
  supabaseWorkoutGateway: { saveWorkout: jest.fn() },
}));

const mockUseAuthSession = jest.mocked(useAuthSession);
const mockGetWorkoutID = jest.mocked(getWorkoutID);
const mockSaveWorkout = jest.mocked(supabaseWorkoutGateway.saveWorkout);
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const workoutID = `1793700000000-1234567890123456-${userA}`;

function wrapper({ children }: PropsWithChildren) {
  return <PreviewSessionProvider>{children}</PreviewSessionProvider>;
}

async function renderSession() {
  const rendered = await renderHook(() => usePreviewSession(), { wrapper });
  await waitFor(() => expect(rendered.result.current).not.toBeNull());
  return rendered;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockUseAuthSession.mockReturnValue({ loading: false, session: { user: { id: userA } } } as never);
  mockGetWorkoutID.mockResolvedValue(workoutID);
  mockSaveWorkout.mockResolvedValue({ kind: "saved", reference: workoutID });
});

afterEach(() => {
  jest.useRealTimers();
});

test("starts a user-owned draft only after ID acquisition and captures a timezone", async () => {
  const { result } = await renderSession();
  await act(async () => { await result.current.beginWorkout(); });

  expect(result.current.preview).toEqual(expect.objectContaining({
    workoutID,
    ownerID: userA,
    localTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    stage: "exercise",
    exercises: [],
  }));
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    `workout-tracker:draft:${userA}`,
    expect.stringContaining(workoutID),
  ));
});

test("does not create a draft when starting fails and prevents replacing one", async () => {
  mockGetWorkoutID.mockRejectedValueOnce(new Error("start failed"));
  const { result } = await renderSession();
  await act(async () => { await expect(result.current.beginWorkout()).rejects.toThrow("start failed"); });
  expect(result.current.preview).toBeNull();

  await act(async () => { await result.current.beginWorkout(); });
  await act(async () => { await expect(result.current.beginWorkout()).rejects.toThrow("Resume or discard"); });
  expect(mockGetWorkoutID).toHaveBeenCalledTimes(2);
});

test("trims exercise names, blocks duplicates, renames, and resets timer selection for the next exercise", async () => {
  const { result } = await renderSession();
  await act(async () => { await result.current.beginWorkout(); });
  await act(async () => {
    expect(result.current.addExercise("  Bench press  ")).toBe(true);
    expect(result.current.addExercise("Duplicate")).toBe(false);
  });
  expect(result.current.preview?.exercises[0].displayName).toBe("Bench press");
  await act(async () => {
    expect(result.current.renameExercise("  Incline press ")).toBe(true);
    expect(result.current.renameExercise("   ")).toBe(false);
    result.current.setSelectedDuration(47);
  });
  expect(result.current.selectedDurationSeconds).toBe(45);

  await act(async () => { result.current.beginNextExercise(); });
  expect(result.current.preview?.stage).toBe("exercise");
  expect(result.current.selectedDurationSeconds).toBe(0);
  expect(result.current.timerStatus).toBe("idle");
});

test("uses a controlled deadline for snapping, pause, resume, and completion", async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-11-03T10:00:00Z"));
  const { result } = await renderSession();
  await act(async () => { await result.current.beginWorkout(); });
  await act(async () => {
    result.current.addExercise("Row");
    result.current.setSelectedDuration(607);
  });
  expect(result.current.selectedDurationSeconds).toBe(600);

  await act(async () => { result.current.startRest(); });
  expect(result.current.mode).toBe("entry");
  expect(result.current.timerStatus).toBe("running");
  await act(async () => {
    jest.advanceTimersByTime(10_000);
    result.current.pauseRest();
  });
  expect(result.current.timerStatus).toBe("paused");
  expect(result.current.remainingSeconds).toBeCloseTo(590);

  await act(async () => {
    result.current.resumeRest();
    jest.advanceTimersByTime(590_000);
  });
  expect(result.current.timerStatus).toBe("completed");
  expect(result.current.remainingSeconds).toBe(0);
});

test("records ordered sets, preserves the same ID across a failed save, and clears only after confirmation", async () => {
  mockSaveWorkout.mockRejectedValueOnce(new Error("lost response"));
  const { result } = await renderSession();
  await act(async () => { await result.current.beginWorkout(); });
  await act(async () => {
    result.current.addExercise("Squat");
  });
  await act(async () => {
    result.current.startRest();
  });
  await act(async () => {
    expect(result.current.recordSet(5, 100.25)).toBe(true);
  });
  await act(async () => {
    result.current.endExercise();
  });
  expect(result.current.preview?.stage).toBe("exercise-summary");
  await act(async () => { result.current.showWorkoutSummary(); });
  expect(result.current.preview?.stage).toBe("summary");
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
  jest.mocked(AsyncStorage.removeItem).mockClear();

  await act(async () => { await result.current.submitWorkout(); });
  expect(result.current.submissionStatus).toBe("error");
  expect(result.current.submissionError).toBe("lost response");
  expect(result.current.preview?.workoutID).toBe(workoutID);
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();

  await act(async () => { await result.current.submitWorkout(); });
  expect(result.current.submissionStatus).toBe("saved");
  expect(mockSaveWorkout).toHaveBeenCalledTimes(2);
  expect(mockSaveWorkout.mock.calls[0][0].workoutID).toBe(mockSaveWorkout.mock.calls[1][0].workoutID);
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(`workout-tracker:draft:${userA}`);
});

test("restores a valid exercise-summary draft for the current user and resets transient timer state", async () => {
  const draft = {
    localKey: "draft",
    workoutID,
    ownerID: userA,
    localTimezone: "Europe/Dublin",
    stage: "exercise-summary",
    exercises: [{ localKey: "exercise", displayName: "Row", sets: [{ localKey: "set", reps: 8, weight: 20 }] }],
  };
  await AsyncStorage.setItem(`workout-tracker:draft:${userA}`, JSON.stringify(draft));
  jest.mocked(AsyncStorage.setItem).mockClear();
  const { result } = await renderSession();
  expect(result.current.preview).toEqual(draft);
  expect(result.current.timerStatus).toBe("idle");
  expect(result.current.selectedDurationSeconds).toBe(0);
});

test("isolates user storage and removes invalid owner or ID drafts", async () => {
  const invalid = { localKey: "draft", workoutID, ownerID: userB, localTimezone: "UTC", stage: "exercise", exercises: [] };
  await AsyncStorage.setItem(`workout-tracker:draft:${userA}`, JSON.stringify(invalid));
  await AsyncStorage.setItem(`workout-tracker:draft:${userB}`, "other-user-data");
  jest.mocked(AsyncStorage.removeItem).mockClear();
  const { result } = await renderSession();
  expect(result.current.preview).toBeNull();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(`workout-tracker:draft:${userA}`);
  expect(await AsyncStorage.getItem(`workout-tracker:draft:${userB}`)).toBe("other-user-data");
});

test("surfaces malformed JSON, persistence, and saved-cleanup failures", async () => {
  await AsyncStorage.setItem(`workout-tracker:draft:${userA}`, "not json");
  const restored = await renderSession();
  expect(restored.result.current.preview).toBeNull();
  await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledWith(`workout-tracker:draft:${userA}`));
  await restored.unmount();

  await AsyncStorage.clear();
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("storage full"));
  const persisted = await renderSession();
  await act(async () => { await persisted.result.current.beginWorkout(); });
  await waitFor(() => expect(persisted.result.current.draftError).toMatch(/could not persist/));

  await act(async () => {
    persisted.result.current.addExercise("Press");
  });
  await act(async () => {
    persisted.result.current.startRest();
  });
  await act(async () => {
    persisted.result.current.recordSet(1, 0);
  });
  await act(async () => {
    persisted.result.current.endExercise();
  });
  await act(async () => { persisted.result.current.showWorkoutSummary(); });
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error("remove failed"));
  await act(async () => { await persisted.result.current.submitWorkout(); });
  expect(persisted.result.current.submissionStatus).toBe("saved");
  expect(persisted.result.current.draftError).toMatch(/saved, but.*could not remove/);
});

import { cleanup, fireEvent, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { PaperProvider } from "react-native-paper";

import { useAuthSession } from "@/features/auth/authSession";
import { usePreviewSession } from "@/features/workout/previewSession";
import { WorkoutSessionScreen } from "@/features/workout/screens/WorkoutSessionScreen";

const mockUsePreventRemove = jest.fn();
jest.mock("expo-router", () => ({ usePreventRemove: (...args: unknown[]) => mockUsePreventRemove(...args) }));
jest.mock("@/features/auth/authSession", () => ({ useAuthSession: jest.fn() }));
jest.mock("@/features/workout/previewSession", () => ({
  getActiveExercise: (preview: { exercises?: unknown[] } | null) => preview?.exercises?.at(-1) ?? null,
  usePreviewSession: jest.fn(),
}));
jest.mock("@/features/workout/components/Screen", () => {
  const { View: MockView } = require("react-native");
  return { Screen: ({ children, fixedHeader }: PropsWithChildren<{ fixedHeader?: unknown }>) => <MockView>{fixedHeader as never}{children}</MockView> };
});
jest.mock("@/features/workout/components/GhostButton", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return { GhostButton: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => <MockPressable accessibilityRole="button" onPress={onPress}><MockText>{children}</MockText></MockPressable> };
});
jest.mock("@/features/workout/components/ExerciseHeader", () => {
  const { Text: MockText } = require("react-native");
  return { ExerciseHeader: ({ name }: { name: string }) => <MockText>{name}</MockText> };
});
jest.mock("@/features/workout/components/RestTimerAdapter", () => {
  const { Text: MockText } = require("react-native");
  return { RestTimerAdapter: () => <MockText>Rotary timer</MockText> };
});
jest.mock("@/features/workout/components/RestTimerStrip", () => ({
  RestTimerStrip: ({ paused, onTogglePause }: { paused: boolean; onTogglePause: () => void }) => {
    const { Pressable: MockPressable, Text: MockText } = require("react-native");
    return <MockPressable accessibilityLabel={paused ? "Resume rest timer" : "Pause rest timer"} onPress={onTogglePause}><MockText>Timer strip</MockText></MockPressable>;
  },
}));
jest.mock("@/features/workout/components/RenameExerciseDialog", () => ({ RenameExerciseDialog: () => null }));
jest.mock("@/features/workout/motion", () => ({ contentEntering: undefined, contentExiting: undefined, layoutTransition: undefined }));
jest.mock("react-native-reanimated", () => {
  const { View: MockView } = require("react-native");
  return { __esModule: true, default: { View: MockView }, View: MockView };
});

const mockUseAuthSession = jest.mocked(useAuthSession);
const mockUsePreviewSession = jest.mocked(usePreviewSession);

function session(overrides: Record<string, unknown> = {}) {
  return {
    preview: { exercises: [{ localKey: "exercise", displayName: "Bench", sets: [] }] },
    mode: "entry",
    remainingSeconds: 30,
    timerStatus: "running",
    selectedDurationSeconds: 60,
    setSelectedDuration: jest.fn(),
    startRest: jest.fn(),
    pauseRest: jest.fn(),
    resumeRest: jest.fn(),
    recordSet: jest.fn(() => true),
    showResting: jest.fn(),
    showReady: jest.fn(),
    endExercise: jest.fn(),
    renameExercise: jest.fn(),
    reset: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuthSession.mockReturnValue({ session: { user: { id: "user" } } } as never);
});
afterEach(async () => { await cleanup(); });

async function renderSessionScreen(props: { onFinished: () => void; onDiscarded: () => void; onMissingSession: () => void }) {
  return render(<PaperProvider><WorkoutSessionScreen {...props} /></PaperProvider>);
}

test("validates rep and weight input before recording one set", async () => {
  const state = session();
  mockUsePreviewSession.mockReturnValue(state as never);
  const screen = await renderSessionScreen({ onFinished: jest.fn(), onDiscarded: jest.fn(), onMissingSession: jest.fn() });
  await fireEvent.press(screen.getByText("End Set"));
  expect(screen.getByText("Enter a positive whole number.")).toBeTruthy();
  expect(screen.getByText("Enter a non-negative number.")).toBeTruthy();
  expect(state.recordSet).not.toHaveBeenCalled();

  const inputs = screen.getAllByTestId("text-input-flat");
  await fireEvent.changeText(inputs[0], "8");
  await fireEvent.changeText(inputs[1], "60,5");
  await fireEvent.press(screen.getByText("End Set"));
  expect(state.recordSet).toHaveBeenCalledWith(8, 60.5);
});

test("pauses and resumes from the entry strip", async () => {
  const running = session();
  mockUsePreviewSession.mockReturnValue(running as never);
  const first = await renderSessionScreen({ onFinished: jest.fn(), onDiscarded: jest.fn(), onMissingSession: jest.fn() });
  await fireEvent.press(first.getByLabelText("Pause rest timer"));
  expect(running.pauseRest).toHaveBeenCalledTimes(1);
  await first.unmount();

  const paused = session({ timerStatus: "paused" });
  mockUsePreviewSession.mockReturnValue(paused as never);
  const second = await renderSessionScreen({ onFinished: jest.fn(), onDiscarded: jest.fn(), onMissingSession: jest.fn() });
  await fireEvent.press(second.getByLabelText("Resume rest timer"));
  expect(paused.resumeRest).toHaveBeenCalledTimes(1);
});

test("records a valid final set before ending the exercise", async () => {
  const state = session({
    mode: "entry",
    timerStatus: "completed",
    preview: { exercises: [{ localKey: "exercise", displayName: "Bench", sets: [{ localKey: "set", reps: 8, weight: 60 }] }] },
  });
  mockUsePreviewSession.mockReturnValue(state as never);
  const onFinished = jest.fn();
  const screen = await renderSessionScreen({ onFinished, onDiscarded: jest.fn(), onMissingSession: jest.fn() });
  const inputs = screen.getAllByTestId("text-input-flat");
  await fireEvent.changeText(inputs[0], "8");
  await fireEvent.changeText(inputs[1], "60");
  await fireEvent.press(screen.getByText("End Exercise"));
  expect(state.recordSet).toHaveBeenCalledWith(8, 60);
  expect(state.endExercise).toHaveBeenCalledTimes(1);
});

test("does not end the exercise when the final set is invalid", async () => {
  const state = session({
    mode: "entry",
    timerStatus: "completed",
    preview: { exercises: [{ localKey: "exercise", displayName: "Bench", sets: [{ localKey: "set", reps: 8, weight: 60 }] }] },
  });
  mockUsePreviewSession.mockReturnValue(state as never);
  const screen = await renderSessionScreen({ onFinished: jest.fn(), onDiscarded: jest.fn(), onMissingSession: jest.fn() });
  await fireEvent.press(screen.getByText("End Exercise"));
  expect(state.recordSet).not.toHaveBeenCalled();
  expect(state.endExercise).not.toHaveBeenCalled();
});

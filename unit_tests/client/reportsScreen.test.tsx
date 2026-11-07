import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";

import { ReportsScreen } from "@/features/workout/screens/ReportsScreen";
import { getWorkouts } from "@/features/workout/workoutGateway";

jest.mock("@/features/workout/workoutGateway", () => ({ getWorkouts: jest.fn() }));
jest.mock("@/features/workout/components/Screen", () => {
  const { View: MockView } = require("react-native");
  return { Screen: ({ children }: PropsWithChildren) => <MockView>{children}</MockView> };
});
jest.mock("@/features/workout/components/GhostButton", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    GhostButton: ({ children, onPress, disabled }: PropsWithChildren<{ onPress: () => void; disabled?: boolean }>) => (
      <MockPressable accessibilityRole="button" disabled={disabled} onPress={onPress}><MockText>{children}</MockText></MockPressable>
    ),
  };
});

const mockGetWorkouts = jest.mocked(getWorkouts);

beforeEach(() => jest.clearAllMocks());

test("shows loading, empty history, and Back", async () => {
  let resolve!: (value: []) => void;
  mockGetWorkouts.mockReturnValue(new Promise((done) => { resolve = done; }));
  const onBack = jest.fn();
  const screen = await render(<ReportsScreen onBack={onBack} />);
  expect(screen.getByText("Loading workouts...")).toBeTruthy();
  resolve([]);
  await waitFor(() => expect(screen.getByText("No saved workouts yet.")).toBeTruthy());
  fireEvent.press(screen.getByText("Back"));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test("renders multiple exercises, workout-wide set numbers, kg, saved timezone dates, and ordinals", async () => {
  mockGetWorkouts.mockResolvedValue([
    {
      start_time: "2027-01-01T00:30:00.000Z",
      end_time: "2027-01-01T01:30:00.000Z",
      local_timezone: "America/Los_Angeles",
      exercises: [
        { exercise_name: "Bench", exercise_number: 1, sets: [{ set_number: 1, reps: 10, weight_g: 60500 }] },
        { exercise_name: "Row", exercise_number: 2, sets: [{ set_number: 2, reps: 8, weight_g: 0 }] },
      ],
    },
    {
      start_time: "2026-11-03T00:30:00.000Z",
      end_time: "2026-11-03T01:30:00.000Z",
      local_timezone: "Europe/Dublin",
      exercises: [{ exercise_name: "Squat", exercise_number: 1, sets: [{ set_number: 3, reps: 5, weight_g: 100125 }] }],
    },
  ]);
  const screen = await render(<ReportsScreen onBack={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Workout on December 31st")).toBeTruthy());
  expect(screen.getByText("Workout on November 3rd")).toBeTruthy();
  expect(screen.getByText("Set 1 · 10 reps · 60.5 kg")).toBeTruthy();
  expect(screen.getByText("Set 2 · 8 reps · 0 kg")).toBeTruthy();
  expect(screen.getByText("Set 3 · 5 reps · 100.125 kg")).toBeTruthy();
  expect(screen.getByText("Bench")).toBeTruthy();
  expect(screen.getByText("Row")).toBeTruthy();
});

test.each([
  ["2026-01-01T12:00:00Z", "January 1st"],
  ["2026-01-02T12:00:00Z", "January 2nd"],
  ["2026-01-03T12:00:00Z", "January 3rd"],
  ["2026-01-11T12:00:00Z", "January 11th"],
  ["2026-01-12T12:00:00Z", "January 12th"],
  ["2026-01-13T12:00:00Z", "January 13th"],
  ["2026-01-21T12:00:00Z", "January 21st"],
  ["2026-01-22T12:00:00Z", "January 22nd"],
  ["2026-01-23T12:00:00Z", "January 23rd"],
  ["2026-01-31T12:00:00Z", "January 31st"],
])("formats ordinal date %s", async (startTime, title) => {
  mockGetWorkouts.mockResolvedValue([{ start_time: startTime, end_time: startTime, local_timezone: "UTC", exercises: [] }]);
  const screen = await render(<ReportsScreen onBack={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(`Workout on ${title}`)).toBeTruthy());
});

test("shows an error and guards duplicate retry loads", async () => {
  mockGetWorkouts.mockRejectedValueOnce(new Error("Reports unavailable"));
  const screen = await render(<ReportsScreen onBack={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Reports unavailable")).toBeTruthy());

  let resolve!: (value: []) => void;
  mockGetWorkouts.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const retry = screen.getByText("Retry");
  fireEvent.press(retry);
  fireEvent.press(retry);
  expect(mockGetWorkouts).toHaveBeenCalledTimes(2);
  resolve([]);
  await waitFor(() => expect(screen.getByText("No saved workouts yet.")).toBeTruthy());
});

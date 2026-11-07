import { formatDuration, formatWeight, parseReps, parseWeight } from "@/features/workout/viewModel";

describe("workout input parsing and formatting", () => {
  test.each([
    ["1", 1],
    [" 2147483647 ", 2147483647],
    ["0", null],
    ["-1", null],
    ["1.5", null],
    ["2147483648", null],
    ["", null],
    ["ten", null],
    ["1e3", null],
  ])("parseReps(%p) returns %p", (input, expected) => {
    expect(parseReps(input)).toBe(expected);
  });

  test.each([
    ["0", 0],
    [" 1.25 ", 1.25],
    ["1,5", 1.5],
    [".5", 0.5],
    [".0005", 0.0005],
    ["2147483.647", 2147483.647],
    ["2147483.6475", null],
    ["-1", null],
    ["", null],
    ["1e3", null],
    ["1.", null],
    ["weight", null],
  ])("parseWeight(%p) returns %p", (input, expected) => {
    expect(parseWeight(input)).toBe(expected);
  });

  test.each([
    [-0.1, "00:00"],
    [0, "00:00"],
    [0.01, "00:01"],
    [59.1, "01:00"],
    [600, "10:00"],
  ])("formatDuration(%p) returns %p", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  test("formats whole and decimal kilogram values without padding", () => {
    expect(formatWeight(0)).toBe("0");
    expect(formatWeight(12.5)).toBe("12.5");
  });
});

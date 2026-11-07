import { fireEvent, render } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { Pressable } from "react-native";

import { RestTimerAdapter } from "@/features/workout/components/RestTimerAdapter";
import { RestTimerStrip } from "@/features/workout/components/RestTimerStrip";
import { darkTheme, lightTheme } from "@/theme/themes";

let mockRotaryProps: Record<string, unknown> = {};
jest.mock("react-native-reanimated", () => ({
  cancelAnimation: jest.fn(),
  Easing: { linear: "linear" },
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}));
jest.mock("react-native-rotary-timer", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { Pressable: MockPressable } = require("react-native");
    mockRotaryProps = props;
    return <MockPressable testID="rotary-timer" onPress={() => (props.onChange as Function | undefined)?.(Math.PI)} />;
  },
}));

test.each([
  [lightTheme, false, false, "Pause rest timer"],
  [darkTheme, true, false, "Resume rest timer"],
])("renders timer controls in either theme", async (theme, paused, completed, label) => {
  const onTogglePause = jest.fn();
  const screen = await render(<PaperProvider theme={theme}><RestTimerStrip remainingSeconds={59.2} paused={paused} completed={completed} onTogglePause={onTogglePause} /></PaperProvider>);
  expect(screen.getByText("01:00")).toBeTruthy();
  fireEvent.press(screen.getByLabelText(label));
  expect(onTogglePause).toHaveBeenCalledTimes(1);
});

test("disables the fixed-strip control after completion", async () => {
  const onTogglePause = jest.fn();
  const screen = await render(<PaperProvider><RestTimerStrip remainingSeconds={0} paused={false} completed onTogglePause={onTogglePause} /></PaperProvider>);
  fireEvent.press(screen.getByLabelText("Pause rest timer"));
  expect(onTogglePause).not.toHaveBeenCalled();
});

test("configures a drag-editable 15-second selector on the shared ten-minute scale", async () => {
  const onChangeSeconds = jest.fn();
  const screen = await render(<PaperProvider theme={darkTheme}><RestTimerAdapter mode="selecting" selectedSeconds={0} onChangeSeconds={onChangeSeconds} /></PaperProvider>);
  expect(mockRotaryProps).toEqual(expect.objectContaining({
    isEditable: true,
    maxRotation: 2 * Math.PI,
    snapTicksCount: 40,
  }));
  fireEvent.press(screen.getByTestId("rotary-timer"));
  expect(onChangeSeconds).toHaveBeenCalledWith(300);
});

test("renders countdown mode as noneditable with an empty marker adornment", async () => {
  await render(<PaperProvider theme={lightTheme}><RestTimerAdapter mode="counting-down" selectedSeconds={120} remainingSeconds={59.2} running /></PaperProvider>);
  expect(mockRotaryProps.isEditable).toBe(false);
  expect(mockRotaryProps.MarkerComponent).toEqual(expect.any(Function));
  expect(mockRotaryProps.onChange).toBeUndefined();
});

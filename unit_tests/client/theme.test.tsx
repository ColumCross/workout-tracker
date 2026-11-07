import { act, cleanup, renderHook } from "@testing-library/react-native";
import * as ReactNative from "react-native";

import { darkTheme, lightTheme, timerAccent } from "@/theme/themes";
import { useSystemTheme as useNativeSystemTheme } from "@/theme/useSystemTheme";
import { useSystemTheme as useWebSystemTheme } from "@/theme/useSystemTheme.web";

const mockUseColorScheme = jest.spyOn(ReactNative, "useColorScheme");

afterEach(async () => { await cleanup(); });

test("native theme uses light only when explicitly light and otherwise dark", async () => {
  mockUseColorScheme.mockReturnValue("light");
  const light = await renderHook(() => useNativeSystemTheme());
  expect(light.result.current).toBe("light");
  await light.unmount();

  mockUseColorScheme.mockReturnValue(null);
  const fallback = await renderHook(() => useNativeSystemTheme());
  expect(fallback.result.current).toBe("dark");
});

test("themes provide readable contrasting surfaces and stable square controls", () => {
  expect(lightTheme.dark).toBe(false);
  expect(darkTheme.dark).toBe(true);
  expect(lightTheme.roundness).toBe(0);
  expect(darkTheme.roundness).toBe(0);
  expect(lightTheme.colors.background).not.toBe(lightTheme.colors.onSurface);
  expect(darkTheme.colors.background).not.toBe(darkTheme.colors.onSurface);
  expect(timerAccent.light).not.toBe(timerAccent.dark);
});

test("web theme falls back to dark and responds to color-scheme changes", async () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
  const fallback = await renderHook(() => useWebSystemTheme());
  expect(fallback.result.current).toBe("dark");
  await fallback.unmount();

  let matches = true;
  let listener: (() => void) | undefined;
  const mediaQuery = {
    get matches() { return matches; },
    addEventListener: jest.fn((_event: string, callback: () => void) => { listener = callback; }),
    removeEventListener: jest.fn(),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: jest.fn(() => mediaQuery) } });
  const themed = await renderHook(() => useWebSystemTheme());
  expect(themed.result.current).toBe("light");
  await act(async () => {
    matches = false;
    listener?.();
  });
  expect(themed.result.current).toBe("dark");
  await themed.unmount();
  expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

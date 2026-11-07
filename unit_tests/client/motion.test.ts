import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";

import { contentEntering, contentExiting, layoutTransition } from "@/features/workout/motion";

jest.mock("react-native-reanimated", () => {
  const transition = () => ({ duration: jest.fn().mockReturnThis(), reduceMotion: jest.fn().mockReturnThis() });
  return { FadeIn: transition(), FadeOut: transition(), LinearTransition: transition(), ReduceMotion: { System: "system" } };
});

test("all content and layout transitions honor the system reduced-motion preference", () => {
  expect(FadeIn.duration).toHaveBeenCalledWith(180);
  expect(FadeIn.reduceMotion).toHaveBeenCalledWith(ReduceMotion.System);
  expect(FadeOut.duration).toHaveBeenCalledWith(140);
  expect(FadeOut.reduceMotion).toHaveBeenCalledWith(ReduceMotion.System);
  expect(LinearTransition.duration).toHaveBeenCalledWith(280);
  expect(LinearTransition.reduceMotion).toHaveBeenCalledWith(ReduceMotion.System);
  expect(contentEntering).toBe(FadeIn);
  expect(contentExiting).toBe(FadeOut);
  expect(layoutTransition).toBe(LinearTransition);
});

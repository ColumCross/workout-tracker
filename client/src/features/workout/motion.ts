import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";

const reduceMotion = ReduceMotion.System;
export const contentEntering = FadeIn.duration(180).reduceMotion(reduceMotion);
export const contentExiting = FadeOut.duration(140).reduceMotion(reduceMotion);
export const layoutTransition = LinearTransition.duration(280).reduceMotion(reduceMotion);

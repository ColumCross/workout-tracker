import { type Href, router } from "expo-router";

import { ExerciseNameScreen } from "@/features/workout/screens/ExerciseNameScreen";

export default function ExerciseRoute() {
  return (
    <ExerciseNameScreen
      onComplete={() => router.replace("/workout/session" as Href)}
      onCancel={() => router.replace("/home" as Href)}
      onReturnToSummary={() => router.replace("/workout/summary" as Href)}
    />
  );
}

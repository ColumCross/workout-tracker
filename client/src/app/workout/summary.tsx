import { type Href, router } from "expo-router";

import { WorkoutSummaryScreen } from "@/features/workout/screens/WorkoutSummaryScreen";

export default function SummaryRoute() {
  return (
    <WorkoutSummaryScreen
      onRestart={() => router.replace("/")}
      onNextExercise={() => router.replace("/workout/exercise" as Href)}
      onMissingSession={() => router.replace("/home" as Href)}
    />
  );
}

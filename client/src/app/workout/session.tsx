import { type Href, router } from "expo-router";

import { WorkoutSessionScreen } from "@/features/workout/screens/WorkoutSessionScreen";

export default function SessionRoute() {
  return (
    <WorkoutSessionScreen
      onFinished={() => router.replace("/workout/summary" as Href)}
      onDiscarded={() => router.replace("/home" as Href)}
      onMissingSession={() => router.replace("/home" as Href)}
    />
  );
}

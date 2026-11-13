import { type Href, router } from "expo-router";

import { HomeScreen } from "@/features/workout/screens/HomeScreen";

export default function HomeRoute() {
  return (
    <HomeScreen
      onNewWorkout={() => router.push("/workout/exercise" as Href)}
      onResumeWorkout={(stage) => router.push(
        (stage === "exercise-summary" ? "/workout/summary" : `/workout/${stage}`) as Href,
      )}
      onReports={() => router.push("/reports" as Href)}
      onPrivacyPolicy={() => router.push("/privacy-policy" as Href)}
    />
  );
}

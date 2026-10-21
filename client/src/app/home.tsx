import { type Href, router } from "expo-router";

import { HomeScreen } from "@/features/workout/screens/HomeScreen";

export default function HomeRoute() {
  return <HomeScreen onNewWorkout={() => router.push("/workout/exercise" as Href)} />;
}

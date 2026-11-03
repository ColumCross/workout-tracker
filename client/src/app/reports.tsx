import { type Href, router } from "expo-router";

import { ReportsScreen } from "@/features/workout/screens/ReportsScreen";

export default function ReportsRoute() {
  return <ReportsScreen onBack={() => router.replace("/home" as Href)} />;
}

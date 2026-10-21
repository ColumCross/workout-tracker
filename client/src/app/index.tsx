import { type Href, router } from "expo-router";

import { EntryScreen } from "@/features/workout/screens/EntryScreen";

export default function Index() {
  return <EntryScreen onContinue={() => router.replace("/home" as Href)} />;
}

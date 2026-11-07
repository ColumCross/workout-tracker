import { type Href, router } from "expo-router";

import { useAuthSession } from "@/features/auth/authSession";
import { PrivacyPolicyScreen } from "@/features/privacy/PrivacyPolicyScreen";
import { usePreviewSession } from "@/features/workout/previewSession";

export default function PrivacyPolicyRoute() {
  const { signOut } = useAuthSession();
  const { reset } = usePreviewSession();

  const finishDeletion = async () => {
    reset();
    await signOut();
    router.replace("/" as Href);
  };

  return (
    <PrivacyPolicyScreen
      onAccepted={() => router.replace("/home" as Href)}
      onDeleted={finishDeletion}
    />
  );
}

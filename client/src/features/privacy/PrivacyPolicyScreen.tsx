import { useState } from "react";
import { Dialog, Portal, Text, useTheme } from "react-native-paper";

import { GhostButton } from "@/features/workout/components/GhostButton";
import { Screen } from "@/features/workout/components/Screen";
import { policyConfigurationError } from "./policy";
import { PolicyDocument } from "./PolicyDocument";
import { acknowledgeEULA, deleteUser } from "./privacyGateway";

type PrivacyPolicyScreenProps = {
  onAccepted: () => void;
  onDeleted: () => Promise<void>;
};

export function PrivacyPolicyScreen({ onAccepted, onDeleted }: PrivacyPolicyScreenProps) {
  const theme = useTheme();
  const [action, setAction] = useState<"accepting" | "deleting" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setAction("accepting");
    setError(null);
    try {
      await acknowledgeEULA();
      onAccepted();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setAction(null);
    }
  };

  const removeAccount = async () => {
    setConfirmDelete(false);
    setAction("deleting");
    setError(null);
    try {
      await deleteUser();
      await onDeleted();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setAction(null);
    }
  };

  return (
    <Screen>
      <PolicyDocument />
      {policyConfigurationError || error ? <Text style={{ color: theme.colors.error }}>{policyConfigurationError ?? error}</Text> : null}
      <GhostButton disabled={action !== null || Boolean(policyConfigurationError)} loading={action === "accepting"} onPress={accept}>
        Acknowledge and Accept
      </GhostButton>
      <GhostButton disabled={action !== null} loading={action === "deleting"} onPress={() => setConfirmDelete(true)} textColor={theme.colors.error}>
        Delete account
      </GhostButton>

      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>Delete account?</Dialog.Title>
          <Dialog.Content>
            <Text>This permanently deletes your profile and all saved workouts.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <GhostButton onPress={() => setConfirmDelete(false)}>Cancel</GhostButton>
            <GhostButton onPress={removeAccount} textColor={theme.colors.error}>Delete account</GhostButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the request.";
}

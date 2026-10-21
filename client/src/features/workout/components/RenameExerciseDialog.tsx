import { useState } from "react";
import { Dialog, HelperText, Portal, TextInput } from "react-native-paper";

import { GhostButton } from "./GhostButton";

export function RenameExerciseDialog({ visible, initialName, onDismiss, onSave }: { visible: boolean; initialName: string; onDismiss: () => void; onSave: (name: string) => boolean }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(false);
  const save = () => {
    if (!onSave(name)) { setError(true); return; }
    onDismiss();
  };
  return (
    <Portal>
      <Dialog key={visible ? initialName : "closed"} visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Edit exercise</Dialog.Title>
        <Dialog.Content>
          <TextInput label="Exercise" value={name} onChangeText={(text) => { setName(text); setError(false); }} error={error} autoFocus />
          {error ? <HelperText type="error">Enter an exercise name.</HelperText> : null}
        </Dialog.Content>
        <Dialog.Actions>
          <GhostButton onPress={onDismiss}>Cancel</GhostButton>
          <GhostButton onPress={save}>Save</GhostButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

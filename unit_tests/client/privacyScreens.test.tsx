import { Linking, Pressable, Text, View } from "react-native";
import { PaperProvider } from "react-native-paper";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { PolicyDocument } from "@/features/privacy/PolicyDocument";
import { PrivacyPolicyScreen } from "@/features/privacy/PrivacyPolicyScreen";
import { acknowledgeEULA, deleteUser } from "@/features/privacy/privacyGateway";

jest.mock("@/features/privacy/policy", () => ({
  policyConfigurationError: null,
  policyBlocks: [
    { type: "heading", level: 1, text: "Synthetic Policy" },
    { type: "paragraph", text: "Read the **important** terms at [the policy site](https://policy.example.invalid)." },
    { type: "list", items: ["First item", "Second item"] },
  ],
}));
jest.mock("@/features/privacy/privacyGateway", () => ({ acknowledgeEULA: jest.fn(), deleteUser: jest.fn() }));
jest.mock("@/features/workout/components/Screen", () => {
  const { View: MockView } = require("react-native");
  return { Screen: ({ children }: PropsWithChildren) => <MockView>{children}</MockView> };
});
jest.mock("@/features/workout/components/GhostButton", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    GhostButton: ({ children, onPress, disabled }: PropsWithChildren<{ onPress: () => void; disabled?: boolean }>) => (
      <MockPressable accessibilityRole="button" disabled={disabled} onPress={onPress}><MockText>{children}</MockText></MockPressable>
    ),
  };
});

const mockAcknowledgeEULA = jest.mocked(acknowledgeEULA);
const mockDeleteUser = jest.mocked(deleteUser);

beforeEach(() => jest.clearAllMocks());

test("renders policy block types, bold text, list items, and opens links", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const screen = await render(<PolicyDocument />);
  expect(screen.getByText("Synthetic Policy")).toBeTruthy();
  expect(screen.getByText("important")).toBeTruthy();
  expect(screen.getByText("First item")).toBeTruthy();
  fireEvent.press(screen.getByText("the policy site"));
  expect(openURL).toHaveBeenCalledWith("https://policy.example.invalid");
  openURL.mockRestore();
});

test("accepts only after the gateway succeeds and retains the screen on failure", async () => {
  mockAcknowledgeEULA.mockRejectedValueOnce(new Error("Acceptance unavailable")).mockResolvedValueOnce(123);
  const onAccepted = jest.fn();
  const screen = await render(<PaperProvider><PrivacyPolicyScreen onAccepted={onAccepted} onDeleted={jest.fn()} /></PaperProvider>);
  await fireEvent.press(screen.getByText("Acknowledge and Accept"));
  await waitFor(() => expect(screen.getByText("Acceptance unavailable")).toBeTruthy());
  expect(onAccepted).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Acknowledge and Accept"));
  await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
});

test("cancel makes no deletion request; confirm runs backend then local cleanup", async () => {
  mockDeleteUser.mockResolvedValue(undefined);
  const onDeleted = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<PaperProvider><PrivacyPolicyScreen onAccepted={jest.fn()} onDeleted={onDeleted} /></PaperProvider>);
  await fireEvent.press(screen.getAllByText("Delete account")[0]);
  await fireEvent.press(await screen.findByText("Cancel"));
  expect(mockDeleteUser).not.toHaveBeenCalled();

  await fireEvent.press(screen.getAllByText("Delete account")[0]);
  const deleteButtons = await screen.findAllByText("Delete account");
  await fireEvent.press(deleteButtons[deleteButtons.length - 1]);
  await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledTimes(1));
  expect(onDeleted).toHaveBeenCalledTimes(1);
});

test("distinguishes backend deletion failure from post-deletion local cleanup failure", async () => {
  mockDeleteUser.mockRejectedValueOnce(new Error("Deletion rejected")).mockResolvedValueOnce(undefined);
  const onDeleted = jest.fn().mockRejectedValue(new Error("Deleted, but sign-out failed"));
  const screen = await render(<PaperProvider><PrivacyPolicyScreen onAccepted={jest.fn()} onDeleted={onDeleted} /></PaperProvider>);

  await fireEvent.press(screen.getAllByText("Delete account")[0]);
  await fireEvent.press((await screen.findAllByText("Delete account")).at(-1)!);
  await waitFor(() => expect(screen.getByText("Deletion rejected")).toBeTruthy());
  expect(onDeleted).not.toHaveBeenCalled();

  await fireEvent.press(screen.getAllByText("Delete account")[0]);
  await fireEvent.press((await screen.findAllByText("Delete account")).at(-1)!);
  await waitFor(() => expect(screen.getByText("Deleted, but sign-out failed")).toBeTruthy());
  expect(onDeleted).toHaveBeenCalledTimes(1);
});

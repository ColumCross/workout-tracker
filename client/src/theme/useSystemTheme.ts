import { useColorScheme } from "react-native";

export type SystemTheme = "light" | "dark";

export function useSystemTheme(): SystemTheme {
  return useColorScheme() === "light" ? "light" : "dark";
}

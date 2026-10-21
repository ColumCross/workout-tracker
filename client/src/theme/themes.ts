import { configureFonts, MD3DarkTheme, MD3LightTheme } from "react-native-paper";

const lightColors = {
  background: "#E8E8E8",
  surface: "#F5F5F5",
  surfaceVariant: "#E1E1E1",
  onSurface: "#171717",
  onSurfaceVariant: "#525252",
  outline: "#171717",
  outlineVariant: "#D4D4D4",
  primary: "#171717",
  onPrimary: "#171717",
  primaryContainer: "#F5F5F5",
  onPrimaryContainer: "#171717",
  secondary: "#525252",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#E5E5E5",
  onSecondaryContainer: "#171717",
  error: "#525252",
  onError: "#FFFFFF",
  errorContainer: "#E5E5E5",
  onErrorContainer: "#171717",
  elevation: {
    level0: "transparent",
    level1: "#F5F5F5",
    level2: "#F5F5F5",
    level3: "#F5F5F5",
    level4: "#F5F5F5",
    level5: "#F5F5F5",
  },
};

const darkColors = {
  background: "#252525",
  surface: "#333333",
  surfaceVariant: "#3D3D3D",
  onSurface: "#F5F5F5",
  onSurfaceVariant: "#BDBDBD",
  outline: "#8A8A8A",
  outlineVariant: "#404040",
  primary: "#E5E5E5",
  onPrimary: "#171717",
  primaryContainer: "#E5E5E5",
  onPrimaryContainer: "#171717",
  secondary: "#BDBDBD",
  onSecondary: "#171717",
  secondaryContainer: "#404040",
  onSecondaryContainer: "#F5F5F5",
  error: "#BDBDBD",
  onError: "#171717",
  errorContainer: "#404040",
  onErrorContainer: "#F5F5F5",
  elevation: {
    level0: "transparent",
    level1: "#1E1E1E",
    level2: "#1E1E1E",
    level3: "#1E1E1E",
    level4: "#1E1E1E",
    level5: "#1E1E1E",
  },
};

const lightFonts = configureFonts({ config: { fontFamily: "Roboto_400Regular" } });
const darkFonts = configureFonts({ config: { fontFamily: "Roboto_400Regular" } });

export const lightTheme = { ...MD3LightTheme, roundness: 0, fonts: lightFonts, colors: { ...MD3LightTheme.colors, ...lightColors } };
export const darkTheme = { ...MD3DarkTheme, roundness: 0, fonts: darkFonts, colors: { ...MD3DarkTheme.colors, ...darkColors } };
export const timerAccent = { light: "#2563EB", dark: "#60A5FA" };

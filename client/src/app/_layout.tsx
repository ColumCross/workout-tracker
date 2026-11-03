import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Roboto_400Regular, Roboto_500Medium } from "@expo-google-fonts/roboto";

import { AuthSessionProvider, useAuthSession } from "@/features/auth/authSession";
import { PreviewSessionProvider } from "@/features/workout/previewSession";
import { darkTheme, lightTheme } from "@/theme/themes";
import { useSystemTheme } from "@/theme/useSystemTheme";

export default function RootLayout() {
  const colorScheme = useSystemTheme();
  const theme = colorScheme === "light" ? lightTheme : darkTheme;
  const [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_500Medium });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PaperProvider theme={theme}>
          <AuthSessionProvider>
            <PreviewSessionProvider>
              <RootNavigator />
              <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            </PreviewSessionProvider>
          </AuthSessionProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { loading, session } = useAuthSession();
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/callback" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="home" />
        <Stack.Screen name="reports" />
        <Stack.Screen name="workout/exercise" />
        <Stack.Screen name="workout/session" />
        <Stack.Screen name="workout/summary" />
      </Stack.Protected>
    </Stack>
  );
}

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.invalid";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "test-google-client-id";

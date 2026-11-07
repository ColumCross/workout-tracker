import { setupFixtures } from "./helpers/lifecycle.mjs";

const state = await setupFixtures();
console.log("Synthetic local backend fixtures created; sensitive session state is in the OS temp directory.");
console.log(`Bruno environment: ${state.brunoEnvironmentPath}`);

import { cleanupFixtures } from "./helpers/lifecycle.mjs";

await cleanupFixtures();
console.log("Synthetic local backend fixtures removed.");

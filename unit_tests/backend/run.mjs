import { spawnSync } from "node:child_process";
import { cleanupFixtures, setupFixtures } from "./helpers/lifecycle.mjs";

const suites = [
  "auth.test.mjs",
  "provisioning.test.mjs",
  "workout-id.test.mjs",
  "save-workout.test.mjs",
  "validation.test.mjs",
  "permissions-ownership.test.mjs",
  "history.test.mjs",
  "eula.test.mjs",
  "deletion.test.mjs",
];

let exitCode = 0;
try {
  await setupFixtures();
  for (const suite of suites) {
    const result = spawnSync(process.execPath, ["--test", new URL(suite, import.meta.url).pathname], {
      cwd: new URL("../..", import.meta.url).pathname,
      stdio: "inherit",
    });
    if (result.status !== 0) { exitCode = result.status ?? 1; break; }
  }
} finally {
  try { await cleanupFixtures(); } catch (error) {
    console.error(error.message);
    exitCode ||= 1;
  }
}
process.exitCode = exitCode;

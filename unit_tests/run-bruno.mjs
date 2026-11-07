import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { cleanupFixtures, setupFixtures } from "./backend/helpers/lifecycle.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
let exitCode = 0;

try {
  const state = await setupFixtures();
  const result = spawnSync("npx", ["--yes", "@usebruno/cli@latest", "run", ".", "--env-file", state.brunoEnvironmentPath], {
    cwd: resolve(root, "unit_tests/bruno"),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} finally {
  try { await cleanupFixtures(); } catch (error) {
    console.error(error.message);
    exitCode ||= 1;
  }
}

process.exitCode = exitCode;

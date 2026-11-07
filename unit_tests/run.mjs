import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const commands = [
  ["npm", ["--prefix", "client", "run", "test:client"]],
  [process.execPath, ["unit_tests/backend/run.mjs"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}

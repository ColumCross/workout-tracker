import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(new URL("../../..", import.meta.url).pathname);
const testTreeRoot = resolve(new URL("../..", import.meta.url).pathname);

function parseEnvironment(output) {
  return Object.fromEntries(
    output.trim().split("\n").map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(?:"(.*)"|'(.*)'|(.*))$/);
      return match ? [match[1], match[2] ?? match[3] ?? match[4]] : null;
    }).filter(Boolean),
  );
}

function assertLocalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("Backend tests refuse to use a nonlocal Supabase target.");
  }
  return url.origin;
}

export function localConfig() {
  const environment = parseEnvironment(execFileSync("supabase", ["status", "-o", "env"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }));
  const url = assertLocalUrl(environment.API_URL ?? "");
  const anonKey = environment.ANON_KEY ?? environment.PUBLISHABLE_KEY;
  const serviceRoleKey = environment.SERVICE_ROLE_KEY ?? environment.SECRET_KEY;
  const jwtSecret = environment.JWT_SECRET;
  if (!anonKey || !serviceRoleKey || !jwtSecret) throw new Error("Local Supabase keys are unavailable.");
  return { url, anonKey, serviceRoleKey, jwtSecret };
}

export function runtimeStatePath() {
  const directory = resolve(process.env.WORKOUT_TRACKER_TEST_STATE_DIR ?? tmpdir(), "workout-tracker-backend-tests");
  if (directory === testTreeRoot || directory.startsWith(`${testTreeRoot}/`)) {
    throw new Error("Sensitive backend test state must remain outside unit_tests.");
  }
  return resolve(directory, "state.json");
}

export function brunoEnvironmentPath() {
  return resolve(dirname(runtimeStatePath()), "bruno-local.json");
}

export { repositoryRoot };

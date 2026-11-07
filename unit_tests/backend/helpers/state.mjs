import { readFile } from "node:fs/promises";
import { runtimeStatePath } from "./config.mjs";

export async function loadState() {
  const state = JSON.parse(await readFile(runtimeStatePath(), "utf8"));
  if (state.version !== 1 || !state.users?.a || !state.users?.b || !state.users?.authOnly) {
    throw new Error("Backend fixtures are missing or incompatible; run setup.mjs first.");
  }
  return state;
}

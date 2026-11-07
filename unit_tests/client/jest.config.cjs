const path = require("node:path");
const clientRoot = path.resolve(__dirname, "../../client");
const originalCwd = process.cwd();
process.chdir(clientRoot);
const expoPreset = require(path.join(clientRoot, "node_modules/jest-expo/jest-preset"));
process.chdir(originalCwd);

module.exports = {
  ...expoPreset,
  rootDir: clientRoot,
  roots: [path.resolve(__dirname)],
  testMatch: ["<rootDir>/../unit_tests/client/**/*.test.{ts,tsx}"],
  setupFiles: [...(expoPreset.setupFiles ?? []), path.resolve(__dirname, "act-environment.cjs")],
  moduleDirectories: [path.join(clientRoot, "node_modules"), "node_modules"],
  setupFilesAfterEnv: [path.resolve(__dirname, "setup.ts")],
  moduleNameMapper: {
    ...expoPreset.moduleNameMapper,
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    ...expoPreset.transform,
    "^.+\\.md$": path.resolve(__dirname, "markdown-transformer.cjs"),
  },
};

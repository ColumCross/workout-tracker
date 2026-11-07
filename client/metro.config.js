const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname, "..")];
config.resolver.sourceExts.push("md");
config.transformer.babelTransformerPath = require.resolve("./markdown-transformer");

module.exports = config;

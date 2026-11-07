const upstreamTransformer = require("@expo/metro-config/build/babel-transformer");

module.exports.transform = ({ src, filename, options }) => {
  if (filename.endsWith(".md")) {
    return upstreamTransformer.transform({
      src: `module.exports = ${JSON.stringify(src)};`,
      filename: `${filename}.js`,
      options,
    });
  }

  return upstreamTransformer.transform({ src, filename, options });
};

// biome-ignore-all lint/correctness/noGlobalDirnameFilename: Metro config is CommonJS.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// The library is consumed straight from source via its "react-native" export
// condition, so Metro has to watch the repo root and resolve the example's own
// copies of react / react-native rather than the ones hoisted beside it.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;

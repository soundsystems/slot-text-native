// biome-ignore-all lint/correctness/noGlobalDirnameFilename: Metro config is CommonJS.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const singletonPackages = new Set([
  "react",
  "react-dom",
  "react-native",
  "react-native-reanimated",
  "react-native-worklets",
]);

const config = getDefaultConfig(projectRoot);

// The library is consumed straight from source via its "react-native" export
// condition, so Metro has to watch the repo root. Keep React and its native
// runtimes pinned to the example while allowing pnpm dependencies to resolve
// through their real symlink ancestry.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const packageName = moduleName.startsWith("@")
    ? moduleName.split("/").slice(0, 2).join("/")
    : moduleName.split("/")[0];

  if (singletonPackages.has(packageName)) {
    return context.resolveRequest(
      context,
      path.resolve(projectRoot, "node_modules", moduleName),
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

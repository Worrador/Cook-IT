const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable support for react-native-fs and other native modules
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Ensure proper handling of both Expo Go and production builds
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// Ignore native build artifacts in node_modules (Windows file watcher crashes otherwise)
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /node_modules[\\/].*[\\/]android[\\/]build[\\/].*/,
  // Gradle's native (CMake/NDK) build writes and then deletes temp directories under
  // android/.cxx while it runs. On Windows Metro's fallback watcher has no inotify
  // equivalent, so it fs.watch()es each directory it walks and crashes with
  // ENOENT (-4058) when one disappears mid-walk. Never watch these.
  /node_modules[\\/].*[\\/]android[\\/]\.cxx[\\/].*/,
];

module.exports = config;
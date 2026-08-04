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
];

module.exports = config;
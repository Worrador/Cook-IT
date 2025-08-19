const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable support for react-native-fs and other native modules
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Ensure proper handling of both Expo Go and production builds
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
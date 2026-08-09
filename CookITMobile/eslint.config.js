// ESLint flat config for Cook-IT Mobile (Expo SDK 53).
//
// `eslint-config-expo/flat` brings the React / React Hooks / import rules that
// match the Expo + React Native toolchain this app is built with.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    // Build output, native projects and vendored code are not ours to lint.
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      'coverage/**',
      '.expo/**',
      'babel.config.js',
      'metro.config.js',
      'tailwind.config.js',
      // Unreferenced legacy file: imports 'react-native-sqlite-storage', which is not
      // a dependency of this project and is not imported by any live code. Left in
      // place rather than deleted, but excluded so it can't fail the lint run.
      'src/services/database.js',
    ],
  },
  ...expoConfig,
  {
    rules: {
      // A web-React rule about HTML entity escaping. React Native renders text in
      // <Text>, not HTML, so apostrophes and quotes in copy are correct as written.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // Jest runs these in a Node environment (see jest.config.js), so the test
    // globals are not present in the app's own React Native environment.
    files: ['**/__tests__/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      // jest.mock() calls are hoisted above imports, so the mocks must be declared
      // before the modules under test are imported. That ordering is required here,
      // not a style slip.
      'import/first': 'off',
    },
  },
];

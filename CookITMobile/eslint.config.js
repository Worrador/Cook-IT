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
    ],
  },
  ...expoConfig,
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
  },
];

module.exports = {
  // Test environment - Node.js for pure JS testing
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/*.test.js'
  ],

  // Coverage collection
  collectCoverage: true,
  collectCoverageFrom: [
    'src/services/**/*.js',
    '!src/services/**/*.test.js',
    '!src/services/interfaces.js' // Mock interfaces don't need coverage
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/services/__tests__/setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Module name mapping for imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    '/build/',
    '/dist/'
  ],

  // Watch patterns
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
  ]
};
// Test setup file - runs before all tests
import { jest } from '@jest/globals';

// Global test utilities
global.TestUtils = {
  // Helper to create test recipes
  createTestRecipe: (name, options = {}) => ({
    name,
    url: options.url || `http://example.com/${name.toLowerCase().replace(/\s+/g, '-')}`,
    comment: options.comment || `Test recipe: ${name}`,
    createdAt: options.createdAt || new Date().toISOString(),
    lastModified: options.lastModified || new Date().toISOString(),
    cooked: options.cooked || false
  }),

  // Helper to create test conflicts
  createTestConflict: (type, localValue, remoteValue, localTime, remoteTime) => ({
    type,
    localValue,
    remoteValue,
    localModified: localTime || new Date().toISOString(),
    remoteModified: remoteTime || new Date(Date.now() - 1000).toISOString(),
    resolution: 'merge'
  }),

  // Helper to wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to create mock storage data
  createMockStorageData: (recipes = [], cookedDates = {}, pinnedRecipes = []) => ({
    recipes,
    cookedRecipes: {},
    pinnedRecipes,
    lastCookedDates: cookedDates,
    lastSync: null,
    storage: {}
  })
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Mock Date.now() for consistent testing
const mockDate = new Date('2024-01-01T12:00:00.000Z');
global.Date.now = jest.fn(() => mockDate.getTime());

// Global test timeout
jest.setTimeout(10000);

// Suppress specific console warnings during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific warnings that are expected in tests
  if (args[0]?.includes('SyncService not available') ||
      args[0]?.includes('ExcelService not available')) {
    return;
  }
  originalWarn(...args);
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test environment setup
beforeAll(() => {
  // Set up any global test environment
  process.env.NODE_ENV = 'test';
});

// Global test environment cleanup
afterAll(() => {
  // Clean up any global test environment
  jest.restoreAllMocks();
});
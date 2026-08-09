// Interface contracts for testing and dependency injection
// These define the expected behavior of external services

/**
 * Storage Provider Interface
 * Handles all local data persistence operations
 */
export const StorageProviderInterface = {
  // Recipe management
  loadRecipes: 'async function() -> Array<Recipe>',
  saveRecipes: 'async function(recipes: Array<Recipe>) -> boolean',

  // Cooked recipes tracking
  getLastCookedDates: 'async function() -> Object<string, string>',
  setLastCookedDates: 'async function(dates: Object<string, string>) -> boolean',

  // Pinned recipes
  getPinnedRecipes: 'async function() -> Array<string>',
  setPinnedRecipes: 'async function(recipes: Array<string>) -> boolean',

  // Generic storage
  getItem: 'async function(key: string) -> string | null',
  setItem: 'async function(key: string, value: string) -> boolean',
  removeItem: 'async function(key: string) -> boolean'
};

/**
 * Drive Client Interface
 * Handles all cloud storage operations
 */
export const DriveClientInterface = {
  // Authentication
  isAuthenticated: 'function() -> boolean',
  authenticate: 'async function() -> boolean',
  signOut: 'async function() -> { success: boolean, signedOutFromGoogle?: boolean, message?: string }',

  // File operations
  upload: 'async function(filePath: string) -> { success: boolean, message?: string }',
  download: 'async function(remotePath: string) -> { success: boolean, filePath?: string, message?: string }',

  // File management
  listFiles: 'async function() -> Array<FileInfo>',
  deleteFile: 'async function(fileId: string) -> boolean',

  // File info
  getFileInfo: 'async function(fileId: string) -> FileInfo | null'
};

/**
 * Excel Processor Interface
 * Handles Excel file creation, parsing, and conflict detection
 */
export const ExcelProcessorInterface = {
  // Initialization
  initialize: 'async function() -> boolean',

  // File operations
  createLocalExcelFile: 'async function() -> boolean',
  importFromExcel: 'async function(filePath?: string) -> { success: boolean, recipes?: Array<Recipe>, lastCookedDates?: Object, pinnedRecipes?: Array<string> }',

  // File paths
  getLocalFilePath: 'function() -> string',
  getRemoteFilePath: 'function() -> string',

  // Conflict detection and resolution
  checkConflicts: 'async function() -> { hasConflicts: boolean, conflicts?: Array<Conflict>, message?: string }',
  resolveConflict: 'async function(resolution: string) -> { success: boolean, message?: string }',
  getConflictResolutionOptions: 'function() -> Array<string>',

  // Data updates
  updateWithLocalData: 'async function() -> boolean',

  // File information
  getLocalFileInfo: 'async function() -> FileInfo | null'
};

/**
 * Recipe Data Structure
 */
export const RecipeStructure = {
  name: 'string (required)',
  url: 'string (optional)',
  comment: 'string (optional)',
  createdAt: 'string (ISO date)',
  lastModified: 'string (ISO date)',
  cooked: 'boolean (optional)'
};

/**
 * File Information Structure
 */
export const FileInfoStructure = {
  id: 'string (optional)',
  name: 'string',
  size: 'number (bytes)',
  modifiedTime: 'string (ISO date)',
  path: 'string'
};

/**
 * Conflict Information Structure
 */
export const ConflictStructure = {
  type: 'string (recipe|date|pinned)',
  localValue: 'any',
  remoteValue: 'any',
  localModified: 'string (ISO date)',
  remoteModified: 'string (ISO date)',
  resolution: 'string (local|remote|merge)'
};

/**
 * Sync Result Structure
 */
export const SyncResultStructure = {
  success: 'boolean',
  hasChanges: 'boolean (optional)',
  message: 'string (optional)',
  data: 'Object (optional)',
  conflictResolved: 'boolean (optional)',
  resolutionStrategy: 'string (optional)'
};

/**
 * Mock Implementations for Testing
 */

/**
 * Mock Storage Provider for testing
 */
export class MockStorageProvider {
  constructor(initialData = {}) {
    this.storage = {
      '@cookit_recipes': JSON.stringify(initialData.recipes || [
        { name: 'Default Recipe', url: 'http://example.com/default', comment: 'Default test recipe' }
      ]),
      '@cookit_cooked_recipes': JSON.stringify(initialData.cookedRecipes || {}),
      '@cookit_pinned_recipes': JSON.stringify(initialData.pinnedRecipes || []),
      '@cookit_last_cooked_dates': JSON.stringify(initialData.lastCookedDates || {}),
      '@cookit_last_sync': initialData.lastSync || null,
      '@cookit_last_data_modification': initialData.lastDataModification || null,
      '@cookit_sync_in_progress': 'false',
      '@cookit_excel_sync_mode': 'excel',
      ...initialData.storage
    };
  }

  async getItem(key) {
    return this.storage[key] || null;
  }

  async setItem(key, value) {
    this.storage[key] = value;
    return true;
  }

  async removeItem(key) {
    delete this.storage[key];
    return true;
  }

  async loadRecipes() {
    const data = await this.getItem('@cookit_recipes');
    return data ? JSON.parse(data) : [];
  }

  async saveRecipes(recipes, skipModificationTimeUpdate = false) {
    const result = await this.setItem('@cookit_recipes', JSON.stringify(recipes));
    if (!skipModificationTimeUpdate) {
      await this.updateDataModificationTime();
    }
    return result;
  }

  async getLastCookedDates() {
    const data = await this.getItem('@cookit_last_cooked_dates');
    return data ? JSON.parse(data) : {};
  }

  async setLastCookedDates(dates) {
    return await this.setItem('@cookit_last_cooked_dates', JSON.stringify(dates));
  }

  async getPinnedRecipes() {
    const data = await this.getItem('@cookit_pinned_recipes');
    return data ? JSON.parse(data) : [];
  }

  async setPinnedRecipes(recipes) {
    return await this.setItem('@cookit_pinned_recipes', JSON.stringify(recipes));
  }

  async getLastDataModificationTime() {
    const value = await this.getItem('@cookit_last_data_modification');
    return value ? new Date(value) : new Date(0);
  }

  async updateDataModificationTime() {
    return await this.setItem('@cookit_last_data_modification', new Date().toISOString());
  }

  // Helper method to get current storage state for assertions
  getStorageState() {
    return { ...this.storage };
  }
}

/**
 * Mock Drive Client for testing
 */
export class MockDriveClient {
  constructor(options = {}) {
    this.authenticated = options.authenticated || false;
    this.files = options.files || new Map();
    this.shouldFail = options.shouldFail || false;
    this.failMessage = options.failMessage || 'Mock drive operation failed';
    this.driveFileId = options.driveFileId || 'mock_drive_file';
  }

  isAuthenticated() {
    return this.authenticated;
  }

  async authenticate() {
    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }
    this.authenticated = true;
    return true;
  }

  async signOut() {
    if (this.shouldFail) {
      return { success: false, message: this.failMessage };
    }
    this.authenticated = false;
    return { success: true, signedOutFromGoogle: true };
  }

  async upload(filePath) {
    if (this.shouldFail) {
      return { success: false, message: this.failMessage };
    }

    const fileName = filePath.split('/').pop();
    const fileId = `mock_file_${Date.now()}`;

    this.files.set(fileId, {
      id: fileId,
      name: fileName,
      path: filePath,
      size: 1024,
      modifiedTime: new Date().toISOString()
    });

    return { success: true, fileId };
  }

  async download(remotePath) {
    if (this.shouldFail) {
      return { success: false, message: this.failMessage };
    }

    // Find file by path
    const file = Array.from(this.files.values()).find(f => f.path === remotePath);

    if (!file) {
      return { success: false, message: 'File not found' };
    }

    return {
      success: true,
      filePath: `/mock/downloads/${file.name}`,
      fileId: file.id
    };
  }

  async listFiles() {
    return Array.from(this.files.values());
  }

  async getDriveFileId() {
    return this.driveFileId;
  }

  async getFileInfo(fileId) {
    if (this.shouldFail) throw new Error(this.failMessage);
    return {
      id: fileId,
      name: 'CookIT_Recipes.xlsx',
      modifiedTime: new Date().toISOString()
    };
  }

  // Helper methods for testing
  setAuthenticationState(authenticated) {
    this.authenticated = authenticated;
  }

  addFile(fileInfo) {
    this.files.set(fileInfo.id, fileInfo);
  }

  clearFiles() {
    this.files.clear();
  }

  setFailureMode(shouldFail, message) {
    this.shouldFail = shouldFail;
    this.failMessage = message;
  }
}

/**
 * Mock Excel Processor for testing
 */
export class MockExcelProcessor {
  constructor(options = {}) {
    this.initialized = false;
    this.localFilePath = options.localFilePath || '/mock/excel/local.xlsx';
    this.remoteFilePath = options.remoteFilePath || '/mock/excel/remote.xlsx';
    this.shouldFail = options.shouldFail || false;
    this.failMessage = options.failMessage || 'Mock Excel operation failed';
    this.conflicts = options.conflicts || [];
    this.mockData = options.mockData || {
      recipes: [
        { name: 'Mock Recipe 1', url: 'http://example.com/1', comment: 'Test recipe' },
        { name: 'Mock Recipe 2', url: 'http://example.com/2', comment: 'Another test' }
      ],
      lastCookedDates: { 'Mock Recipe 1': '2024-01-01T00:00:00.000Z' },
      pinnedRecipes: ['Mock Recipe 1']
    };
  }

  async initialize() {
    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }
    this.initialized = true;
    return true;
  }

  async createLocalExcelFile() {
    if (this.shouldFail) {
      return false;
    }
    return true;
  }

  async downloadFromDrive() {
    if (this.shouldFail) throw new Error(this.failMessage);
    return true;
  }

  async uploadToDrive() {
    if (this.shouldFail) throw new Error(this.failMessage);
    return true;
  }

  async importFromExcel(filePath = this.localFilePath) {
    if (this.shouldFail) {
      return { success: false, message: this.failMessage };
    }

    // Return mock data
    return {
      success: true,
      recipes: this.mockData.recipes,
      lastCookedDates: this.mockData.lastCookedDates,
      pinnedRecipes: this.mockData.pinnedRecipes
    };
  }

  getLocalFilePath() {
    return this.localFilePath;
  }

  getRemoteFilePath() {
    return this.remoteFilePath;
  }

  async checkConflicts() {
    if (this.shouldFail) {
      return { hasConflicts: false, message: this.failMessage };
    }

    return {
      hasConflicts: this.conflicts.length > 0,
      conflicts: this.conflicts
    };
  }

  async resolveConflict(resolution) {
    if (this.shouldFail) {
      return { success: false, message: this.failMessage };
    }

    return { success: true, message: `Conflict resolved using ${resolution} strategy` };
  }

  getConflictResolutionOptions() {
    return ['local', 'remote', 'merge'];
  }

  async updateWithLocalData() {
    if (this.shouldFail) {
      return false;
    }
    return true;
  }

  async getLocalFileInfo() {
    if (this.shouldFail) {
      return null;
    }

    return {
      name: 'local.xlsx',
      size: 2048,
      modifiedTime: new Date().toISOString(),
      path: this.localFilePath
    };
  }

  // Helper methods for testing
  setConflicts(conflicts) {
    this.conflicts = conflicts;
  }

  setFailureMode(shouldFail, message) {
    this.shouldFail = shouldFail;
    this.failMessage = message;
  }

  setInitializationState(initialized) {
    this.initialized = initialized;
  }

  setMockData(mockData) {
    this.mockData = mockData;
  }
}

/**
 * Test Data Factory
 */
export const TestDataFactory = {
  createRecipe(name, options = {}) {
    return {
      name,
      url: options.url || `http://example.com/${name.toLowerCase().replace(/\s+/g, '-')}`,
      comment: options.comment || `Test recipe: ${name}`,
      createdAt: options.createdAt || new Date().toISOString(),
      lastModified: options.lastModified || new Date().toISOString(),
      cooked: options.cooked || false
    };
  },

  createConflict(type, localValue, remoteValue, localTime, remoteTime) {
    return {
      type,
      localValue,
      remoteValue,
      localModified: localTime || new Date().toISOString(),
      remoteModified: remoteTime || new Date(Date.now() - 1000).toISOString(),
      resolution: 'merge'
    };
  },

  createMockDependencies(options = {}) {
    return {
      storageProvider: new MockStorageProvider(options.storage || {}),
      driveClient: new MockDriveClient(options.drive || {}),
      excelProcessor: new MockExcelProcessor(options.excel || {}),
      config: options.config || {}
    };
  }
};

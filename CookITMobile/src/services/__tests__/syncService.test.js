import { SyncService } from '../syncService';
import {
  MockStorageProvider,
  MockDriveClient,
  MockExcelProcessor,
  TestDataFactory
} from '../interfaces';

describe('SyncService', () => {
  let syncService;
  let mockStorage;
  let mockDrive;
  let mockExcel;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockStorage = new MockStorageProvider();
    mockDrive = new MockDriveClient();
    mockExcel = new MockExcelProcessor({
      mockData: {
        recipes: [
          { name: 'Test Recipe', url: 'http://example.com/test', comment: 'Test recipe' }
        ],
        lastCookedDates: { 'Test Recipe': '2024-01-01T00:00:00.000Z' },
        pinnedRecipes: ['Test Recipe']
      }
    });

    syncService = new SyncService({
      storageProvider: mockStorage,
      driveClient: mockDrive,
      excelProcessor: mockExcel
    });
  });

  describe('Constructor and Dependencies', () => {
    test('should create instance with injected dependencies', () => {
      expect(syncService.storageProvider).toBe(mockStorage);
      expect(syncService.driveClient).toBe(mockDrive);
      expect(syncService.excelProcessor).toBe(mockExcel);
    });

    test('should use default config when none provided', () => {
      const defaultService = new SyncService();
      expect(defaultService.config.lastSyncKey).toBe('@cookit_last_sync');
      expect(defaultService.config.syncInProgressKey).toBe('@cookit_sync_in_progress');
    });

    test('should allow custom config override', () => {
      const customConfig = { lastSyncKey: '@custom_key' };
      const customService = new SyncService({ config: customConfig });
      expect(customService.config.lastSyncKey).toBe('@custom_key');
    });
  });

  describe('Storage Operations', () => {
    test('should get last sync time from storage', async () => {
      const testTime = new Date().toISOString();
      await mockStorage.setItem('@cookit_last_sync', testTime);

      const result = await syncService.getLastSyncTime();
      expect(result).toEqual(new Date(testTime));
    });

    test('should set last sync time in storage', async () => {
      const testTime = new Date();
      await syncService.setLastSyncTime(testTime);

      const stored = await mockStorage.getItem('@cookit_last_sync');
      expect(stored).toBe(testTime.toISOString());
    });

    test('should check sync progress state', async () => {
      await mockStorage.setItem('@cookit_sync_in_progress', 'true');

      const result = await syncService.isSyncInProgress();
      expect(result).toBe(true);
    });

    test('should set sync progress state', async () => {
      await syncService.setSyncInProgress(true);

      const result = await mockStorage.getItem('@cookit_sync_in_progress');
      expect(result).toBe('true');
    });

    test('should get and set sync mode', async () => {
      await syncService.setSyncMode('manual');

      const result = await syncService.getSyncMode();
      expect(result).toBe('manual');
    });
  });

  describe('Recipe Key Generation', () => {
    test('should generate unique recipe keys', () => {
      const recipe1 = { name: 'Pizza', url: 'http://example.com/pizza', comment: 'Delicious' };
      const recipe2 = { name: 'Pizza', url: 'http://example.com/pizza', comment: 'Amazing' };

      const key1 = syncService.getRecipeKey(recipe1);
      const key2 = syncService.getRecipeKey(recipe2);

      expect(key1).toBe('Pizza|http://example.com/pizza|Delicious');
      expect(key2).toBe('Pizza|http://example.com/pizza|Amazing');
      expect(key1).not.toBe(key2);
    });

    test('should handle missing recipe properties', () => {
      const recipe = { name: 'Pizza' };
      const key = syncService.getRecipeKey(recipe);

      expect(key).toBe('Pizza||');
    });
  });

  describe('Data Merging Logic', () => {
    test('should merge local and remote recipes without conflicts', async () => {
      const localRecipes = [
        TestDataFactory.createRecipe('Local Recipe 1'),
        TestDataFactory.createRecipe('Local Recipe 2')
      ];

      const remoteRecipes = [
        TestDataFactory.createRecipe('Remote Recipe 1'),
        TestDataFactory.createRecipe('Remote Recipe 2')
      ];

      const result = await syncService.mergeExcelData(
        localRecipes, {}, [], // local data
        remoteRecipes, {}, []  // remote data
      );

      expect(result.hasChanges).toBe(true);
      expect(result.mergedRecipes).toHaveLength(4);
      expect(result.mergedRecipes.map(r => r.name)).toContain('Local Recipe 1');
      expect(result.mergedRecipes.map(r => r.name)).toContain('Remote Recipe 1');
    });

    test('should handle recipe updates based on timestamps', async () => {
      const oldTime = new Date('2024-01-01').toISOString();
      const newTime = new Date('2024-01-02').toISOString();

      const localRecipe = {
        name: 'Same Recipe',
        url: 'http://example.com/same-recipe',
        comment: 'Test recipe',
        lastModified: newTime
      };

      const remoteRecipe = {
        name: 'Same Recipe',
        url: 'http://example.com/same-recipe',
        comment: 'Test recipe',
        lastModified: oldTime
      };

      const result = await syncService.mergeExcelData(
        [localRecipe], {}, [],
        [remoteRecipe], {}, []
      );

      expect(result.hasChanges).toBe(true);
      const mergedRecipe = result.mergedRecipes.find(r => r.name === 'Same Recipe');
      expect(mergedRecipe.lastModified).toBe(newTime);
    });

    test('should merge last cooked dates keeping most recent', async () => {
      const localDates = { 'Recipe 1': '2024-01-02T00:00:00.000Z' };
      const remoteDates = { 'Recipe 1': '2024-01-01T00:00:00.000Z' };

      const result = await syncService.mergeExcelData(
        [], localDates, [],
        [], remoteDates, []
      );

      expect(result.hasChanges).toBe(true);
      expect(result.mergedLastCookedDates['Recipe 1']).toBe('2024-01-02T00:00:00.000Z');
    });

    test('should merge pinned recipes without duplicates', async () => {
      const localPinned = ['Recipe 1', 'Recipe 2'];
      const remotePinned = ['Recipe 2', 'Recipe 3'];

      const result = await syncService.mergeExcelData(
        [], {}, localPinned,
        [], {}, remotePinned
      );

      expect(result.hasChanges).toBe(true);
      expect(result.mergedPinnedRecipes).toHaveLength(3);
      expect(result.mergedPinnedRecipes).toContain('Recipe 1');
      expect(result.mergedPinnedRecipes).toContain('Recipe 2');
      expect(result.mergedPinnedRecipes).toContain('Recipe 3');
    });
  });

  describe('Conflict Resolution', () => {
    test('should handle conflicts with force push', async () => {
      mockExcel.setConflicts([
        TestDataFactory.createConflict('recipe', 'local', 'remote', '2024-01-02', '2024-01-01')
      ]);

      const result = await syncService.handleExcelConflicts(
        { hasConflicts: true },
        true // forcePush
      );

      expect(result.success).toBe(true);
      expect(result.conflictResolved).toBe(true);
      expect(result.message).toContain('Force push completed successfully');
    });

    test('should auto-resolve conflicts using merge strategy', async () => {
      mockExcel.setConflicts([
        TestDataFactory.createConflict('recipe', 'local', 'remote', '2024-01-02', '2024-01-01')
      ]);

      const result = await syncService.handleExcelConflicts(
        { hasConflicts: true },
        false // no force push
      );

      expect(result.success).toBe(true);
      expect(result.conflictResolved).toBe(true);
      expect(result.resolutionStrategy).toBe('merge');
    });

    test('should handle conflict resolution failures', async () => {
      mockExcel.setConflicts([
        TestDataFactory.createConflict('recipe', 'local', 'remote', '2024-01-02', '2024-01-01')
      ]);
      mockExcel.setFailureMode(true, 'Conflict resolution failed');

      const result = await syncService.handleExcelConflicts(
        { hasConflicts: true },
        false
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Conflict resolution failed');
    });
  });

  describe('Excel Sync Operations', () => {
    test('should perform Excel sync when no conflicts exist', async () => {
      // Setup mock data
      const localRecipes = [TestDataFactory.createRecipe('Test Recipe')];
      await mockStorage.saveRecipes(localRecipes);

      // Mock Drive client to be authenticated
      mockDrive.setAuthenticationState(true);

      // Mock successful download with same data as local
      const mockDownloadResult = {
        success: true,
        filePath: '/mock/downloads/test.xlsx'
      };

      // Mock the download method to return success
      mockDrive.download = jest.fn().mockResolvedValue(mockDownloadResult);

      // Mock Excel processor to return the same data as local storage
      mockExcel.importFromExcel = jest.fn().mockResolvedValue({
        success: true,
        recipes: localRecipes,
        lastCookedDates: {},
        pinnedRecipes: []
      });

      // Mock no conflicts
      mockExcel.setConflicts([]);

      const result = await syncService.performExcelSync();

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true); // First comparison imports the Drive data.
    });

    test('should handle force push mode', async () => {
      const localRecipes = [TestDataFactory.createRecipe('Test Recipe')];
      await mockStorage.saveRecipes(localRecipes);

      const result = await syncService.performExcelSync(true); // forcePush = true

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.message).toContain('Force push completed successfully');
    });

    test('should prevent concurrent syncs', async () => {
      syncService.isSyncing = true;

      const result = await syncService.performExcelSync();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Sync already in progress');
    });

    test('should handle sync errors gracefully', async () => {
      // Mock Drive client to be authenticated
      mockDrive.setAuthenticationState(true);

      // Download errors must return a safe sync result.
      mockExcel.downloadFromDrive = jest.fn().mockRejectedValue(new Error('Drive download failed'));

      const result = await syncService.performExcelSync();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Drive download failed');
    });
  });

  describe('Authentication and Initialization', () => {
    test('should initialize sync when all dependencies are available', async () => {
      mockDrive.setAuthenticationState(false);
      mockExcel.setInitializationState(false);

      // Mock successful authentication
      mockDrive.setFailureMode(false);
      mockDrive.authenticate = jest.fn().mockResolvedValue(true);

      // Mock successful Excel initialization
      mockExcel.initialize = jest.fn().mockImplementation(async () => {
        mockExcel.initialized = true;
        return true;
      });

      // Mock successful Drive download to return valid data
      mockDrive.download = jest.fn().mockResolvedValue({
        success: true,
        filePath: '/mock/downloads/test.xlsx'
      });

      // Mock Excel import to return valid data
      mockExcel.importFromExcel = jest.fn().mockResolvedValue({
        success: true,
        recipes: [],
        lastCookedDates: {},
        pinnedRecipes: []
      });

      const result = await syncService.initializeSync();

      expect(result.success).toBe(true);
      expect(mockExcel.initialized).toBe(true);
    });

    test('should handle authentication failures', async () => {
      mockDrive.setFailureMode(true, 'Network error');
      mockExcel.setInitializationState(false);

      const result = await syncService.initializeSync();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
    });

    test('should handle missing dependencies', () => {
      const incompleteService = new SyncService({});

      expect(() => {
        incompleteService.storageProvider = null;
      }).not.toThrow();
    });

    test('should provide user-friendly authentication error messages', async () => {
      mockDrive.setFailureMode(true, 'browser authentication failed');
      mockExcel.setInitializationState(false);

      const result = await syncService.initializeSync();

      expect(result.message).toContain('Unable to open web browser for authentication');
    });
  });

  describe('Quick Sync Operations', () => {
    test('should perform quick sync when authenticated', async () => {
      mockDrive.setAuthenticationState(true);

      const result = await syncService.quickSync();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Quick Excel sync completed');
    });

    test('should fail quick sync when not authenticated', async () => {
      mockDrive.setAuthenticationState(false);

      const result = await syncService.quickSync();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Not authenticated');
    });

    test('should prevent concurrent quick syncs', async () => {
      mockDrive.setAuthenticationState(true);
      syncService.isSyncing = true;

      const result = await syncService.quickSync();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Sync already in progress');
    });
  });

  describe('Error Handling', () => {
    test('should handle storage provider errors gracefully', async () => {
      const brokenStorage = {
        getItem: async () => { throw new Error('Storage broken'); },
        setItem: async () => { throw new Error('Storage broken'); },
        removeItem: async () => { throw new Error('Storage broken'); }
      };

      const brokenService = new SyncService({ storageProvider: brokenStorage });

      const result = await brokenService.getLastSyncTime();
      expect(result).toBe(null);
    });

    test('should handle drive client errors gracefully', async () => {
      mockDrive.setFailureMode(true, 'Drive service unavailable');

      const result = await syncService.checkSyncStatus();

      expect(result.isAuthenticated).toBe(false);
    });

    test('should handle Excel processor errors gracefully', async () => {
      mockExcel.setFailureMode(true, 'Excel service unavailable');

      const result = await syncService.getExcelFileInfo();

      expect(result).toBe(null);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete sync flow: local → Excel → Drive', async () => {
      // Setup initial local data
      const localRecipes = [
        TestDataFactory.createRecipe('Recipe 1'),
        TestDataFactory.createRecipe('Recipe 2')
      ];
      await mockStorage.saveRecipes(localRecipes);
      await mockStorage.setLastCookedDates({ 'Recipe 1': '2024-01-01T00:00:00.000Z' });
      await mockStorage.setPinnedRecipes(['Recipe 1']);

      // Mock Drive client to be authenticated
      mockDrive.setAuthenticationState(true);

      // Mock successful download with same data as local
      const mockDownloadResult = {
        success: true,
        filePath: '/mock/downloads/test.xlsx'
      };

      // Mock the download method to return success
      mockDrive.download = jest.fn().mockResolvedValue(mockDownloadResult);

      // Mock Excel processor to return the same data as local storage
      mockExcel.importFromExcel = jest.fn().mockResolvedValue({
        success: true,
        recipes: localRecipes,
        lastCookedDates: { 'Recipe 1': '2024-01-01T00:00:00.000Z' },
        pinnedRecipes: ['Recipe 1']
      });

      // Mock no conflicts
      mockExcel.setConflicts([]);

      // Perform sync
      const result = await syncService.performExcelSync();

      expect(result.success).toBe(true);
      expect(result.data.recipes).toHaveLength(2);
      expect(result.data.lastCookedDates['Recipe 1']).toBe('2024-01-01T00:00:00.000Z');
      expect(result.data.pinnedRecipes).toContain('Recipe 1');
    });

    test('should handle conflict resolution flow', async () => {
      // Setup conflicting data
      const localRecipe = TestDataFactory.createRecipe('Conflicting Recipe', {
        lastModified: '2024-01-02T00:00:00.000Z'
      });
      await mockStorage.saveRecipes([localRecipe]);

      const remoteRecipe = TestDataFactory.createRecipe('Conflicting Recipe', {
        lastModified: '2024-01-01T00:00:00.000Z'
      });

      // Mock conflicts
      mockExcel.setConflicts([
        TestDataFactory.createConflict('recipe', localRecipe, remoteRecipe, '2024-01-02T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
      ]);

      // Perform sync with conflicts
      const result = await syncService.performExcelSync();

      expect(result.success).toBe(true);
      expect(result.conflictResolved).toBe(false);
      expect(result.resolutionStrategy).toBe('file_based_merge');
    });

    test('should handle force download from drive', async () => {
      mockDrive.setAuthenticationState(true);

      // Mock successful download
      mockDrive.download = jest.fn().mockResolvedValue({
        success: true,
        filePath: '/mock/downloads/test.xlsx'
      });

      // Mock the importFromExcel method to return proper data
      mockExcel.importFromExcel = jest.fn().mockResolvedValue({
        success: true,
        recipes: [
          { name: 'Downloaded Recipe', url: 'http://example.com/downloaded', comment: 'Downloaded recipe' }
        ],
        lastCookedDates: { 'Downloaded Recipe': '2024-01-01T00:00:00.000Z' },
        pinnedRecipes: ['Downloaded Recipe']
      });

      const result = await syncService.forceDownloadFromDrive();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Downloaded and imported');
    });
  });

  describe('Legacy Method Compatibility', () => {
    test('should redirect performSync to Excel sync and handle Excel import errors gracefully', async () => {
      // Mock Drive client to be authenticated
      mockDrive.setAuthenticationState(true);

      // Mock Drive download to succeed so we get to the Excel import step
      mockDrive.download = jest.fn().mockResolvedValue({
        success: true,
        filePath: '/mock/downloads/test.xlsx'
      });

      // Mock Excel processor to throw an error during importFromExcel
      mockExcel.importFromExcel = jest.fn().mockRejectedValue(new Error('Excel operation failed'));

      const result = await syncService.performSync();

      // Corrupt remote data is reported rather than overwriting local data.
      expect(result.success).toBe(false);
      expect(result.message).toBe('Excel operation failed');
    });

    test('should redirect mergeData to Excel merge', async () => {
      const localData = { recipes: [TestDataFactory.createRecipe('Local')] };
      const remoteData = { recipes: [TestDataFactory.createRecipe('Remote')] };

      const result = await syncService.mergeData(localData, remoteData);

      expect(result.hasChanges).toBe(true);
      expect(result.mergedData.recipes).toHaveLength(2);
    });
  });
});

describe('SyncService Integration Tests', () => {
  let syncService;
  let mockStorage;
  let mockDrive;
  let mockExcel;

  beforeEach(() => {
    mockStorage = new MockStorageProvider();
    mockDrive = new MockDriveClient();
    mockExcel = new MockExcelProcessor();

    syncService = new SyncService({
      storageProvider: mockStorage,
      driveClient: mockDrive,
      excelProcessor: mockExcel
    });
  });

  describe('Real-world Sync Scenarios', () => {
    test('should handle user adding new recipe and syncing', async () => {
      // Simulate user adding a new recipe
      const newRecipe = TestDataFactory.createRecipe('New Recipe');
      await mockStorage.saveRecipes([newRecipe]);

      // Mock Drive client to be authenticated
      mockDrive.setAuthenticationState(true);

      // Simulate sync trigger
      const result = await syncService.quickSync();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Quick Excel sync completed');
    });

    test('should handle user cooking a recipe and syncing', async () => {
      // Setup existing recipe
      const recipe = TestDataFactory.createRecipe('Test Recipe');
      await mockStorage.saveRecipes([recipe]);

      // Simulate user cooking the recipe
      const cookedDate = new Date().toISOString();
      await mockStorage.setLastCookedDates({ 'Test Recipe': cookedDate });

      // Mock Drive client to be authenticated
      mockDrive.setAuthenticationState(true);

      // Simulate sync
      const result = await syncService.quickSync();

      expect(result.success).toBe(true);
    });

    test('should handle user pinning/unpinning recipes and syncing', async () => {
      // Setup recipes
      const recipes = [
        TestDataFactory.createRecipe('Recipe 1'),
        TestDataFactory.createRecipe('Recipe 2')
      ];
      await mockStorage.saveRecipes(recipes);

      // Simulate user pinning recipes
      await mockStorage.setPinnedRecipes(['Recipe 1']);

      // Mock Drive client to be authenticated
      mockDrive.setAuthenticationState(true);

      // Simulate sync
      const result = await syncService.quickSync();

      expect(result.success).toBe(true);
    });
  });

  describe('Conflict Resolution Scenarios', () => {
    test('should resolve recipe name conflicts', async () => {
      const localRecipe = TestDataFactory.createRecipe('Same Name', {
        lastModified: '2024-01-02T00:00:00.000Z',
        comment: 'Local comment'
      });

      const remoteRecipe = TestDataFactory.createRecipe('Same Name', {
        lastModified: '2024-01-01T00:00:00.000Z',
        comment: 'Remote comment'
      });

      await mockStorage.saveRecipes([localRecipe]);

      mockExcel.setConflicts([
        TestDataFactory.createConflict('recipe', localRecipe, remoteRecipe, '2024-01-02T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
      ]);

      const result = await syncService.performExcelSync();

      expect(result.success).toBe(true);
      expect(result.conflictResolved).toBe(false);
      expect(result.resolutionStrategy).toBe('file_based_merge');
    });

    test('should resolve cooked date conflicts', async () => {
      await mockStorage.setLastCookedDates({ 'Recipe 1': '2024-01-02T00:00:00.000Z' });

      const localDates = { 'Recipe 1': '2024-01-02T00:00:00.000Z' };
      const remoteDates = { 'Recipe 1': '2024-01-01T00:00:00.000Z' };

      const result = await syncService.mergeExcelData(
        [], localDates, [],
        [], remoteDates, []
      );

      expect(result.hasChanges).toBe(true);
      expect(result.mergedLastCookedDates['Recipe 1']).toBe('2024-01-02T00:00:00.000Z');
    });
  });

  describe('Error Recovery Scenarios', () => {
    test('should recover from temporary network failures', async () => {
      // First attempt fails
      mockDrive.setFailureMode(true, 'Network error');

      let result = await syncService.quickSync();
      expect(result.success).toBe(false);

      // Second attempt succeeds
      mockDrive.setFailureMode(false);
      mockDrive.setAuthenticationState(true);

      result = await syncService.quickSync();
      expect(result.success).toBe(true);
    });

    test('should handle Excel file corruption gracefully', async () => {
      // Mock Excel processor to fail during import
      mockExcel.importFromExcel = jest.fn().mockResolvedValue({
        success: false,
        message: 'Excel file corrupted'
      });

      const result = await syncService.importFromExcel();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Excel file corrupted');
    });

    test('should handle storage quota exceeded', async () => {
      const brokenStorage = {
        getItem: async () => 'data',
        setItem: async () => { throw new Error('Quota exceeded'); },
        removeItem: async () => true,
        loadRecipes: async () => [],
        saveRecipes: async () => { throw new Error('Quota exceeded'); },
        getLastCookedDates: async () => ({}),
        setLastCookedDates: async () => { throw new Error('Quota exceeded'); },
        getPinnedRecipes: async () => [],
        setPinnedRecipes: async () => { throw new Error('Quota exceeded'); }
      };

      const brokenService = new SyncService({ storageProvider: brokenStorage });

      const result = await brokenService.setLastSyncTime();
      expect(result).toBeUndefined(); // Should handle error gracefully
    });
  });
});

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
      // The flag is now self-expiring (stored with a timestamp) rather than a bare
      // 'true' string - go through setSyncInProgress so the stored value is fresh.
      await syncService.setSyncInProgress(true);

      const result = await syncService.isSyncInProgress();
      expect(result).toBe(true);
    });

    test('should set sync progress state', async () => {
      await syncService.setSyncInProgress(true);

      // Fix 4: the flag carries a timestamp instead of a bare 'true' string, so a
      // mid-sync app kill can't wedge future syncs forever.
      const stored = await mockStorage.getItem('@cookit_sync_in_progress');
      expect(stored).not.toBe('true');
      expect(JSON.parse(stored)).toHaveProperty('timestamp');

      const result = await syncService.isSyncInProgress();
      expect(result).toBe(true);
    });

    test('should treat a legacy or stale sync-in-progress flag as not in progress', async () => {
      // Updated: previously a literal 'true' string (written by the old
      // setSyncInProgress, or surviving from before this fix) was treated as
      // permanently in-progress, which could wedge sync forever if the app was
      // killed mid-sync. It must now resolve as stale/not-in-progress.
      await mockStorage.setItem('@cookit_sync_in_progress', 'true');
      expect(await syncService.isSyncInProgress()).toBe(false);

      // A flag with a timestamp older than the stale window must also be ignored.
      await mockStorage.setItem(
        '@cookit_sync_in_progress',
        JSON.stringify({ timestamp: Date.now() - 10 * 60 * 1000 })
      );
      expect(await syncService.isSyncInProgress()).toBe(false);
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

  describe('mergeExcelDataByFile (Fix 2: both-changed per-recipe merge)', () => {
    test('both changed: local has recipe B, drive has recipe A - both survive', async () => {
      const recipeA = TestDataFactory.createRecipe('Recipe A', {
        createdAt: '2024-01-01T00:00:00.000Z',
        lastModified: '2024-01-01T00:00:00.000Z'
      });
      const recipeB = TestDataFactory.createRecipe('Recipe B', {
        createdAt: '2024-01-02T00:00:00.000Z',
        lastModified: '2024-01-02T00:00:00.000Z'
      });

      const result = await syncService.mergeExcelDataByFile(
        [recipeB], {}, [], // local
        [recipeA], {}, [], // drive
        true, true, // both changed
        new Date('2024-01-05T00:00:00.000Z'), // localModified
        new Date('2024-01-06T00:00:00.000Z')  // remoteModified
      );

      const names = result.recipes.map(r => r.name);
      expect(result.recipes).toHaveLength(2);
      expect(names).toContain('Recipe A');
      expect(names).toContain('Recipe B');
    });

    test('single-source branches still take that source wholesale (deletion propagation)', async () => {
      const driveRecipe = TestDataFactory.createRecipe('Drive Only Recipe');

      // Local deleted everything and only local changed: the (empty) local dataset is
      // authoritative, so the deletion propagates instead of the drive recipe surviving.
      const localOnlyChanged = await syncService.mergeExcelDataByFile(
        [], {}, [],
        [driveRecipe], {}, [],
        true, false,
        new Date(), new Date(0)
      );
      expect(localOnlyChanged.recipes).toHaveLength(0);

      const localRecipe = TestDataFactory.createRecipe('Local Only Recipe');

      // Drive deleted everything and only drive changed: the (empty) drive dataset is
      // authoritative, so the deletion propagates instead of the local recipe surviving.
      const driveOnlyChanged = await syncService.mergeExcelDataByFile(
        [localRecipe], {}, [],
        [], {}, [],
        false, true,
        new Date(0), new Date()
      );
      expect(driveOnlyChanged.recipes).toHaveLength(0);
    });
  });

  describe('Recipe images merge', () => {
    test('mergeRecipeImages unions by Drive file id, preferring the copy with a local file present', () => {
      const local = [
        { id: 'a', localFile: '/local/a.jpg', driveFileId: 'drive-a' },
        { id: 'b', localFile: '/local/b.jpg', driveFileId: null } // not yet uploaded
      ];
      const drive = [
        { id: 'a-on-drive-device', localFile: null, driveFileId: 'drive-a' }, // same photo, no local copy on this side
        { id: 'c', localFile: null, driveFileId: 'drive-c' } // photo only known from Drive
      ];

      const merged = syncService.mergeRecipeImages(local, drive);

      // Union by Drive file id: 'drive-a' appears once, keeping the copy
      // that already has a local file (the local side's), not the drive
      // side's local-file-less duplicate.
      expect(merged.filter(img => img.driveFileId === 'drive-a')).toEqual([
        { id: 'a', localFile: '/local/a.jpg', driveFileId: 'drive-a' }
      ]);
      // 'drive-c' (only on the drive side) and 'b' (local-only, not yet
      // uploaded) both survive - dropping either would delete a photo still
      // only on one side.
      expect(merged).toContainEqual({ id: 'c', localFile: null, driveFileId: 'drive-c' });
      expect(merged).toContainEqual({ id: 'b', localFile: '/local/b.jpg', driveFileId: null });
      expect(merged).toHaveLength(3);
    });

    test('performIntelligentMerge merges images for a recipe that exists identically on both sides', () => {
      const localImages = [{ id: 'a', localFile: '/local/a.jpg', driveFileId: 'drive-a' }];
      const driveImages = [{ id: 'b', localFile: null, driveFileId: 'drive-b' }];

      const localRecipe = TestDataFactory.createRecipe('Same Recipe', {
        lastModified: '2024-01-02T00:00:00.000Z'
      });
      localRecipe.images = localImages;

      const driveRecipe = TestDataFactory.createRecipe('Same Recipe', {
        lastModified: '2024-01-01T00:00:00.000Z'
      });
      driveRecipe.images = driveImages;

      const result = syncService.performIntelligentMerge([localRecipe], [driveRecipe]);

      expect(result.recipes).toHaveLength(1);
      // Local wins on name/url/comment (newer), but images from both sides
      // survive the merge regardless of which side's other fields won.
      expect(result.recipes[0].images).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ driveFileId: 'drive-a' }),
          expect.objectContaining({ driveFileId: 'drive-b' })
        ])
      );
      expect(result.recipes[0].images).toHaveLength(2);
    });

    test('resolveRecipeConflict merges images even when only one version is kept', () => {
      const localRecipe = TestDataFactory.createRecipe('Similar Recipe', {
        comment: 'Local comment',
        lastModified: '2024-01-02T00:00:00.000Z'
      });
      localRecipe.images = [{ id: 'a', localFile: '/local/a.jpg', driveFileId: 'drive-a' }];

      const driveRecipe = TestDataFactory.createRecipe('Similar Recipe', {
        comment: 'Local comment', // same comment -> only 1 field (url) differs -> "minor change" branch
        url: 'http://example.com/different-url',
        lastModified: '2024-01-01T00:00:00.000Z'
      });
      driveRecipe.images = [{ id: 'b', localFile: null, driveFileId: 'drive-b' }];

      const resolution = syncService.resolveRecipeConflict(localRecipe, driveRecipe);

      expect(resolution.recipes).toHaveLength(1);
      expect(resolution.recipes[0].name).toBe('Similar Recipe'); // kept the newer (local) version
      expect(resolution.recipes[0].images).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ driveFileId: 'drive-a' }),
          expect.objectContaining({ driveFileId: 'drive-b' })
        ])
      );
    });

    test('computeSyncFlags ignores local-only file paths but reacts to a genuine Drive image difference', () => {
      const recipe = TestDataFactory.createRecipe('Photo Recipe');

      const withLocalPath = { ...recipe, images: [{ id: 'a', localFile: '/device/a.jpg', driveFileId: 'drive-a' }] };
      const sameImageDifferentLocalPath = { ...recipe, images: [{ id: 'a2', localFile: null, driveFileId: 'drive-a' }] };
      const differentImage = { ...recipe, images: [{ id: 'b', localFile: null, driveFileId: 'drive-b' }] };

      const local = { recipes: [withLocalPath], lastCookedDates: {}, pinnedRecipes: [] };
      const merged = { recipes: [sameImageDifferentLocalPath], lastCookedDates: {}, pinnedRecipes: [] };
      const drive = { recipes: [differentImage], lastCookedDates: {}, pinnedRecipes: [] };

      // Same Drive file id as local, just a different (device-specific) local
      // path/id - must NOT register as a change.
      expect(syncService.computeSyncFlags(merged, local, drive).hasChanges).toBe(false);

      // A genuinely different Drive file id must register as needing upload.
      const mergedWithNewImage = { recipes: [differentImage], lastCookedDates: {}, pinnedRecipes: [] };
      expect(syncService.computeSyncFlags(mergedWithNewImage, local, drive).needsUpload).toBe(false);
      expect(syncService.computeSyncFlags(mergedWithNewImage, local, drive).hasChanges).toBe(true);
    });
  });

  describe('computeSyncFlags (Fix 3: hasChanges reflects actual data difference)', () => {
    test('hasChanges is false when merged data equals local data', () => {
      const recipe = TestDataFactory.createRecipe('Same Recipe');
      const local = {
        recipes: [recipe],
        lastCookedDates: { 'Same Recipe': '2024-01-01T00:00:00.000Z' },
        pinnedRecipes: ['Same Recipe']
      };
      // Same content as local, but a different object reference - the comparison must
      // be by value, not identity.
      const merged = {
        recipes: [{ ...recipe }],
        lastCookedDates: { 'Same Recipe': '2024-01-01T00:00:00.000Z' },
        pinnedRecipes: ['Same Recipe']
      };
      // Deliberately different from merged/local, so needsUpload can be asserted true
      // in the same test to prove hasChanges and needsUpload are independent.
      const drive = { recipes: [], lastCookedDates: {}, pinnedRecipes: [] };

      const { hasChanges, needsUpload } = syncService.computeSyncFlags(merged, local, drive);

      expect(hasChanges).toBe(false);
      expect(needsUpload).toBe(true);
    });

    // Local state stores last-cooked values as full ISO strings, while values parsed
    // back out of the workbook are epoch ms derived from a date-only column. Comparing
    // them raw made every entry look different forever, keeping needsUpload
    // permanently true and re-uploading to Drive on every sync.
    test('last-cooked values compare at calendar-date granularity across representations', () => {
      const recipe = TestDataFactory.createRecipe('Cooked Recipe');
      // 14:30 local time on 2024-03-05, however this machine is configured.
      const localTimestamp = new Date(2024, 2, 5, 14, 30, 0);
      // What the same day looks like after an Excel round trip: date-only, reparsed
      // as local midnight.
      const driveTimestamp = new Date(2024, 2, 5).getTime();

      const merged = {
        recipes: [recipe],
        lastCookedDates: { 'Cooked Recipe': localTimestamp.toISOString() },
        pinnedRecipes: []
      };
      const drive = {
        recipes: [{ ...recipe }],
        lastCookedDates: { 'Cooked Recipe': driveTimestamp },
        pinnedRecipes: []
      };

      const { needsUpload } = syncService.computeSyncFlags(merged, merged, drive);

      expect(needsUpload).toBe(false);
    });

    test('a genuinely different cooked day still registers as needing upload', () => {
      const recipe = TestDataFactory.createRecipe('Cooked Recipe');
      const merged = {
        recipes: [recipe],
        lastCookedDates: { 'Cooked Recipe': new Date(2024, 2, 6, 14, 30, 0).toISOString() },
        pinnedRecipes: []
      };
      const drive = {
        recipes: [{ ...recipe }],
        lastCookedDates: { 'Cooked Recipe': new Date(2024, 2, 5).getTime() },
        pinnedRecipes: []
      };

      expect(syncService.computeSyncFlags(merged, merged, drive).needsUpload).toBe(true);
    });
  });

  describe('Change Detection (Fix 1: no tolerance window on the "changed" test)', () => {
    test('data modified before lastSync reads as unchanged no matter how far in the past', async () => {
      const lastSyncTime = new Date('2024-06-01T00:00:00.000Z');
      // Years before lastSync - far outside any plausible tolerance window. Under the
      // old inverted logic this was incorrectly flagged as "changed" once the gap
      // exceeded the tolerance, which is exactly the bug being fixed.
      const longAgo = new Date('2020-01-01T00:00:00.000Z');

      await mockStorage.setItem('@cookit_last_sync', lastSyncTime.toISOString());
      await mockStorage.setItem('@cookit_last_data_modification', longAgo.toISOString());

      const sharedRecipes = [TestDataFactory.createRecipe('Stable Recipe')];
      // skipModificationTimeUpdate = true so the modification time set above is preserved.
      await mockStorage.saveRecipes(sharedRecipes, true);

      mockDrive.setAuthenticationState(true);
      mockDrive.getFileInfo = jest.fn().mockResolvedValue({
        id: 'mock_drive_file',
        name: 'CookIT_Recipes.xlsx',
        modifiedTime: longAgo.toISOString()
      });

      mockExcel.importFromExcel = jest.fn().mockResolvedValue({
        success: true,
        recipes: sharedRecipes,
        lastCookedDates: {},
        pinnedRecipes: []
      });

      const result = await syncService.performExcelSync();

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.message).toBe('No changes detected.');
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
      // Updated for Fix 3: local and "drive" data are identical here (the mock
      // returns the exact same recipes back), so the merge result matches local
      // data exactly and hasChanges must correctly be false. The old expectation of
      // `true` encoded the bug being fixed - hasChanges used to just record which
      // merge branch fired, so it was true on every sync even when nothing changed.
      expect(result.hasChanges).toBe(false);
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

  describe('Sign Out', () => {
    test('should disconnect Drive and clear the sync bookkeeping', async () => {
      mockDrive.setAuthenticationState(true);
      await mockStorage.setItem('@cookit_last_sync', new Date().toISOString());
      await mockStorage.setItem('@cookit_last_excel_sync', new Date().toISOString());
      await syncService.setSyncInProgress(true);

      const result = await syncService.signOut();

      expect(result.success).toBe(true);
      expect(mockDrive.isAuthenticated()).toBe(false);
      // A "last synced" time with no account behind it would be misleading, and a
      // leftover in-progress flag would block the next connect attempt.
      expect(await syncService.getLastSyncTime()).toBeNull();
      expect(await syncService.isSyncInProgress()).toBe(false);
    });

    test('should keep the session when the Drive client reports a failure', async () => {
      mockDrive.setAuthenticationState(true);
      const lastSync = new Date().toISOString();
      await mockStorage.setItem('@cookit_last_sync', lastSync);
      mockDrive.setFailureMode(true, 'Sign out failed');

      const result = await syncService.signOut();

      expect(result.success).toBe(false);
      // Nothing was disconnected, so the sync history must survive intact.
      expect(await mockStorage.getItem('@cookit_last_sync')).toBe(lastSync);
    });

    test('should report a missing Drive client instead of throwing', async () => {
      const serviceWithoutDrive = new SyncService({ storageProvider: mockStorage });

      const result = await serviceWithoutDrive.signOut();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Drive client not initialized');
    });
  });

  describe('Quick Sync Operations', () => {
    test('should perform quick sync when authenticated', async () => {
      mockDrive.setAuthenticationState(true);

      const result = await syncService.quickSync();

      // Updated for Fix 6: quickSync now delegates to safeBackgroundSync ->
      // performExcelSync, which downloads and merges before ever uploading, so the
      // message reflects the merge outcome rather than the old unconditional
      // "Quick Excel sync completed" blind-push message.
      expect(result.success).toBe(true);
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

      // Updated for Fix 6: quickSync -> safeBackgroundSync -> performExcelSync, so
      // the message now reflects the merge outcome, not a fixed blind-push string.
      expect(result.success).toBe(true);
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

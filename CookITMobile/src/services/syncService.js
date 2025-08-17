import googleDriveService from './googleDriveService';
import excelService from './excelService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRecipes, saveRecipes, getPinnedRecipes } from '../utils/storage';
import { getLastCookedDates, setLastCookedDates } from '../utils/storage';

const LAST_SYNC_KEY = '@cookit_last_sync';
const SYNC_IN_PROGRESS_KEY = '@cookit_sync_in_progress';
const EXCEL_SYNC_MODE_KEY = '@cookit_excel_sync_mode';

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.syncMode = 'excel'; // Default to Excel sync mode
  }

  async getLastSyncTime() {
    try {
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return lastSync ? new Date(lastSync) : null;
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  }

  async setLastSyncTime(time = new Date()) {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, time.toISOString());
    } catch (error) {
      console.error('Error setting last sync time:', error);
    }
  }

  async isSyncInProgress() {
    try {
      const inProgress = await AsyncStorage.getItem(SYNC_IN_PROGRESS_KEY);
      return inProgress === 'true';
    } catch (error) {
      console.error('Error checking sync progress:', error);
      return false;
    }
  }

  async setSyncInProgress(inProgress) {
    try {
      if (inProgress) {
        await AsyncStorage.setItem(SYNC_IN_PROGRESS_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(SYNC_IN_PROGRESS_KEY);
      }
    } catch (error) {
      console.error('Error setting sync progress:', error);
    }
  }

  async getSyncMode() {
    try {
      const mode = await AsyncStorage.getItem(EXCEL_SYNC_MODE_KEY);
      return mode || 'excel';
    } catch (error) {
      console.error('Error getting sync mode:', error);
      return 'excel';
    }
  }

  async setSyncMode(mode) {
    try {
      await AsyncStorage.setItem(EXCEL_SYNC_MODE_KEY, mode);
      this.syncMode = mode;
    } catch (error) {
      console.error('Error setting sync mode:', error);
    }
  }

  async initializeSync() {
    try {
      console.log('Initializing Google Drive sync with Excel...');

      // Check if already syncing
      if (await this.isSyncInProgress()) {
        console.log('Sync already in progress, skipping...');
        return { success: false, message: 'Sync already in progress' };
      }

      // Initialize Excel service (which also initializes Google Drive service)
      const excelInitialized = await excelService.initialize();
      if (!excelInitialized) {
        console.log('Excel service initialization failed');
        return { success: false, message: 'Excel service initialization failed' };
      }

      // Check if Google Drive is authenticated
      if (!googleDriveService.isAuthenticated()) {
        console.log('Google Drive not authenticated, attempting authentication...');


        try {
          const authenticated = await googleDriveService.authenticate();
          if (!authenticated) {
            return { success: false, message: 'Authentication failed - please try again' };
          }
        } catch (authError) {
          console.error('Google Drive authentication error:', authError);

          // Provide user-friendly error messages
          let userMessage = 'Failed to connect to Google Drive. ';

          if (authError.message?.includes('browser')) {
            userMessage += 'Unable to open web browser for authentication. This may happen in certain environments. Please try again later.';
          } else if (authError.message?.includes('network')) {
            userMessage += 'Network error. Please check your internet connection and try again.';
          } else if (authError.message?.includes('OAuth configuration')) {
            userMessage += 'Configuration error. Please contact support.';
          } else {
            userMessage += authError.message || 'Please try again.';
          }

          return { success: false, message: userMessage };
        }
      }

      // Perform Excel-based sync
      const syncResult = await this.performExcelSync();
      return syncResult;

    } catch (error) {
      console.error('Error initializing sync:', error);
      return { success: false, message: error.message };
    }
  }

  async performExcelSync(forcePush = false) {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return { success: false, message: 'Sync already in progress' };
    }

    this.isSyncing = true;
    await this.setSyncInProgress(true);

    try {
      console.log('Starting Excel-based sync process...');

      // Load local data
      const localRecipes = await loadRecipes();
      const localLastCookedDates = await getLastCookedDates();
      const localPinnedRecipes = await getPinnedRecipes();

      console.log(`Found ${localRecipes.length} local recipes`);

      // Check for conflicts
      const conflictCheck = await excelService.checkConflicts();

      if (conflictCheck.hasConflicts) {
        console.log('Excel conflicts detected, resolving...');
        return await this.handleExcelConflicts(conflictCheck, forcePush);
      }

      // No conflicts, proceed with normal sync
      return await this.performExcelMerge(localRecipes, localLastCookedDates, localPinnedRecipes, forcePush);

    } catch (error) {
      console.error('Excel sync error:', error);
      return { success: false, message: error.message };
    } finally {
      this.isSyncing = false;
      await this.setSyncInProgress(false);
    }
  }

  async handleExcelConflicts(conflictCheck, forcePush) {
    try {
      console.log('Handling Excel conflicts...');

      if (forcePush) {
        // Force push local data to Drive
        console.log('Force push mode: uploading local Excel to Drive');
        await excelService.updateWithLocalData();
        const uploadResult = await excelService.uploadToDrive();

        if (uploadResult.success) {
          await this.setLastSyncTime();
          return {
            success: true,
            hasChanges: true,
            message: 'Force push completed successfully',
            conflictResolved: true
          };
        } else {
          throw new Error('Force push failed');
        }
      }

      // Get conflict resolution options for user decision
      const resolutionOptions = excelService.getConflictResolutionOptions();

      // For now, we'll use merge resolution as default
      // In a real app, this would be presented to the user for choice
      console.log('Auto-resolving conflicts using merge strategy...');

      const resolutionResult = await excelService.resolveConflict('merge');

      if (resolutionResult.success) {
        await this.setLastSyncTime();
        return {
          success: true,
          hasChanges: true,
          message: 'Conflicts resolved successfully using merge strategy',
          conflictResolved: true,
          resolutionStrategy: 'merge'
        };
      } else {
        throw new Error('Conflict resolution failed');
      }

    } catch (error) {
      console.error('Error handling Excel conflicts:', error);
      return { success: false, message: error.message };
    }
  }

  async performExcelMerge(localRecipes, localLastCookedDates, localPinnedRecipes, forcePush) {
    try {
      console.log('Performing Excel merge...');

      if (forcePush) {
        // Force push: update local Excel and upload to Drive
        console.log('Force push mode: updating local Excel and uploading to Drive');
        await excelService.createLocalExcelFile();
        const uploadResult = await excelService.uploadToDrive();

        if (uploadResult.success) {
          await this.setLastSyncTime();
          return {
            success: true,
            hasChanges: true,
            message: 'Force push completed successfully',
            data: {
              recipes: localRecipes,
              lastCookedDates: localLastCookedDates,
              pinnedRecipes: localPinnedRecipes
            }
          };
        } else {
          throw new Error('Force push upload failed');
        }
      }

      // Normal sync: download from Drive, merge, and upload back
      let driveData = null;

      try {
        // Try to download Excel from Drive
        console.log('Downloading Excel from Google Drive...');
        const downloadResult = await excelService.downloadFromDrive();

        if (downloadResult.success) {
          // Import the downloaded Excel data
          const importResult = await excelService.importFromExcel();

          if (importResult.success) {
            driveData = {
              recipes: importResult.recipes,
              lastCookedDates: importResult.lastCookedDates,
              pinnedRecipes: importResult.pinnedRecipes
            };
            console.log(`Downloaded ${driveData.recipes.length} recipes from Drive Excel`);
          }
        }
      } catch (error) {
        console.log('No Drive Excel file found or error downloading, will create new one');
        driveData = {
          recipes: [],
          lastCookedDates: {},
          pinnedRecipes: []
        };
      }

      // Perform merge logic
      const mergeResult = await this.mergeExcelData(
        localRecipes,
        localLastCookedDates,
        localPinnedRecipes,
        driveData.recipes,
        driveData.lastCookedDates,
        driveData.pinnedRecipes
      );

      if (mergeResult.hasChanges) {
        console.log('Changes detected, updating Excel and syncing...');

        // Save merged data locally
        await saveRecipes(mergeResult.mergedRecipes);

        // Update last cooked dates
        await setLastCookedDates(mergeResult.mergedLastCookedDates);

        // Update pinned recipes
        await AsyncStorage.setItem('@cookit_pinned_recipes', JSON.stringify(mergeResult.mergedPinnedRecipes));

        // Update local Excel file with current data
        await excelService.createLocalExcelFile();

        // Upload updated Excel to Drive
        const uploadResult = await excelService.uploadToDrive();

        if (!uploadResult.success) {
          throw new Error('Failed to upload merged Excel to Drive');
        }

        console.log('Excel sync completed successfully with changes');
      } else {
        console.log('No changes detected in Excel sync');
      }

      await this.setLastSyncTime();

      return {
        success: true,
        hasChanges: mergeResult.hasChanges,
        message: mergeResult.hasChanges ? 'Excel sync completed with changes' : 'No changes to sync',
        data: {
          recipes: mergeResult.mergedRecipes,
          lastCookedDates: mergeResult.mergedLastCookedDates,
          pinnedRecipes: mergeResult.mergedPinnedRecipes
        }
      };

    } catch (error) {
      console.error('Excel merge error:', error);
      return { success: false, message: error.message };
    }
  }

  async mergeExcelData(localRecipes, localLastCookedDates, localPinnedRecipes,
                       driveRecipes, driveLastCookedDates, drivePinnedRecipes) {
    console.log('Merging Excel data...');

    // Initialize with drive data
    const mergedRecipes = [...(driveRecipes || [])];
    const mergedLastCookedDates = { ...(driveLastCookedDates || {}) };
    const mergedPinnedRecipes = [...(drivePinnedRecipes || [])];

    let hasChanges = false;

    // Create maps for efficient lookup
    const driveRecipeMap = new Map();
    (driveRecipes || []).forEach(recipe => {
      const key = this.getRecipeKey(recipe);
      driveRecipeMap.set(key, recipe);
    });

    const localRecipeMap = new Map();
    (localRecipes || []).forEach(recipe => {
      const key = this.getRecipeKey(recipe);
      localRecipeMap.set(key, recipe);
    });

    // Process local recipes
    for (const localRecipe of localRecipes || []) {
      const key = this.getRecipeKey(localRecipe);
      const driveRecipe = driveRecipeMap.get(key);

      if (!driveRecipe) {
        // New local recipe - add to merged
        mergedRecipes.push(localRecipe);
        hasChanges = true;
        console.log(`Added new local recipe: ${localRecipe.name}`);
      } else {
        // Recipe exists in both - check for updates
        const localModified = new Date(localRecipe.createdAt || localRecipe.lastModified || 0);
        const driveModified = new Date(driveRecipe.createdAt || driveRecipe.lastModified || 0);

        if (localModified > driveModified) {
          // Local is newer - update in merged
          const index = mergedRecipes.findIndex(r => this.getRecipeKey(r) === key);
          if (index >= 0) {
            mergedRecipes[index] = localRecipe;
            hasChanges = true;
            console.log(`Updated recipe from local: ${localRecipe.name}`);
          }
        }
      }
    }

    // Merge last cooked dates (keep the most recent date)
    for (const [recipeName, dateIso] of Object.entries(localLastCookedDates || {})) {
      const driveIso = mergedLastCookedDates[recipeName];
      if (!driveIso) {
        mergedLastCookedDates[recipeName] = dateIso;
        hasChanges = true;
      } else if (new Date(dateIso) > new Date(driveIso)) {
        mergedLastCookedDates[recipeName] = dateIso;
        hasChanges = true;
      }
    }

    // Merge pinned recipes
    const drivePinnedSet = new Set(drivePinnedRecipes || []);
    const localPinnedSet = new Set(localPinnedRecipes || []);
    const mergedPinnedSet = new Set([...drivePinnedSet, ...localPinnedSet]);

    // Check if pinned recipes changed
    if (mergedPinnedSet.size !== drivePinnedSet.size ||
        ![...mergedPinnedSet].every(recipe => drivePinnedSet.has(recipe))) {
      mergedPinnedRecipes.splice(0, mergedPinnedRecipes.length, ...mergedPinnedSet);
      hasChanges = true;
    }

    return {
      hasChanges,
      mergedRecipes,
      mergedLastCookedDates,
      mergedPinnedRecipes
    };
  }

  async performSync(forcePush = false) {
    // Legacy method - now redirects to Excel sync
    console.log('Legacy performSync called, redirecting to Excel sync...');
    return await this.performExcelSync(forcePush);
  }

  async mergeData(localData, remoteData, forcePush = false) {
    // Legacy method - now redirects to Excel merge
    console.log('Legacy mergeData called, redirecting to Excel merge...');

    const localRecipes = localData.recipes || [];
    const localLastCookedDates = localData.lastCookedDates || {};
    const localPinnedRecipes = localData.pinnedRecipes || [];

    const remoteRecipes = remoteData.recipes || [];
    const remoteLastCookedDates = remoteData.lastCookedDates || {};
    const remotePinnedRecipes = remoteData.pinnedRecipes || [];

    const mergeResult = await this.mergeExcelData(
      localRecipes, localLastCookedDates, localPinnedRecipes,
      remoteRecipes, remoteLastCookedDates, remotePinnedRecipes
    );

    return {
      hasChanges: mergeResult.hasChanges,
      mergedData: {
        recipes: mergeResult.mergedRecipes,
        lastCookedDates: mergeResult.mergedLastCookedDates,
        pinnedRecipes: mergeResult.mergedPinnedRecipes,
        lastModified: new Date().toISOString()
      }
    };
  }

  getRecipeKey(recipe) {
    // Create a unique key based on name, url, and comment
    // Similar to the desktop app's composite key approach
    return `${recipe.name || ''}|${recipe.url || ''}|${recipe.comment || ''}`;
  }

  async quickSync() {
    try {
      if (!googleDriveService.isAuthenticated()) {
        return { success: false, message: 'Not authenticated' };
      }

      // Check if already syncing to prevent multiple simultaneous syncs
      if (this.isSyncing) {
        return { success: false, message: 'Sync already in progress' };
      }

      // Set syncing flag to prevent concurrent syncs
      this.isSyncing = true;

      // Update local Excel and upload to Drive
      await excelService.createLocalExcelFile();
      const uploadResult = await excelService.uploadToDrive();

      if (uploadResult.success) {
        await this.setLastSyncTime();
        return { success: true, message: 'Quick Excel sync completed' };
      } else {
        throw new Error('Quick sync upload failed');
      }
    } catch (error) {
      console.error('Quick Excel sync error:', error);
      return { success: false, message: error.message };
    } finally {
      // Always reset syncing flag
      this.isSyncing = false;
    }
  }

  async forceDownloadFromDrive() {
    try {
      console.log('Force downloading Excel from Google Drive...');

      if (!googleDriveService.isAuthenticated()) {
        throw new Error('Not authenticated');
      }

      // Download Excel from Drive
      const downloadResult = await excelService.downloadFromDrive();

      if (downloadResult.success) {
        // Import the downloaded Excel data
        const importResult = await excelService.importFromExcel();

        if (importResult.success) {
          await this.setLastSyncTime();

          return {
            success: true,
            message: `Downloaded and imported ${importResult.recipes.length} recipes from Drive Excel`,
            data: {
              recipes: importResult.recipes,
              lastCookedDates: importResult.lastCookedDates,
              pinnedRecipes: importResult.pinnedRecipes
            }
          };
        } else {
          throw new Error('Failed to import downloaded Excel data');
        }
      } else {
        throw new Error('Failed to download Excel from Drive');
      }
    } catch (error) {
      console.error('Force download Excel error:', error);
      return { success: false, message: error.message };
    }
  }

  async exportToExcel() {
    try {
      console.log('Exporting local data to Excel...');

      const result = await excelService.createLocalExcelFile();

      if (result) {
        return {
          success: true,
          message: 'Data exported to Excel successfully',
          fileInfo: await excelService.getLocalFileInfo()
        };
      } else {
        throw new Error('Failed to create Excel file');
      }
    } catch (error) {
      console.error('Export to Excel error:', error);
      return { success: false, message: error.message };
    }
  }

  async importFromExcel() {
    try {
      console.log('Importing data from Excel...');

      const result = await excelService.importFromExcel();

      if (result) {
        return {
          success: true,
          message: `Imported ${result.recipes.length} recipes from Excel`,
          data: result
        };
      } else {
        throw new Error('Failed to import Excel data');
      }
    } catch (error) {
      console.error('Import from Excel error:', error);
      return { success: false, message: error.message };
    }
  }

  async checkSyncStatus() {
    try {
      const isAuthenticated = googleDriveService.isAuthenticated();
      const lastSync = await this.getLastSyncTime();
      const inProgress = await this.isSyncInProgress();
      const syncMode = await this.getSyncMode();

      return {
        isAuthenticated,
        lastSync,
        inProgress,
        syncMode
      };
    } catch (error) {
      console.error('Error checking sync status:', error);
      return {
        isAuthenticated: false,
        lastSync: null,
        inProgress: false,
        syncMode: 'excel'
      };
    }
  }

  async getExcelFileInfo() {
    try {
      return await excelService.getLocalFileInfo();
    } catch (error) {
      console.error('Error getting Excel file info:', error);
      return null;
    }
  }

  async checkForConflicts() {
    try {
      if (!googleDriveService.isAuthenticated()) {
        return { hasConflicts: false, message: 'Not authenticated with Google Drive' };
      }

      return await excelService.checkConflicts();
    } catch (error) {
      console.error('Error checking for conflicts:', error);
      return { hasConflicts: false, message: error.message };
    }
  }

  async resolveExcelConflict(resolution) {
    try {
      const result = await excelService.resolveConflict(resolution);

      if (result) {
        await this.setLastSyncTime();
      }

      return { success: true, message: 'Conflict resolved successfully' };
    } catch (error) {
      console.error('Error resolving Excel conflict:', error);
      return { success: false, message: error.message };
    }
  }
}

export default new SyncService();
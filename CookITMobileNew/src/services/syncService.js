import googleDriveService from './googleDriveService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRecipes, saveRecipes, getCookedRecipes, getPinnedRecipes } from '../utils/storage';

const LAST_SYNC_KEY = '@cookit_last_sync';
const SYNC_IN_PROGRESS_KEY = '@cookit_sync_in_progress';

class SyncService {
  constructor() {
    this.isSyncing = false;
  }

  // Removed setPromptAsync; native sign-in does not require plumbing from React component

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

  async initializeSync() {
    try {
      console.log('Initializing Google Drive sync...');

      // Check if already syncing
      if (await this.isSyncInProgress()) {
        console.log('Sync already in progress, skipping...');
        return { success: false, message: 'Sync already in progress' };
      }

      // Initialize Google Drive service
      const initialized = await googleDriveService.initialize();

      if (!initialized) {
        console.log('Google Drive not authenticated, attempting authentication...');

        const authenticated = await googleDriveService.authenticate();

        if (!authenticated) {
          return { success: false, message: 'Authentication failed' };
        }
      }

      // Perform sync
      const syncResult = await this.performSync();
      return syncResult;

    } catch (error) {
      console.error('Error initializing sync:', error);
      return { success: false, message: error.message };
    }
  }

  async performSync(forcePush = false) {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return { success: false, message: 'Sync already in progress' };
    }

    this.isSyncing = true;
    await this.setSyncInProgress(true);

    try {
      console.log('Starting sync process...');

      // Load local data
      const localRecipes = await loadRecipes();
      const localCookedRecipes = await getCookedRecipes();
      const localPinnedRecipes = await getPinnedRecipes();

      console.log(`Found ${localRecipes.length} local recipes`);

      // Combine local data into sync format
      const localData = {
        recipes: localRecipes,
        cookedRecipes: localCookedRecipes,
        pinnedRecipes: localPinnedRecipes,
        lastModified: new Date().toISOString(),
      };

      // Download remote data
      let remoteData;
      try {
        remoteData = await googleDriveService.downloadRecipes();
        console.log(`Downloaded ${remoteData.recipes?.length || 0} remote recipes`);
      } catch (error) {
        console.log('No remote data found or error downloading, creating new file');
        remoteData = {
          recipes: [],
          cookedRecipes: {},
          pinnedRecipes: [],
          lastModified: new Date().toISOString(),
        };
      }

      // Perform merge logic
      const mergeResult = await this.mergeData(localData, remoteData, forcePush);

      if (mergeResult.hasChanges) {
        console.log('Changes detected, updating data...');

        // Save merged data locally
        await saveRecipes(mergeResult.mergedData.recipes);

        // Update cooked recipes
        await AsyncStorage.setItem('@cookit_cooked_recipes', JSON.stringify(mergeResult.mergedData.cookedRecipes));

        // Update pinned recipes
        await AsyncStorage.setItem('@cookit_pinned_recipes', JSON.stringify(mergeResult.mergedData.pinnedRecipes));

        // Upload to Google Drive
        await googleDriveService.uploadRecipes(mergeResult.mergedData);

        console.log('Sync completed successfully with changes');
      } else {
        console.log('No changes detected');
      }

      await this.setLastSyncTime();

      return {
        success: true,
        hasChanges: mergeResult.hasChanges,
        message: mergeResult.hasChanges ? 'Sync completed with changes' : 'No changes to sync',
        data: mergeResult.mergedData,
      };

    } catch (error) {
      console.error('Sync error:', error);
      return { success: false, message: error.message };
    } finally {
      this.isSyncing = false;
      await this.setSyncInProgress(false);
    }
  }

  async mergeData(localData, remoteData, forcePush = false) {
    console.log('Merging local and remote data...');

    // If force push, just use local data
    if (forcePush) {
      return {
        hasChanges: true,
        mergedData: localData,
      };
    }

    // Initialize with remote data structure
    const merged = {
      recipes: [...(remoteData.recipes || [])],
      cookedRecipes: { ...(remoteData.cookedRecipes || {}) },
      pinnedRecipes: [...(remoteData.pinnedRecipes || [])],
      lastModified: new Date().toISOString(),
    };

    let hasChanges = false;

    // Create maps for efficient lookup
    const remoteRecipeMap = new Map();
    (remoteData.recipes || []).forEach(recipe => {
      const key = this.getRecipeKey(recipe);
      remoteRecipeMap.set(key, recipe);
    });

    const localRecipeMap = new Map();
    (localData.recipes || []).forEach(recipe => {
      const key = this.getRecipeKey(recipe);
      localRecipeMap.set(key, recipe);
    });

    // Process local recipes
    for (const localRecipe of localData.recipes || []) {
      const key = this.getRecipeKey(localRecipe);
      const remoteRecipe = remoteRecipeMap.get(key);

      if (!remoteRecipe) {
        // New local recipe - add to merged
        merged.recipes.push(localRecipe);
        hasChanges = true;
        console.log(`Added new local recipe: ${localRecipe.name}`);
      } else {
        // Recipe exists in both - check for updates
        const localModified = new Date(localRecipe.createdAt || localRecipe.lastModified || 0);
        const remoteModified = new Date(remoteRecipe.createdAt || remoteRecipe.lastModified || 0);

        if (localModified > remoteModified) {
          // Local is newer - update in merged
          const index = merged.recipes.findIndex(r => this.getRecipeKey(r) === key);
          if (index >= 0) {
            merged.recipes[index] = localRecipe;
            hasChanges = true;
            console.log(`Updated recipe from local: ${localRecipe.name}`);
          }
        }
      }
    }

    // Check for recipes that exist remotely but not locally (removed locally)
    for (const remoteRecipe of remoteData.recipes || []) {
      const key = this.getRecipeKey(remoteRecipe);
      if (!localRecipeMap.has(key)) {
        console.log(`Recipe exists in remote but not local: ${remoteRecipe.name}`);
        // Keep remote recipe unless it's older than our last sync
        // This handles the case where a recipe was deleted locally
      }
    }

    // Merge cooked recipes
    const mergedCookedRecipes = { ...(remoteData.cookedRecipes || {}) };
    for (const [recipeName, isCooked] of Object.entries(localData.cookedRecipes || {})) {
      if (mergedCookedRecipes[recipeName] !== isCooked) {
        mergedCookedRecipes[recipeName] = isCooked;
        hasChanges = true;
      }
    }
    merged.cookedRecipes = mergedCookedRecipes;

    // Merge pinned recipes
    const remotePinnedSet = new Set(remoteData.pinnedRecipes || []);
    const localPinnedSet = new Set(localData.pinnedRecipes || []);
    const mergedPinnedSet = new Set([...remotePinnedSet, ...localPinnedSet]);

    // Check if pinned recipes changed
    if (mergedPinnedSet.size !== remotePinnedSet.size ||
        ![...mergedPinnedSet].every(recipe => remotePinnedSet.has(recipe))) {
      merged.pinnedRecipes = [...mergedPinnedSet];
      hasChanges = true;
    }

    return {
      hasChanges,
      mergedData: merged,
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
        console.log('Quick sync skipped: not authenticated');
        return { success: false, message: 'Not authenticated' };
      }

      // Check if already syncing to prevent multiple simultaneous syncs
      if (this.isSyncing) {
        console.log('Quick sync skipped: sync already in progress');
        return { success: false, message: 'Sync already in progress' };
      }

      // Set syncing flag to prevent concurrent syncs
      this.isSyncing = true;

      // Just upload current local state without merging
      const localRecipes = await loadRecipes();
      const localCookedRecipes = await getCookedRecipes();
      const localPinnedRecipes = await getPinnedRecipes();

      const localData = {
        recipes: localRecipes,
        cookedRecipes: localCookedRecipes,
        pinnedRecipes: localPinnedRecipes,
        lastModified: new Date().toISOString(),
      };

      await googleDriveService.uploadRecipes(localData);
      await this.setLastSyncTime();

      console.log('Quick sync completed successfully');
      return { success: true, message: 'Quick sync completed' };
    } catch (error) {
      console.error('Quick sync error:', error);
      return { success: false, message: error.message };
    } finally {
      // Always reset syncing flag
      this.isSyncing = false;
    }
  }

  async forceDownloadFromDrive() {
    try {
      console.log('Force downloading from Google Drive...');

      if (!googleDriveService.isAuthenticated()) {
        throw new Error('Not authenticated');
      }

      const remoteData = await googleDriveService.downloadRecipes();

      if (remoteData && remoteData.recipes) {
        // Replace local data with remote data
        await saveRecipes(remoteData.recipes);

        if (remoteData.cookedRecipes) {
          await AsyncStorage.setItem('@cookit_cooked_recipes', JSON.stringify(remoteData.cookedRecipes));
        }

        if (remoteData.pinnedRecipes) {
          await AsyncStorage.setItem('@cookit_pinned_recipes', JSON.stringify(remoteData.pinnedRecipes));
        }

        await this.setLastSyncTime();

        return {
          success: true,
          message: `Downloaded ${remoteData.recipes.length} recipes from Drive`,
          data: remoteData,
        };
      }

      return { success: false, message: 'No data found in Drive' };
    } catch (error) {
      console.error('Force download error:', error);
      return { success: false, message: error.message };
    }
  }

  async checkSyncStatus() {
    try {
      const isAuthenticated = googleDriveService.isAuthenticated();
      const lastSync = await this.getLastSyncTime();
      const inProgress = await this.isSyncInProgress();

      return {
        isAuthenticated,
        lastSync,
        inProgress,
      };
    } catch (error) {
      console.error('Error checking sync status:', error);
      return {
        isAuthenticated: false,
        lastSync: null,
        inProgress: false,
      };
    }
  }
}

export default new SyncService();
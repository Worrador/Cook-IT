// Pure JS module - no React Native dependencies
// Can be imported and tested in Node.js environment

class SyncService {
  constructor(dependencies = {}) {
    // Dependency injection for testability
    this.storageProvider = dependencies.storageProvider || null;
    this.driveClient = dependencies.driveClient || null;
    this.excelProcessor = dependencies.excelProcessor || null;

    // Internal state
    this.isSyncing = false;
    this.syncMode = 'excel'; // Default to Excel sync mode

    // Configuration
    this.config = {
      lastSyncKey: '@cookit_last_sync',
      syncInProgressKey: '@cookit_sync_in_progress',
      excelSyncModeKey: '@cookit_excel_sync_mode',
      ...dependencies.config
    };
  }

  // Core sync logic - pure functions that can be unit tested
  async getLastSyncTime() {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      const lastSync = await this.storageProvider.getItem(this.config.lastSyncKey);
      return lastSync ? new Date(lastSync) : null;
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  }

  async setLastSyncTime(time = new Date()) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      await this.storageProvider.setItem(this.config.lastSyncKey, time.toISOString());
    } catch (error) {
      console.error('Error setting last sync time:', error);
    }
  }

  async isSyncInProgress() {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      const inProgress = await this.storageProvider.getItem(this.config.syncInProgressKey);
      return inProgress === 'true';
    } catch (error) {
      console.error('Error checking sync progress:', error);
      return false;
    }
  }

  async setSyncInProgress(inProgress) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      if (inProgress) {
        await this.storageProvider.setItem(this.config.syncInProgressKey, 'true');
      } else {
        await this.storageProvider.removeItem(this.config.syncInProgressKey);
      }
    } catch (error) {
      console.error('Error setting sync progress:', error);
    }
  }

  async getSyncMode() {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      const mode = await this.storageProvider.getItem(this.config.excelSyncModeKey);
      return mode || 'excel';
    } catch (error) {
      console.error('Error getting sync mode:', error);
      return 'excel';
    }
  }

  async setSyncMode(mode) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      await this.storageProvider.setItem(this.config.excelSyncModeKey, mode);
      this.syncMode = mode;
    } catch (error) {
      console.error('Error setting sync mode:', error);
    }
  }

  // Pure business logic - can be unit tested without external dependencies
  async initializeSync() {
    try {
      console.log('Initializing sync service...');

      // Validate dependencies
      if (!this.storageProvider || !this.driveClient || !this.excelProcessor) {
        throw new Error('Required dependencies not initialized');
      }

      // Check if already syncing
      if (await this.isSyncInProgress()) {
        console.log('Sync already in progress, skipping...');
        return { success: false, message: 'Sync already in progress' };
      }

      // Initialize Excel processor
      const excelInitialized = await this.excelProcessor.initialize();
      if (!excelInitialized) {
        console.log('Excel processor initialization failed');
        return { success: false, message: 'Excel processor initialization failed' };
      }

      // Check if Drive is authenticated
      if (!this.driveClient.isAuthenticated()) {
        console.log('Drive not authenticated, attempting authentication...');

        try {
          const authenticated = await this.driveClient.authenticate();
          if (!authenticated) {
            return { success: false, message: 'Authentication failed - please try again' };
          }
        } catch (authError) {
          console.error('Drive authentication error:', authError);
          return this.handleAuthError(authError);
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

  // Pure error handling logic
  handleAuthError(authError) {
    let userMessage = 'Failed to connect to Drive. ';

    if (authError.code === 'DEVELOPER_ERROR') {
      userMessage = 'Google Sign-In is not properly configured. This is a development setup issue. Please check the console for details.';
    } else if (authError.message?.includes('browser')) {
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

  // Core sync logic - pure function for unit testing
  async performExcelSync(forcePush = false, onProgress = () => {}) {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return { success: false, message: 'Sync already in progress' };
    }

    this.isSyncing = true;
    await this.setSyncInProgress(true);
    onProgress(0.05, 'Starting sync...'); // Immediate feedback

    try {
      console.log('Starting Excel-based sync process...');

      // Load local data
      onProgress(0.1, 'Loading local data...');
      const localRecipes = await this.storageProvider.loadRecipes();
      const localLastCookedDates = await this.storageProvider.getLastCookedDates();
      const localPinnedRecipes = await this.storageProvider.getPinnedRecipes();

      console.log(`Found ${localRecipes.length} local recipes`);

      // Always use our intelligent file-based merge instead of old recipe-based logic
      onProgress(0.2, 'Performing file-based merge analysis...');
      
      // Download remote data for comparison
      onProgress(0.3, 'Downloading remote data...');
      await this.excelProcessor.downloadFromDrive();
      const remoteData = await this.excelProcessor.importFromExcel();
      
      onProgress(0.5, 'Analyzing file changes...');
      
      // Get last sync time and modification times for merge decision
      const lastSyncTime = await this.getLastSyncTime();
      const lastSync = lastSyncTime ? new Date(lastSyncTime) : new Date(0);
      
      // For local: use data modification time (not file modification time)
      // For remote: use file modification time from Drive
      const localModified = await this.storageProvider.getLastDataModificationTime();
      const fileId = await this.driveClient.getDriveFileId();
      const remoteFileInfo = await this.driveClient.getFileInfo(fileId);
      
      // Safely create remote date
      let remoteModified;
      try {
        remoteModified = new Date(remoteFileInfo.modifiedTime);
        if (isNaN(remoteModified.getTime())) {
          throw new Error(`Invalid remote date from: ${remoteFileInfo.modifiedTime}`);
        }
      } catch (error) {
        console.error('❌ Error creating remote date:', error);
        remoteModified = new Date(0); // Fallback to epoch
      }
      
      console.log(`📅 Last sync was: ${lastSync.toISOString()}`);
      console.log(`📱 Local data modified: ${localModified.toISOString()}`);
      console.log(`☁️  Drive file modified: ${remoteModified.toISOString()}`);
      
      // Apply 2-minute tolerance to avoid unnecessary syncs due to minor timestamp differences
      const SYNC_TOLERANCE_MS = 60 * 1000; // 1 minute
      
      const localTimeDiff = Math.abs(localModified.getTime() - lastSync.getTime());
      const driveTimeDiff = Math.abs(remoteModified.getTime() - lastSync.getTime());
      
      // Logic: 
      // - If file is newer than sync → always consider changed (even if within tolerance)
      // - If file is older than sync → only consider changed if outside tolerance
      const localChanged = (localModified > lastSync) || (localModified < lastSync && localTimeDiff > SYNC_TOLERANCE_MS);
      const driveChanged = (remoteModified > lastSync) || (remoteModified < lastSync && driveTimeDiff > SYNC_TOLERANCE_MS);
      
      console.log(`⏱️  Time differences: Local=${Math.round(localTimeDiff/1000)}s, Drive=${Math.round(driveTimeDiff/1000)}s (tolerance: 120s)`);
      console.log(`🔄 Since last sync: Local changed=${localChanged}, Drive changed=${driveChanged}`);
      
      // Use file-based merge algorithm
      const mergeResult = await this.mergeExcelDataByFile(
        localRecipes, 
        localLastCookedDates, 
        localPinnedRecipes,
        remoteData.recipes,
        remoteData.lastCookedDates,
        remoteData.pinnedRecipes,
        localChanged,
        driveChanged,
        localModified,
        remoteModified
      );
      
      if (mergeResult.hasChanges) {
        onProgress(0.8, 'Saving merged data...');
        // Save the merged data (skip modification time update during merge decision)
        await this.storageProvider.saveRecipes(mergeResult.recipes, true);
        await this.storageProvider.setLastCookedDates(mergeResult.lastCookedDates);
        await this.storageProvider.setPinnedRecipes(mergeResult.pinnedRecipes);
        
        // Create and upload new Excel file
        onProgress(0.9, 'Uploading merged data...');
        await this.excelProcessor.createLocalExcelFile();
        await this.excelProcessor.uploadToDrive();
      }
      
      // Update data modification time after successful sync completion
      if (mergeResult.hasChanges) {
        await this.storageProvider.updateDataModificationTime();
      }
      
      await this.setLastSyncTime();
      onProgress(1, 'File-based merge complete!');
      return {
        success: true,
        hasChanges: mergeResult.hasChanges,
        message: mergeResult.hasChanges ? 'Files merged using intelligent strategy.' : 'No changes detected.',
        conflictResolved: false,
        resolutionStrategy: 'file_based_merge'
      };

    } catch (error) {
      console.error('Excel sync error:', error);
      return { success: false, message: error.message };
    } finally {
      this.isSyncing = false;
      await this.setSyncInProgress(false);
    }
  }

  // Pure conflict resolution logic
  async handleExcelConflicts(conflictCheck, forcePush) {
    try {
      console.log('Handling Excel conflicts...');

      if (forcePush) {
        // Force push local data to Drive
        console.log('Force push mode: uploading local Excel to Drive');
        await this.excelProcessor.updateWithLocalData();
        const uploadResult = await this.driveClient.upload(this.excelProcessor.getLocalFilePath());

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
      const resolutionOptions = this.excelProcessor.getConflictResolutionOptions();

      // For now, we'll use merge resolution as default
      // In a real app, this would be presented to the user for choice
      console.log('Auto-resolving conflicts using merge strategy...');

      const resolutionResult = await this.excelProcessor.resolveConflict('merge');

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

  // Pure merge logic - core business logic for unit testing
  async performExcelMerge(localRecipes, localLastCookedDates, localPinnedRecipes, forcePush, onProgress = () => {}) {
    try {
      console.log('Performing Excel merge...');

      // First, check if a file exists on Drive
      const driveFileId = await this.driveClient.googleDriveService.getDriveFileId();
      let remoteFileExists = !!driveFileId;

      if (driveFileId) {
        // As an extra check, verify the file info
        const fileInfo = await this.driveClient.getFileInfo(driveFileId);
        if (!fileInfo || fileInfo.trashed) {
          remoteFileExists = false;
          console.log('Drive file is trashed or inaccessible, treating as non-existent.');
          // Clear the stale file ID
          await this.driveClient.googleDriveService.clearDriveFileId();
        }
      }

      if (forcePush || !remoteFileExists) {
        // If forcing, or if no remote file, just create and upload.
        const logMessage = forcePush ? 'Force push mode' : 'No remote file found';
        console.log(`${logMessage}: updating local Excel and uploading to Drive`);
        
        onProgress(0.3, 'Preparing local data...');
        await this.excelProcessor.createLocalExcelFile();
        onProgress(0.5, 'Uploading to Google Drive...');
        const uploadResult = await this.driveClient.upload(); // Simplified upload call

        if (uploadResult.success) {
          await this.setLastSyncTime();
          onProgress(1, `${logMessage} completed successfully`);
          return {
            success: true,
            hasChanges: true,
            message: `${logMessage} completed successfully`,
            data: {
              recipes: localRecipes,
              lastCookedDates: localLastCookedDates,
              pinnedRecipes: localPinnedRecipes
            }
          };
        } else {
          throw new Error('Upload failed during force push or initial creation');
        }
      }

      // Normal sync: download from Drive, merge, and upload back
      let driveData = {
        recipes: [],
        lastCookedDates: {},
        pinnedRecipes: []
      };

      try {
        // Try to download Excel from Drive
        console.log('Downloading Excel from Drive...');
        onProgress(0.3, 'Downloading from Google Drive...');
        const downloadResult = await this.driveClient.download(); // Simplified download call

        if (downloadResult.success) {
          onProgress(0.5, 'Processing downloaded file...');
          // Import the downloaded Excel data
          const importResult = await this.excelProcessor.importFromExcel();

          if (importResult) {
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
        // driveData is already initialized with empty values above
      }

      // Perform merge logic
      onProgress(0.7, 'Merging local and remote data...');
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
        onProgress(0.8, 'Saving merged data...');

        // Save merged data locally
        await this.storageProvider.saveRecipes(mergeResult.mergedRecipes);

        // Update last cooked dates
        await this.storageProvider.setLastCookedDates(mergeResult.mergedLastCookedDates);

        // Update pinned recipes
        await this.storageProvider.setPinnedRecipes(mergeResult.mergedPinnedRecipes);

        // Update local Excel file with current data
        await this.excelProcessor.createLocalExcelFile();

        // Upload updated Excel to Drive
        onProgress(0.9, 'Uploading changes to Google Drive...');
        const uploadResult = await this.driveClient.upload(); // Simplified upload call

        if (!uploadResult.success) {
          throw new Error('Failed to upload merged Excel to Drive');
        }

        console.log('Excel sync completed successfully with changes');
      } else {
        console.log('No changes detected in Excel sync');
      }

      onProgress(1, 'Sync complete!');
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

  // File-based merge algorithm - uses file modification times instead of recipe timestamps
  async mergeExcelDataByFile(localRecipes, localLastCookedDates, localPinnedRecipes,
                             driveRecipes, driveLastCookedDates, drivePinnedRecipes,
                             localChanged, driveChanged, localModified, remoteModified) {
    
    console.log('🔄 File-based merge with intelligent conflict resolution...');
    
    let mergedRecipes = [];
    let hasChanges = false;

    // Strategy 1: If only one file changed, use that entire file
    if (localChanged && !driveChanged) {
      console.log('✅ Only local file changed - using entire local dataset');
      mergedRecipes = [...(localRecipes || [])];
      hasChanges = true;
    } else if (driveChanged && !localChanged) {
      console.log('✅ Only drive file changed - using entire drive dataset');
      mergedRecipes = [...(driveRecipes || [])];
      hasChanges = true;
    } else if (!localChanged && !driveChanged) {
      console.log('ℹ️  Neither local data nor drive file changed significantly since sync (within 2min tolerance) - no sync needed');
      mergedRecipes = [...(driveRecipes || [])];
    } else {
      // Strategy 2: Both files changed - use the newer file entirely
      console.log('⚔️  Both files changed - using newer file');
      if (localModified > remoteModified) {
        console.log(`✅ Local file is newer (${localModified.toISOString()}) - using local dataset`);
        mergedRecipes = [...(localRecipes || [])];
        hasChanges = true;
      } else {
        console.log(`✅ Drive file is newer (${remoteModified.toISOString()}) - using drive dataset`);
        mergedRecipes = [...(driveRecipes || [])];
        hasChanges = true;
      }
    }

    // Initialize other merged data with the same source as recipes
    let mergedLastCookedDates, mergedPinnedRecipes;
    
    if (localChanged && !driveChanged) {
      mergedLastCookedDates = { ...(localLastCookedDates || {}) };
      mergedPinnedRecipes = [...(localPinnedRecipes || [])];
    } else if (driveChanged && !localChanged) {
      mergedLastCookedDates = { ...(driveLastCookedDates || {}) };
      mergedPinnedRecipes = [...(drivePinnedRecipes || [])];
    } else if (!localChanged && !driveChanged) {
      mergedLastCookedDates = { ...(driveLastCookedDates || {}) };
      mergedPinnedRecipes = [...(drivePinnedRecipes || [])];
    } else {
      // Both changed - use data from newer file
      if (localModified > remoteModified) {
        mergedLastCookedDates = { ...(localLastCookedDates || {}) };
        mergedPinnedRecipes = [...(localPinnedRecipes || [])];
      } else {
        mergedLastCookedDates = { ...(driveLastCookedDates || {}) };
        mergedPinnedRecipes = [...(drivePinnedRecipes || [])];
      }
    }

    console.log(`🎯 File-based merge completed: ${mergedRecipes.length} recipes from ${hasChanges ? 'newer' : 'drive'} source`);

    return {
      recipes: mergedRecipes,
      lastCookedDates: mergedLastCookedDates,
      pinnedRecipes: mergedPinnedRecipes,
      hasChanges
    };
  }

  // Pure merge algorithm - perfect for unit testing (DEPRECATED - use mergeExcelDataByFile)
  async mergeExcelData(localRecipes, localLastCookedDates, localPinnedRecipes,
                       driveRecipes, driveLastCookedDates, drivePinnedRecipes) {
    console.log('Merging Excel data with intelligent conflict resolution...');

    // Get last sync time to determine what changed since then
    const lastSyncTime = await this.getLastSyncTime();
    const lastSync = lastSyncTime ? new Date(lastSyncTime) : new Date(0);
    
    console.log(`📅 Last sync was: ${lastSync.toISOString()}`);

    // Get detailed timing information for both sources
    const localTimingInfo = this.getDataTimingInfo(localRecipes, 'Local');
    const driveTimingInfo = this.getDataTimingInfo(driveRecipes, 'Drive');
    
    console.log(`📱 ${localTimingInfo.summary}`);
    console.log(`☁️  ${driveTimingInfo.summary}`);

    // Determine which data sources have changed since last sync
    const localChanged = localTimingInfo.latestModified > lastSync;
    const driveChanged = driveTimingInfo.latestModified > lastSync;
    
    console.log(`🔄 Sync decision: Local changed=${localChanged}, Drive changed=${driveChanged}`);

    let mergedRecipes = [];
    let hasChanges = false;

    // Strategy 1: If only one source changed, use that source
    if (localChanged && !driveChanged) {
      console.log('Only local changed - using local data');
      mergedRecipes = [...(localRecipes || [])];
      hasChanges = true;
    } else if (driveChanged && !localChanged) {
      console.log('Only drive changed - using drive data');
      mergedRecipes = [...(driveRecipes || [])];
      hasChanges = true;
    } else if (!localChanged && !driveChanged) {
      console.log('Neither changed since sync - using drive data as base');
      mergedRecipes = [...(driveRecipes || [])];
    } else {
      // Strategy 2: Both changed - intelligent merge required
      console.log('Both sources changed - performing intelligent merge');
      const mergeResult = this.performIntelligentMerge(localRecipes, driveRecipes, lastSync);
      mergedRecipes = mergeResult.recipes;
      hasChanges = mergeResult.hasChanges;
    }

    // Initialize other merged data with drive as base
    const mergedLastCookedDates = { ...(driveLastCookedDates || {}) };
    const mergedPinnedRecipes = [...(drivePinnedRecipes || [])];

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

  /**
   * Perform sync with Google Drive
   */
  async performSync(forcePush = false, onProgress = () => {}) {
    console.log('Legacy performSync called, redirecting to Excel sync...');
    return this.performExcelSync(forcePush, onProgress);
  }

  // Legacy method - now redirects to Excel merge
  async mergeData(localData, remoteData, forcePush = false) {
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

  // Pure utility function
  getRecipeKey(recipe) {
    // Create a unique key based on name, url, and comment
    // Similar to the desktop app's composite key approach
    return `${recipe.name || ''}|${recipe.url || ''}|${recipe.comment || ''}`;
  }

  // Get detailed timing information about a data source
  getDataTimingInfo(recipes, sourceName) {
    if (!recipes || recipes.length === 0) {
      return {
        latestModified: new Date(0),
        summary: `${sourceName}: No recipes (empty dataset)`,
        recipeCount: 0,
        modifiedRecipes: []
      };
    }

    let latestModified = new Date(0);
    let oldestModified = new Date();
    const modifiedRecipes = [];

    recipes.forEach(recipe => {
      const modified = new Date(recipe.createdAt || recipe.lastModified || 0);
      if (modified > latestModified) {
        latestModified = modified;
      }
      if (modified < oldestModified) {
        oldestModified = modified;
      }
      modifiedRecipes.push({
        name: recipe.name,
        modified: modified.toISOString()
      });
    });

    // Sort by modification time (newest first)
    modifiedRecipes.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    const summary = `${sourceName}: ${recipes.length} recipes, latest modified: ${latestModified.toISOString()}, oldest: ${oldestModified.toISOString()}`;
    
    return {
      latestModified,
      oldestModified,
      summary,
      recipeCount: recipes.length,
      modifiedRecipes
    };
  }

  // Check if data has changed since last sync (legacy method - now uses timing info)
  hasDataChangedSinceSync(recipes, lastSyncTime) {
    const timingInfo = this.getDataTimingInfo(recipes, 'Unknown');
    return timingInfo.latestModified > lastSyncTime;
  }

  // Intelligent merge when both sources have changed
  performIntelligentMerge(localRecipes, driveRecipes, lastSyncTime) {
    console.log('Performing intelligent merge...');
    
    const mergedRecipes = [];
    const processedKeys = new Set();
    let hasChanges = false;

    // Create maps for efficient lookup
    const localMap = new Map();
    const driveMap = new Map();
    
    (localRecipes || []).forEach(recipe => {
      const key = this.getRecipeKey(recipe);
      localMap.set(key, recipe);
    });
    
    (driveRecipes || []).forEach(recipe => {
      const key = this.getRecipeKey(recipe);
      driveMap.set(key, recipe);
    });

    // Process all unique recipe keys
    const allKeys = new Set([...localMap.keys(), ...driveMap.keys()]);
    
    for (const key of allKeys) {
      const localRecipe = localMap.get(key);
      const driveRecipe = driveMap.get(key);
      
      if (localRecipe && driveRecipe) {
        // Recipe exists in both - use the newer one
        const localModified = new Date(localRecipe.createdAt || localRecipe.lastModified || 0);
        const driveModified = new Date(driveRecipe.createdAt || driveRecipe.lastModified || 0);
        
        if (localModified >= driveModified) {
          mergedRecipes.push(localRecipe);
          console.log(`📱 Using local version of "${localRecipe.name}": local=${localModified.toISOString()}, drive=${driveModified.toISOString()}`);
        } else {
          mergedRecipes.push(driveRecipe);
          console.log(`☁️  Using drive version of "${driveRecipe.name}": local=${localModified.toISOString()}, drive=${driveModified.toISOString()}`);
        }
        hasChanges = true;
      } else if (localRecipe) {
        // Only exists locally - check for similar recipes in drive
        const similarDriveRecipe = this.findSimilarRecipe(localRecipe, driveRecipes);
        
        if (similarDriveRecipe && !processedKeys.has(this.getRecipeKey(similarDriveRecipe))) {
          // Found similar recipe - apply conflict resolution
          const resolution = this.resolveRecipeConflict(localRecipe, similarDriveRecipe);
          mergedRecipes.push(...resolution.recipes);
          processedKeys.add(this.getRecipeKey(similarDriveRecipe));
          console.log(`Resolved conflict between "${localRecipe.name}" and "${similarDriveRecipe.name}": ${resolution.action}`);
        } else {
          // Unique local recipe
          mergedRecipes.push(localRecipe);
          console.log(`Added unique local recipe: ${localRecipe.name}`);
        }
        hasChanges = true;
      } else if (driveRecipe) {
        // Only exists in drive - check if we already processed it
        if (!processedKeys.has(key)) {
          mergedRecipes.push(driveRecipe);
          console.log(`Added unique drive recipe: ${driveRecipe.name}`);
          hasChanges = true;
        }
      }
      
      processedKeys.add(key);
    }

    console.log(`🎯 Intelligent merge completed: ${mergedRecipes.length} recipes in final result`);
    return { recipes: mergedRecipes, hasChanges };
  }

  // Find similar recipe (same name but different url/comment)
  findSimilarRecipe(targetRecipe, recipes) {
    return (recipes || []).find(recipe => {
      // Same name but different key (different url or comment)
      return recipe.name === targetRecipe.name && 
             this.getRecipeKey(recipe) !== this.getRecipeKey(targetRecipe);
    });
  }

  // Resolve conflict between two similar recipes
  resolveRecipeConflict(localRecipe, driveRecipe) {
    // Count differences in the three key fields
    const differences = [];
    
    if (localRecipe.name !== driveRecipe.name) differences.push('name');
    if ((localRecipe.url || '') !== (driveRecipe.url || '')) differences.push('url');
    if ((localRecipe.comment || '') !== (driveRecipe.comment || '')) differences.push('comment');
    
    const localModified = new Date(localRecipe.createdAt || localRecipe.lastModified || 0);
    const driveModified = new Date(driveRecipe.createdAt || driveRecipe.lastModified || 0);
    
    console.log(`⚔️  Recipe conflict between "${localRecipe.name}" and "${driveRecipe.name}"`);
    console.log(`   📱 Local modified: ${localModified.toISOString()}`);
    console.log(`   ☁️  Drive modified: ${driveModified.toISOString()}`);
    console.log(`   🔍 Differences in: [${differences.join(', ')}]`);
    
    if (differences.length <= 1) {
      // Minor change (0-1 fields different) - keep the newer version
      if (localModified >= driveModified) {
        console.log(`   ✅ Resolution: Keep local (newer, ${differences.length} field${differences.length !== 1 ? 's' : ''} changed)`);
        return {
          recipes: [localRecipe],
          action: `kept newer local version (${differences.length} field${differences.length !== 1 ? 's' : ''} changed)`
        };
      } else {
        console.log(`   ✅ Resolution: Keep drive (newer, ${differences.length} field${differences.length !== 1 ? 's' : ''} changed)`);
        return {
          recipes: [driveRecipe],
          action: `kept newer drive version (${differences.length} field${differences.length !== 1 ? 's' : ''} changed)`
        };
      }
    } else {
      // Major change (2+ fields different) - keep both recipes
      console.log(`   ✅ Resolution: Keep both (major changes, ${differences.length} fields changed)`);
      return {
        recipes: [localRecipe, driveRecipe],
        action: `kept both versions (${differences.length} fields changed)`
      };
    }
  }

  // Quick sync for immediate updates
  async quickSync() {
    try {
      if (!this.driveClient?.isAuthenticated()) {
        return { success: false, message: 'Not authenticated' };
      }

      // Check if already syncing to prevent multiple simultaneous syncs
      if (this.isSyncing) {
        return { success: false, message: 'Sync already in progress' };
      }

      // Set syncing flag to prevent concurrent syncs
      this.isSyncing = true;

      // Update local Excel and upload to Drive
      await this.excelProcessor.createLocalExcelFile();
      const uploadResult = await this.driveClient.upload(this.excelProcessor.getLocalFilePath());

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

  // Force download from Drive
  async forceDownloadFromDrive() {
    try {
      console.log('Force downloading Excel from Drive...');

      if (!this.driveClient?.isAuthenticated()) {
        throw new Error('Not authenticated');
      }

      // Download Excel from Drive
      const downloadResult = await this.driveClient.download();

      if (downloadResult.success) {
        // Import the downloaded Excel data
        const importResult = await this.excelProcessor.importFromExcel();

        if (importResult) {
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

  // Export to Excel
  async exportToExcel() {
    try {
      console.log('Exporting local data to Excel...');

      const result = await this.excelProcessor.createLocalExcelFile();

      if (result) {
        return {
          success: true,
          message: 'Data exported to Excel successfully',
          fileInfo: await this.excelProcessor.getLocalFileInfo()
        };
      } else {
        throw new Error('Failed to create Excel file');
      }
    } catch (error) {
      console.error('Export to Excel error:', error);
      return { success: false, message: error.message };
    }
  }

  // Import from Excel
  async importFromExcel() {
    try {
      console.log('Importing data from Excel...');

      const result = await this.excelProcessor.importFromExcel();

      if (result) {
        return {
          success: true,
          message: `Imported ${result.recipes?.length || 0} recipes from Excel`,
          data: result
        };
      } else {
        // Handle failed import result
        const errorMessage = result?.message || 'Failed to import Excel data';
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error('Import from Excel error:', error);
      return { success: false, message: error.message };
    }
  }

  // Check sync status
  async checkSyncStatus() {
    try {
      const isAuthenticated = this.driveClient?.isAuthenticated() || false;
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

  // Get Excel file info
  async getExcelFileInfo() {
    try {
      return await this.excelProcessor.getLocalFileInfo();
    } catch (error) {
      console.error('Error getting Excel file info:', error);
      return null;
    }
  }

  // Check for conflicts
  async checkForConflicts() {
    try {
      if (!this.driveClient?.isAuthenticated()) {
        return { hasConflicts: false, message: 'Not authenticated with Drive' };
      }

      return await this.excelProcessor.checkConflicts();
    } catch (error) {
      console.error('Error checking for conflicts:', error);
      return { hasConflicts: false, message: error.message };
    }
  }

  // Resolve Excel conflict
  async resolveExcelConflict(resolution) {
    try {
      const result = await this.excelProcessor.resolveConflict(resolution);

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

// Export the class for testing, not an instance
export { SyncService };

// For React Native usage, create a factory function
export const createSyncService = (dependencies) => {
  return new SyncService(dependencies);
};

// Create adapters to bridge the interface differences
class DriveClientAdapter {
  constructor(googleDriveService, excelService) {
    this.googleDriveService = googleDriveService;
    this.excelService = excelService;
  }

  async upload() {
    try {
      // Use the excelService uploadToDrive method which I fixed earlier
      if (!this.excelService || typeof this.excelService.uploadToDrive !== 'function') {
        throw new Error('Excel service not properly initialized');
      }
      const result = await this.excelService.uploadToDrive();
      return { success: result }; // Convert boolean to object with success property
    } catch (error) {
      console.error('DriveClientAdapter upload error:', error);
      return { success: false, error: error.message };
    }
  }

  isAuthenticated() {
    return this.googleDriveService && this.googleDriveService.isAuthenticated();
  }

  async authenticate() {
    if (!this.googleDriveService) {
      throw new Error('Google Drive service not initialized');
    }
    return this.googleDriveService.authenticate();
  }

  async download() {
    try {
      if (!this.googleDriveService) {
        throw new Error('Google Drive service not initialized');
      }
      const fileId = await this.googleDriveService.getDriveFileId();
      if (!fileId) {
        return { success: false, error: 'No file ID found' };
      }
      await this.googleDriveService.downloadFile(fileId);
      // The content is now in the local file, ready for importFromExcel
      return { success: true };
    } catch (error) {
      console.error('DriveClientAdapter download error:', error);
      return { success: false, error: error.message };
    }
  }

  async getDriveFileId() {
    if (!this.googleDriveService) {
      throw new Error('Google Drive service not initialized');
    }
    return this.googleDriveService.getDriveFileId();
  }

  async getFileInfo(fileId) {
    if (!this.googleDriveService) {
      throw new Error('Google Drive service not initialized');
    }
    return this.googleDriveService.getFileInfo(fileId);
  }

  async listFiles() {
    try {
      if (!this.googleDriveService) {
        throw new Error('Google Drive service not initialized');
      }
      // For now, return empty array since we only work with one file
      return [];
    } catch (error) {
      console.error('DriveClientAdapter listFiles error:', error);
      return [];
    }
  }

  async deleteFile(fileId) {
    try {
      if (!this.googleDriveService) {
        throw new Error('Google Drive service not initialized');
      }
      return await this.googleDriveService.deleteFile(fileId);
    } catch (error) {
      console.error('DriveClientAdapter deleteFile error:', error);
      return false;
    }
  }

  async getFileInfo(fileId) {
    try {
      if (!this.googleDriveService) {
        throw new Error('Google Drive service not initialized');
      }
      return await this.googleDriveService.getFileInfo(fileId);
    } catch (error) {
      console.error('DriveClientAdapter getFileInfo error:', error);
      return null;
    }
  }
}

class StorageProviderAdapter {
  async getItem(key) {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return AsyncStorage.getItem(key);
  }

  async setItem(key, value) {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return AsyncStorage.setItem(key, value);
  }

  async removeItem(key) {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return AsyncStorage.removeItem(key);
  }

  // Recipe storage methods
  async loadRecipes() {
    try {
      const recipesJson = await this.getItem('@cookit_recipes');
      return recipesJson ? JSON.parse(recipesJson) : [];
    } catch (error) {
      console.error('Error loading recipes:', error);
      return [];
    }
  }

  async saveRecipes(recipes, skipModificationTimeUpdate = false) {
    try {
      await this.setItem('@cookit_recipes', JSON.stringify(recipes));
      
      // Update data modification time (only if not called by sync process)
      if (!skipModificationTimeUpdate) {
        await this.setItem('@cookit_last_data_modification', new Date().toISOString());
      }
      
      return true;
    } catch (error) {
      console.error('Error saving recipes:', error);
      return false;
    }
  }

  async getLastCookedDates() {
    try {
      const datesJson = await this.getItem('@cookit_last_cooked_dates');
      return datesJson ? JSON.parse(datesJson) : {};
    } catch (error) {
      console.error('Error loading last cooked dates:', error);
      return {};
    }
  }

  async setLastCookedDates(dates) {
    try {
      await this.setItem('@cookit_last_cooked_dates', JSON.stringify(dates));
      return true;
    } catch (error) {
      console.error('Error saving last cooked dates:', error);
      return false;
    }
  }

  async getPinnedRecipes() {
    try {
      const pinnedJson = await this.getItem('@cookit_pinned_recipes');
      return pinnedJson ? JSON.parse(pinnedJson) : [];
    } catch (error) {
      console.error('Error loading pinned recipes:', error);
      return [];
    }
  }

  async setPinnedRecipes(recipes) {
    try {
      await this.setItem('@cookit_pinned_recipes', JSON.stringify(recipes));
      return true;
    } catch (error) {
      console.error('Error saving pinned recipes:', error);
      return false;
    }
  }

  async getLastDataModificationTime() {
    try {
      const lastModified = await this.getItem('@cookit_last_data_modification');
      return lastModified ? new Date(lastModified) : new Date(0);
    } catch (error) {
      console.error('Error getting last data modification time:', error);
      return new Date(0);
    }
  }

  async updateDataModificationTime() {
    try {
      const timestamp = new Date().toISOString();
      console.log(`🕒 Data modification time updated to ${timestamp} by: syncService (after successful sync)`);
      await this.setItem('@cookit_last_data_modification', timestamp);
      return true;
    } catch (error) {
      console.error('Error updating data modification time:', error);
      return false;
    }
  }
}

class ExcelProcessorAdapter {
  constructor(excelService) {
    this.excelService = excelService;
  }

  async initialize() {
    if (!this.excelService || typeof this.excelService.initialize !== 'function') {
      console.error('Excel service not properly initialized');
      return false;
    }
    return this.excelService.initialize();
  }

  async createLocalExcelFile() {
    if (!this.excelService || typeof this.excelService.createLocalExcelFile !== 'function') {
      throw new Error('Excel service createLocalExcelFile method not available');
    }
    return this.excelService.createLocalExcelFile();
  }

  async updateWithLocalData() {
    if (!this.excelService || typeof this.excelService.createLocalExcelFile !== 'function') {
      throw new Error('Excel service createLocalExcelFile method not available');
    }
    return this.excelService.createLocalExcelFile();
  }

  async importFromExcel() {
    if (!this.excelService || typeof this.excelService.importFromExcel !== 'function') {
      throw new Error('Excel service importFromExcel method not available');
    }
    return this.excelService.importFromExcel();
  }

  getLocalFilePath() {
    if (!this.excelService) {
      throw new Error('Excel service not initialized');
    }
    return this.excelService.localFilePath;
  }

  getRemoteFilePath() {
    // Return a default path for remote file
    return 'CookIT_Recipes.xlsx';
  }

  async resolveConflict(strategy) {
    if (!this.excelService || typeof this.excelService.resolveConflict !== 'function') {
      throw new Error('Excel service resolveConflict method not available');
    }
    return this.excelService.resolveConflict(strategy);
  }

  getConflictResolutionOptions() {
    if (!this.excelService || typeof this.excelService.getConflictResolutionOptions !== 'function') {
      return ['merge', 'local', 'remote'];
    }
    return this.excelService.getConflictResolutionOptions();
  }

  async importFromExcel() {
    if (!this.excelService || typeof this.excelService.importFromExcel !== 'function') {
      throw new Error('Excel service importFromExcel method not available');
    }
    return this.excelService.importFromExcel();
  }

  async checkConflicts() {
    if (!this.excelService || typeof this.excelService.checkConflicts !== 'function') {
      return { hasConflicts: false, message: 'Conflict checking not available' };
    }
    return this.excelService.checkConflicts();
  }

  async getLocalFileInfo() {
    if (!this.excelService || typeof this.excelService.getLocalFileInfo !== 'function') {
      return null;
    }
    return this.excelService.getLocalFileInfo();
  }

  async downloadFromDrive() {
    if (!this.excelService || typeof this.excelService.downloadFromDrive !== 'function') {
      throw new Error('Excel service downloadFromDrive method not available');
    }
    return this.excelService.downloadFromDrive();
  }

  async uploadToDrive() {
    if (!this.excelService || typeof this.excelService.uploadToDrive !== 'function') {
      throw new Error('Excel service uploadToDrive method not available');
    }
    return this.excelService.uploadToDrive();
  }
}

// Create the configured instance
let configuredSyncService = null;

const createConfiguredSyncService = async () => {
  if (configuredSyncService) return configuredSyncService;

  try {
    // Import the services (they are already instances)
    const googleDriveServiceModule = await import('./googleDriveService');
    const excelServiceModule = await import('./excelService');

    const googleDriveService = googleDriveServiceModule.default;
    const excelService = excelServiceModule.default;

    // Initialize the services first
    await googleDriveService.initialize();
    await excelService.initialize();

    // Create adapters
    const storageProvider = new StorageProviderAdapter();
    const driveClient = new DriveClientAdapter(googleDriveService, excelService);
    const excelProcessor = new ExcelProcessorAdapter(excelService);

    // Create the configured sync service
    configuredSyncService = new SyncService({
      storageProvider,
      driveClient,
      excelProcessor
    });

    return configuredSyncService;
  } catch (error) {
    console.error('Error creating configured sync service:', error);
    return null;
  }
};

// Legacy default export - return a proxy that lazy-loads the configured instance
export default new Proxy({}, {
  get(target, prop) {
    return async function(...args) {
      try {
        const service = await createConfiguredSyncService();
        if (!service) {
          throw new Error('Sync service failed to initialize');
        }

        if (typeof service[prop] !== 'function') {
          throw new Error(`Method ${prop} is not available on sync service`);
        }

        return service[prop](...args);
      } catch (error) {
        console.error(`Error calling sync service method ${prop}:`, error);
        // Return a consistent error response for UI handling
        if (prop === 'checkSyncStatus') {
          return {
            isAuthenticated: false,
            lastSync: null,
            inProgress: false,
            syncMode: 'excel'
          };
        }
        if (prop === 'initializeSync' || prop === 'performSync') {
          return {
            success: false,
            message: `Sync service error: ${error.message}`
          };
        }
        throw error;
      }
    };
  }
});
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECIPES_KEY = '@cookit_recipes';
const COOKED_RECIPES_KEY = '@cookit_cooked_recipes';
const TUTORIAL_COUNT_KEY = '@cookit_tutorial_count';
const PINNED_RECIPES_KEY = '@cookit_pinned_recipes';
const EXCEL_SYNC_ENABLED_KEY = '@cookit_excel_sync_enabled';
const LAST_EXCEL_SYNC_KEY = '@cookit_last_excel_sync';
const LAST_COOKED_DATES_KEY = '@cookit_last_cooked_dates';
const COOK_COUNTS_KEY = '@cookit_cook_counts';
const LAST_DATA_MODIFICATION_KEY = '@cookit_last_data_modification';

// Import services
let syncService = null;
let excelService = null;
let recipeImageService = null;

const importServices = async () => {
  if (!syncService) {
    try {
      const module = await import('../services/syncService');
      syncService = module.default;
    } catch (error) {
      console.warn('SyncService not available:', error);
    }
  }

  if (!excelService) {
    try {
      const module = await import('../services/excelService');
      excelService = module.default;
    } catch (error) {
      console.warn('ExcelService not available:', error);
    }
  }

  if (!recipeImageService) {
    try {
      const module = await import('../services/recipeImageService');
      recipeImageService = module.default;
    } catch (error) {
      console.warn('RecipeImageService not available:', error);
    }
  }

  return { syncService, excelService, recipeImageService };
};

// Helper function to trigger a background sync after data changes.
//
// This intentionally goes through syncService.safeBackgroundSync() - a merge-aware
// sync that downloads the Drive workbook, merges it with local data per-recipe, and
// only uploads when needed - rather than the old approach of rebuilding the local
// Excel file and blindly uploading it. A blind upload silently destroys any change
// made by another device/app (e.g. the desktop app) since the last full sync, because
// it never looks at what's currently on Drive. safeBackgroundSync() also no-ops if a
// sync is already running or the user isn't authenticated, so it's safe to call from
// every mutation without risking overlapping Drive writes.
let backgroundSyncTimeout = null;
let backgroundSyncRunning = false;
let lastBackgroundSyncError = null;
const BACKGROUND_SYNC_ERROR_COOLDOWN = 30000; // 30 seconds cooldown after sync errors
const BACKGROUND_SYNC_DEBOUNCE_MS = 4000; // Debounce a few seconds - this is a heavier download+merge+upload, not a cheap local write

const triggerBackgroundSync = async () => {
  try {
    // Check if Excel sync is enabled
    const excelSyncEnabled = await AsyncStorage.getItem(EXCEL_SYNC_ENABLED_KEY);
    if (excelSyncEnabled !== 'true') {
      return; // Excel sync is disabled
    }

    // Check if we're in a cooldown period due to recent sync errors
    if (lastBackgroundSyncError && (Date.now() - lastBackgroundSyncError) < BACKGROUND_SYNC_ERROR_COOLDOWN) {
      return;
    }

    // Clear any existing timeout so rapid successive edits collapse into one sync
    if (backgroundSyncTimeout) {
      clearTimeout(backgroundSyncTimeout);
    }

    // Debounce sync calls to prevent rapid successive calls from stacking overlapping
    // downloads/uploads against the same local file and the same Drive file.
    const runSync = async () => {
      // If a previously scheduled sync is still in flight, don't start a second one
      // (belt-and-suspenders on top of safeBackgroundSync's own self-guard) - just
      // retry shortly instead of dropping this pending change on the floor.
      if (backgroundSyncRunning) {
        backgroundSyncTimeout = setTimeout(runSync, BACKGROUND_SYNC_DEBOUNCE_MS);
        return;
      }

      backgroundSyncTimeout = null;
      backgroundSyncRunning = true;

      try {
        const { syncService, recipeImageService } = await importServices();
        if (syncService) {
          const result = await syncService.safeBackgroundSync();
          if (!result || !result.success) {
            // Record sync error and start cooldown
            lastBackgroundSyncError = Date.now();
            console.warn('Background sync failed:', result && result.message);
          } else {
            // Clear error state. Deliberately do NOT stamp LAST_EXCEL_SYNC_KEY here:
            // performExcelSync already writes it (via setLastSyncTime) using the time
            // the sync STARTED, so that edits made while the sync was running are
            // still seen as newer than the last sync. Overwriting it with the
            // completion time would silently swallow exactly those edits.
            lastBackgroundSyncError = null;

            // A successful sync means Drive is reachable and authenticated, so this
            // is a good moment to retry any image uploads that failed earlier (e.g.
            // because the device was offline when the photo was taken). Best-effort:
            // never let a retry failure affect the sync result above.
            if (recipeImageService?.processUploadQueue) {
              recipeImageService.processUploadQueue().catch(imgError => {
                console.warn('Retrying queued image uploads failed:', imgError);
              });
            }
          }
        }
      } catch (error) {
        // Record sync error and start cooldown
        lastBackgroundSyncError = Date.now();
        console.warn('Failed to trigger background sync:', error);
      } finally {
        backgroundSyncRunning = false;
      }
    };

    backgroundSyncTimeout = setTimeout(runSync, BACKGROUND_SYNC_DEBOUNCE_MS);
  } catch (error) {
    console.warn('Failed to trigger background sync:', error);
  }
};

// Excel sync management functions
export const enableExcelSync = async () => {
  try {
    await AsyncStorage.setItem(EXCEL_SYNC_ENABLED_KEY, 'true');
    console.log('Excel sync enabled');
  } catch (error) {
    console.error('Error enabling Excel sync:', error);
  }
};

export const disableExcelSync = async () => {
  try {
    await AsyncStorage.setItem(EXCEL_SYNC_ENABLED_KEY, 'false');
    console.log('Excel sync disabled');
  } catch (error) {
    console.error('Error disabling Excel sync:', error);
  }
};

export const isExcelSyncEnabled = async () => {
  try {
    const enabled = await AsyncStorage.getItem(EXCEL_SYNC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('Error checking Excel sync status:', error);
    return false;
  }
};

export const getLastExcelSyncTime = async () => {
  try {
    const lastSync = await AsyncStorage.getItem(LAST_EXCEL_SYNC_KEY);
    return lastSync ? new Date(lastSync) : null;
  } catch (error) {
    console.error('Error getting last Excel sync time:', error);
    return null;
  }
};

// Helper function to update data modification timestamp
const updateDataModificationTime = async (source = 'unknown') => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`🕒 Data modification time updated to ${timestamp} by: ${source}`);
    await AsyncStorage.setItem(LAST_DATA_MODIFICATION_KEY, timestamp);
  } catch (error) {
    console.error('Error updating data modification time:', error);
  }
};

// Get last data modification time
export const getLastDataModificationTime = async () => {
  try {
    const lastModified = await AsyncStorage.getItem(LAST_DATA_MODIFICATION_KEY);
    return lastModified ? new Date(lastModified) : new Date(0);
  } catch (error) {
    console.error('Error getting last data modification time:', error);
    return new Date(0);
  }
};

// Enhanced recipe management with Excel sync
export const saveRecipes = async (recipes, skipModificationTimeUpdate = false) => {
  try {
    // Save to local JSON storage for app functionality
    await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));

    // Update data modification time (only if not called by sync process)
    if (!skipModificationTimeUpdate) {
      await updateDataModificationTime('saveRecipes');
    }

    // Trigger background sync if enabled (only if not called by sync process)
    if (!skipModificationTimeUpdate) {
      await triggerBackgroundSync();
    }
  } catch (error) {
    console.error('Error saving recipes:', error);
  }
};

export const loadRecipes = async () => {
  try {
    const recipes = await AsyncStorage.getItem(RECIPES_KEY);
    return recipes ? JSON.parse(recipes) : [];
  } catch (error) {
    console.error('Error loading recipes:', error);
    return [];
  }
};

export const addRecipe = async (recipe) => {
  try {
    const recipes = await loadRecipes();
    const newRecipe = {
      ...recipe,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      cooked: false,
    };
    recipes.push(newRecipe);

    // saveRecipes() already schedules a background sync; no separate trigger needed here.
    await saveRecipes(recipes);

    return recipes;
  } catch (error) {
    console.error('Error adding recipe:', error);
    return [];
  }
};

export const deleteRecipe = async (recipeName) => {
  try {
    const recipes = await loadRecipes();
    const deletedRecipe = recipes.find(recipe => recipe.name === recipeName);
    const updatedRecipes = recipes.filter(recipe => recipe.name !== recipeName);

    // saveRecipes() schedules a debounced background sync; since it only fires a few
    // seconds later, it still picks up the cleanup writes below - no separate trigger needed.
    await saveRecipes(updatedRecipes);

    // Clean up this recipe's photos: local files always, Drive copies best-effort.
    // Never let an image cleanup failure block the recipe delete itself.
    if (deletedRecipe?.images?.length) {
      try {
        const { recipeImageService } = await importServices();
        if (recipeImageService) {
          for (const image of deletedRecipe.images) {
            await recipeImageService.deleteImage(image);
          }
        }
      } catch (error) {
        console.warn('Error cleaning up images for deleted recipe:', error);
      }
    }

    // Clean up pinned recipes
    const pinnedRecipes = await getPinnedRecipes();
    const updatedPinnedRecipes = pinnedRecipes.filter(name => name !== recipeName);
    await AsyncStorage.setItem(PINNED_RECIPES_KEY, JSON.stringify(updatedPinnedRecipes));

    // Clean up cooked recipes
    const cookedRecipes = await getCookedRecipes();
    if (cookedRecipes[recipeName] !== undefined) {
      delete cookedRecipes[recipeName];
      await AsyncStorage.setItem(COOKED_RECIPES_KEY, JSON.stringify(cookedRecipes));
    }

    // Clean up last cooked dates
    const lastCookedDates = await getLastCookedDates();
    if (lastCookedDates[recipeName] !== undefined) {
      delete lastCookedDates[recipeName];
      await AsyncStorage.setItem(LAST_COOKED_DATES_KEY, JSON.stringify(lastCookedDates));
    }

    // Clean up cook counts
    const cookCounts = await getCookCounts();
    if (cookCounts[recipeName] !== undefined) {
      delete cookCounts[recipeName];
      await AsyncStorage.setItem(COOK_COUNTS_KEY, JSON.stringify(cookCounts));
    }

    return updatedRecipes;
  } catch (error) {
    console.error('Error deleting recipe:', error);
    return [];
  }
};

export const updateRecipe = async (recipeName, updates) => {
  try {
    const recipes = await loadRecipes();
    const updatedRecipes = recipes.map(recipe =>
      recipe.name === recipeName ? { ...recipe, ...updates, lastModified: new Date().toISOString() } : recipe
    );

    // saveRecipes() already schedules a background sync; no separate trigger needed here.
    await saveRecipes(updatedRecipes);

    return updatedRecipes;
  } catch (error) {
    console.error('Error updating recipe:', error);
    return [];
  }
};

export const getCookedRecipes = async () => {
  try {
    const cookedRecipes = await AsyncStorage.getItem(COOKED_RECIPES_KEY);
    return cookedRecipes ? JSON.parse(cookedRecipes) : {};
  } catch (error) {
    console.error('Error loading cooked recipes:', error);
    return {};
  }
};

export const getLastCookedDates = async () => {
  try {
    const lastCooked = await AsyncStorage.getItem(LAST_COOKED_DATES_KEY);
    return lastCooked ? JSON.parse(lastCooked) : {};
  } catch (error) {
    console.error('Error loading last cooked dates:', error);
    return {};
  }
};

export const setLastCookedDates = async (datesObject) => {
  try {
    await AsyncStorage.setItem(LAST_COOKED_DATES_KEY, JSON.stringify(datesObject || {}));
  } catch (error) {
    console.error('Error saving last cooked dates:', error);
  }
};

export const setCookedStatus = async (recipeName, isCooked) => {
  try {
    // Update data modification time for cooked status changes
    await updateDataModificationTime('setCookedStatus');
    
    const cookedRecipes = await getCookedRecipes();
    cookedRecipes[recipeName] = isCooked;
    await AsyncStorage.setItem(COOKED_RECIPES_KEY, JSON.stringify(cookedRecipes));

    // Maintain last cooked date alongside cooked status
    const lastCookedDates = await getLastCookedDates();
    if (isCooked) {
      const currentDate = new Date();
      const lastCookedDate = lastCookedDates[recipeName];

      // Check if the recipe was cooked within the last 3 days
      const threeDaysAgo = new Date(currentDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      const wasRecentlyCooked = lastCookedDate && new Date(lastCookedDate) >= threeDaysAgo;

      // Always update the last cooked date
      lastCookedDates[recipeName] = currentDate.toISOString();

      // Only increment cook count if it wasn't cooked within 3 days
      if (!wasRecentlyCooked) {
        await incrementCookCount(recipeName);
        console.log(`Cook count incremented for ${recipeName}`);
      } else {
        console.log(`Recipe ${recipeName} was cooked recently, only updating date`);
      }
    } else {
      // If uncooked, clear last cooked date but don't reset count
      delete lastCookedDates[recipeName];
    }
    await AsyncStorage.setItem(LAST_COOKED_DATES_KEY, JSON.stringify(lastCookedDates));

    // Writes here go directly to AsyncStorage (not through saveRecipes), so trigger
    // the background sync explicitly - exactly once for this action.
    triggerBackgroundSync();

    return cookedRecipes;
  } catch (error) {
    console.error('Error setting cooked status:', error);
    return {};
  }
};

export const getTutorialCount = async () => {
  try {
    const count = await AsyncStorage.getItem(TUTORIAL_COUNT_KEY);
    return count ? parseInt(count) : 0;
  } catch (error) {
    console.error('Error loading tutorial count:', error);
    return 0;
  }
};

export const incrementTutorialCount = async () => {
  try {
    const count = await getTutorialCount();
    const newCount = count + 1;
    await AsyncStorage.setItem(TUTORIAL_COUNT_KEY, newCount.toString());
    return newCount;
  } catch (error) {
    console.error('Error incrementing tutorial count:', error);
    return 0;
  }
};

export const getPinnedRecipes = async () => {
  try {
    const pinnedRecipes = await AsyncStorage.getItem(PINNED_RECIPES_KEY);
    return pinnedRecipes ? JSON.parse(pinnedRecipes) : [];
  } catch (error) {
    console.error('Error getting pinned recipes:', error);
    return [];
  }
};

// Track ongoing pin operations to prevent duplicates
const ongoingPinOperations = new Set();

export const togglePinnedRecipe = async (recipeName) => {
  try {
    // Prevent duplicate operations for the same recipe
    if (ongoingPinOperations.has(recipeName)) {
      const currentPinnedRecipes = await getPinnedRecipes();
      return currentPinnedRecipes;
    }

    // Mark this operation as ongoing
    ongoingPinOperations.add(recipeName);

    // Update data modification time for pinned status changes
    await updateDataModificationTime('togglePinnedRecipe');

    const currentPinnedRecipes = await getPinnedRecipes();
    const updatedPinnedRecipes = currentPinnedRecipes.includes(recipeName)
      ? currentPinnedRecipes.filter(name => name !== recipeName)
      : [...currentPinnedRecipes, recipeName];

    await AsyncStorage.setItem(PINNED_RECIPES_KEY, JSON.stringify(updatedPinnedRecipes));

    // Writes here go directly to AsyncStorage (not through saveRecipes), so trigger
    // the background sync explicitly - exactly once for this action.
    triggerBackgroundSync();

    return updatedPinnedRecipes;
  } catch (error) {
    console.error('Error toggling pinned recipe:', error);
    return [];
  } finally {
    // Always remove from ongoing operations
    ongoingPinOperations.delete(recipeName);
  }
};

// Excel-specific storage functions
export const exportToExcel = async () => {
  try {
    const { excelService } = await importServices();
    if (excelService) {
      const result = await excelService.createLocalExcelFile();
      if (result) {
        // Record successful export
        await AsyncStorage.setItem(LAST_EXCEL_SYNC_KEY, new Date().toISOString());
        return { success: true, message: 'Excel file created successfully' };
      } else {
        throw new Error('Failed to create Excel file');
      }
    } else {
      throw new Error('Excel service not available');
    }
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
};

export const importFromExcel = async () => {
  try {
    const { excelService } = await importServices();
    if (excelService) {
      const result = await excelService.importFromExcel();
      if (result) {
        // Record successful import
        await AsyncStorage.setItem(LAST_EXCEL_SYNC_KEY, new Date().toISOString());
        return { success: true, message: 'Excel file imported successfully', data: result };
      } else {
        throw new Error('Failed to import Excel file');
      }
    } else {
      throw new Error('Excel service not available');
    }
  } catch (error) {
    console.error('Error importing from Excel:', error);
    throw error;
  }
};

export const syncWithExcel = async () => {
  try {
    const { excelService } = await importServices();
    if (excelService) {
      // Update local Excel with current data
      const updateResult = await excelService.createLocalExcelFile();
      if (updateResult) {
        // Upload to Drive
        const uploadResult = await excelService.uploadToDrive();
        if (uploadResult) {
          // Record successful sync
          await AsyncStorage.setItem(LAST_EXCEL_SYNC_KEY, new Date().toISOString());
          return { success: true, message: 'Excel sync completed successfully' };
        } else {
          throw new Error('Upload failed');
        }
      } else {
        throw new Error('Update failed');
      }
    } else {
      throw new Error('Excel service not available');
    }
  } catch (error) {
    console.error('Error syncing with Excel:', error);
    throw error;
  }
};

export const getExcelFileInfo = async () => {
  try {
    const { excelService } = await importServices();
    if (excelService) {
      return await excelService.getLocalFileInfo();
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting Excel file info:', error);
    return null;
  }
};

export const checkExcelConflicts = async () => {
  try {
    const { excelService } = await importServices();
    if (excelService) {
      return await excelService.checkConflicts();
    } else {
      return { hasConflict: false, message: 'Excel service not available' };
    }
  } catch (error) {
    console.error('Error checking Excel conflicts:', error);
    return { hasConflict: false, message: error.message };
  }
};

export const resolveExcelConflict = async (resolution) => {
  try {
    const { excelService } = await importServices();
    if (excelService) {
      const result = await excelService.resolveConflict(resolution);
      if (result) {
        // Record successful conflict resolution
        await AsyncStorage.setItem(LAST_EXCEL_SYNC_KEY, new Date().toISOString());
      }
      return { success: true, message: 'Conflict resolved successfully' };
    } else {
      throw new Error('Excel service not available');
    }
  } catch (error) {
    console.error('Error resolving Excel conflict:', error);
    throw error;
  }
};

// Clean up stale references in pinned and cooked recipes
export const cleanupStaleReferences = async () => {
  try {
    const recipes = await loadRecipes();
    const cookedRecipes = await getCookedRecipes();
    const pinnedRecipes = await getPinnedRecipes();
    const lastCookedDates = await getLastCookedDates();
    const cookCounts = await getCookCounts();

    // Clean up cooked recipes that reference non-existent recipes
    const validRecipeNames = new Set(recipes.map(recipe => recipe.name));
    const cleanedCookedRecipes = {};
    let cookedRecipesChanged = false;

    for (const [recipeName, cookedData] of Object.entries(cookedRecipes)) {
      if (validRecipeNames.has(recipeName)) {
        cleanedCookedRecipes[recipeName] = cookedData;
      } else {
        cookedRecipesChanged = true;
      }
    }

    if (cookedRecipesChanged) {
      await AsyncStorage.setItem(COOKED_RECIPES_KEY, JSON.stringify(cleanedCookedRecipes));
    }

    // Clean up last cooked dates that reference non-existent recipes
    const cleanedLastCookedDates = {};
    let lastCookedDatesChanged = false;
    for (const [recipeName, cookedDate] of Object.entries(lastCookedDates)) {
      if (validRecipeNames.has(recipeName)) {
        cleanedLastCookedDates[recipeName] = cookedDate;
      } else {
        lastCookedDatesChanged = true;
      }
    }
    if (lastCookedDatesChanged) {
      await AsyncStorage.setItem(LAST_COOKED_DATES_KEY, JSON.stringify(cleanedLastCookedDates));
    }

    // Clean up cook counts that reference non-existent recipes
    const cleanedCookCounts = {};
    let cookCountsChanged = false;
    for (const [recipeName, count] of Object.entries(cookCounts)) {
      if (validRecipeNames.has(recipeName)) {
        cleanedCookCounts[recipeName] = count;
      } else {
        cookCountsChanged = true;
      }
    }
    if (cookCountsChanged) {
      await AsyncStorage.setItem(COOK_COUNTS_KEY, JSON.stringify(cleanedCookCounts));
    }

    // Clean up pinned recipes that reference non-existent recipes
    const cleanedPinnedRecipes = pinnedRecipes.filter(name => validRecipeNames.has(name));
    if (cleanedPinnedRecipes.length !== pinnedRecipes.length) {
      await AsyncStorage.setItem(PINNED_RECIPES_KEY, JSON.stringify(cleanedPinnedRecipes));
    }

    // Drop any local image files that no current recipe references (e.g. left behind
    // by a recipe delete that happened before this cleanup ran). Best-effort/non-fatal.
    try {
      const { recipeImageService } = await importServices();
      if (recipeImageService?.cleanupOrphanedFiles) {
        await recipeImageService.cleanupOrphanedFiles(recipes);
      }
    } catch (error) {
      console.warn('Error cleaning up orphaned recipe images:', error);
    }

    // Return cleaned data if any changes were made
    if (cookedRecipesChanged || lastCookedDatesChanged || cookCountsChanged || cleanedPinnedRecipes.length !== pinnedRecipes.length) {
      console.log('Stale references found and cleaned up');
      // Writes here go directly to AsyncStorage (not through saveRecipes), so trigger
      // the background sync explicitly - exactly once, and only when something changed.
      triggerBackgroundSync();
      return {
        cookedRecipes: cleanedCookedRecipes,
        pinnedRecipes: cleanedPinnedRecipes,
        lastCookedDates: cleanedLastCookedDates,
        cookCounts: cleanedCookCounts,
      };
    }

    return {
      cookedRecipes: cleanedCookedRecipes,
      pinnedRecipes: cleanedPinnedRecipes,
      lastCookedDates: cleanedLastCookedDates,
    };
  } catch (error) {
    console.error('Error cleaning up stale references:', error);
    return null;
  }
};

export const addSampleRecipes = async () => {
  try {
    const sampleRecipes = [
      {
        name: 'Classic Margherita Pizza',
        url: 'https://www.allrecipes.com/recipe/240376/homemade-margherita-pizza/',
        comment: 'Perfect for a quick dinner. Try adding fresh basil leaves after baking.'
      },
      {
        name: 'Chicken Tikka Masala',
        url: 'https://www.allrecipes.com/recipe/239867/authentic-chicken-tikka-masala/',
        comment: 'Serve with basmati rice and naan bread.'
      },
      {
        name: 'Beef Bourguignon',
        url: 'https://www.allrecipes.com/recipe/228654/classic-beef-bourguignon/',
        comment: 'Best made a day ahead. Serve with crusty bread.'
      },
      {
        name: 'Vegetable Stir Fry',
        url: 'https://www.allrecipes.com/recipe/24074/quick-and-easy-vegetable-stir-fry/',
        comment: 'Use any vegetables you have on hand.'
      },
      {
        name: 'Chocolate Chip Cookies',
        url: 'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/',
        comment: 'Add a pinch of sea salt on top before baking.'
      },
      {
        name: 'Greek Salad',
        url: 'https://www.allrecipes.com/recipe/214931/authentic-greek-salad/',
        comment: 'Use high-quality feta cheese for best results.'
      },
      {
        name: 'Pad Thai',
        url: 'https://www.allrecipes.com/recipe/42968/pad-thai/',
        comment: 'Don\'t skip the peanuts and lime!'
      },
      {
        name: 'Beef Tacos',
        url: 'https://www.allrecipes.com/recipe/239023/authentic-beef-tacos/',
        comment: 'Serve with fresh salsa and guacamole.'
      },
      {
        name: 'Vegetable Soup',
        url: 'https://www.allrecipes.com/recipe/12982/vegetable-soup/',
        comment: 'Freezes well. Add pasta just before serving.'
      },
      {
        name: 'Chicken Curry',
        url: 'https://www.allrecipes.com/recipe/212721/indian-chicken-curry-murgh-kari/',
        comment: 'Adjust spice level to taste.'
      },
      {
        name: 'Pasta Carbonara',
        url: 'https://www.allrecipes.com/recipe/245775/spaghetti-alla-carbonara/',
        comment: 'Use fresh eggs and good quality pancetta.'
      },
      {
        name: 'Fish and Chips',
        url: 'https://www.allrecipes.com/recipe/254365/fish-and-chips/',
        comment: 'Serve with malt vinegar and tartar sauce.'
      },
      {
        name: 'Chocolate Cake',
        url: 'https://www.allrecipes.com/recipe/17981/one-bowl-chocolate-cake-iii/',
        comment: 'Top with ganache for extra richness.'
      },
      {
        name: 'Caesar Salad',
        url: 'https://www.allrecipes.com/recipe/229064/classic-caesar-salad/',
        comment: 'Make your own croutons for best results.'
      },
      {
        name: 'Beef Stew',
        url: 'https://www.allrecipes.com/recipe/14685/slow-cooker-beef-stew-i/',
        comment: 'Perfect for cold winter days.'
      },
      {
        name: 'Shrimp Scampi',
        url: 'https://www.allrecipes.com/recipe/229960/shrimp-scampi-with-pasta/',
        comment: 'Use fresh garlic and parsley.'
      },
      {
        name: 'Apple Pie',
        url: 'https://www.allrecipes.com/recipe/12682/apple-pie-by-grandma-ople/',
        comment: 'Serve warm with vanilla ice cream.'
      },
      {
        name: 'Chicken Noodle Soup',
        url: 'https://www.allrecipes.com/recipe/26460/quick-and-easy-chicken-noodle-soup/',
        comment: 'Add fresh herbs at the end.'
      },
      {
        name: 'Beef Stir Fry',
        url: 'https://www.allrecipes.com/recipe/228823/quick-beef-stir-fry/',
        comment: 'Slice beef thinly against the grain.'
      },
      {
        name: 'Chocolate Mousse',
        url: 'https://www.allrecipes.com/recipe/25678/chocolate-mousse/',
        comment: 'Chill for at least 2 hours before serving.'
      }
    ];

    const recipes = await loadRecipes();

    // Add sample recipes with proper structure
    for (const sampleRecipe of sampleRecipes) {
      const newRecipe = {
        ...sampleRecipe,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        cooked: false,
      };
      recipes.push(newRecipe);
    }

    // saveRecipes() already schedules a background sync; no separate trigger needed here.
    await saveRecipes(recipes);

    return recipes;
  } catch (error) {
    console.error('Error adding sample recipes:', error);
    throw error;
  }
};

// Initialize Excel sync on first load
export const initializeExcelSync = async () => {
  try {
    // Check if Excel sync is already initialized
    const excelSyncEnabled = await AsyncStorage.getItem(EXCEL_SYNC_ENABLED_KEY);
    if (excelSyncEnabled === null) {
      // First time setup - enable Excel sync by default
      await enableExcelSync();
      console.log('Excel sync initialized and enabled by default');
    }
  } catch (error) {
    console.error('Error initializing Excel sync:', error);
  }
};

export const getCookCounts = async () => {
  try {
    const cookCounts = await AsyncStorage.getItem(COOK_COUNTS_KEY);
    return cookCounts ? JSON.parse(cookCounts) : {};
  } catch (error) {
    console.error('Error loading cook counts:', error);
    return {};
  }
};

export const incrementCookCount = async (recipeName) => {
  try {
    const cookCounts = await getCookCounts();
    cookCounts[recipeName] = (cookCounts[recipeName] || 0) + 1;
    await AsyncStorage.setItem(COOK_COUNTS_KEY, JSON.stringify(cookCounts));
    return cookCounts[recipeName];
  } catch (error) {
    console.error('Error incrementing cook count:', error);
    return 0;
  }
};

export const getRecipeCookCount = async (recipeName) => {
  try {
    const cookCounts = await getCookCounts();
    return cookCounts[recipeName] || 0;
  } catch (error) {
    console.error('Error getting recipe cook count:', error);
    return 0;
  }
};

export const resetCookCount = async (recipeName) => {
  try {
    const cookCounts = await getCookCounts();
    cookCounts[recipeName] = 0;
    await AsyncStorage.setItem(COOK_COUNTS_KEY, JSON.stringify(cookCounts));
    return cookCounts[recipeName];
  } catch (error) {
    console.error('Error resetting cook count:', error);
    return 0;
  }
};

export const getCookedRecipesWithinThreeDays = async () => {
  try {
    const lastCookedDates = await getLastCookedDates();
    const cookCounts = await getCookCounts();
    const recipes = await loadRecipes();

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const cookedRecipesWithinThreeDays = [];

    for (const recipe of recipes) {
      const recipeName = recipe.name;
      const lastCookedDate = lastCookedDates[recipeName];
      const cookCount = cookCounts[recipeName];

      if (lastCookedDate && new Date(lastCookedDate) >= threeDaysAgo) {
        cookedRecipesWithinThreeDays.push({
          name: recipeName,
          lastCooked: lastCookedDate,
          cookCount: cookCount,
        });
      }
    }

    return cookedRecipesWithinThreeDays;
  } catch (error) {
    console.error('Error getting cooked recipes within three days:', error);
    return [];
  }
};
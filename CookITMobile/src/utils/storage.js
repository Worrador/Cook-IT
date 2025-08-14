import AsyncStorage from '@react-native-async-storage/async-storage';

const RECIPES_KEY = '@cookit_recipes';
const COOKED_RECIPES_KEY = '@cookit_cooked_recipes';
const TUTORIAL_COUNT_KEY = '@cookit_tutorial_count';
const PINNED_RECIPES_KEY = '@cookit_pinned_recipes';

// Import sync service
let syncService = null;
const importSyncService = async () => {
  if (!syncService) {
    try {
      const module = await import('../services/syncService');
      syncService = module.default;
    } catch (error) {
      console.warn('SyncService not available:', error);
    }
  }
  return syncService;
};

// Helper function to trigger sync after data changes
let syncTimeout = null;
let lastSyncError = null;
const SYNC_ERROR_COOLDOWN = 30000; // 30 seconds cooldown after sync errors

const triggerSync = async () => {
  try {
    // Check if we're in a cooldown period due to recent sync errors
    if (lastSyncError && (Date.now() - lastSyncError) < SYNC_ERROR_COOLDOWN) {
      return;
    }

    // Clear any existing timeout to prevent multiple rapid sync calls
    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }

    // Debounce sync calls to prevent rapid successive calls
    syncTimeout = setTimeout(async () => {
      try {
        const sync = await importSyncService();
        if (sync) {
          // Use quickSync for immediate updates without full merge logic
          const result = await sync.quickSync();
          if (!result.success) {
            // Record sync error and start cooldown
            lastSyncError = Date.now();
            console.warn('Background sync failed:', result.message);
          } else {
            // Clear error state on successful sync
            lastSyncError = null;
          }
        }
      } catch (error) {
        // Record sync error and start cooldown
        lastSyncError = Date.now();
        console.warn('Failed to trigger sync:', error);
      } finally {
        syncTimeout = null;
      }
    }, 1000); // Wait 1 second before actually triggering sync
  } catch (error) {
    console.warn('Failed to trigger sync:', error);
  }
};

export const saveRecipes = async (recipes) => {
  try {
    await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
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
      cooked: false,
    };
    recipes.push(newRecipe);
    await saveRecipes(recipes);

    // Trigger sync after adding recipe
    triggerSync();

    return recipes;
  } catch (error) {
    console.error('Error adding recipe:', error);
    return [];
  }
};

export const deleteRecipe = async (recipeName) => {
  try {
    const recipes = await loadRecipes();
    const updatedRecipes = recipes.filter(recipe => recipe.name !== recipeName);
    await saveRecipes(updatedRecipes);

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

    // Trigger sync after deleting recipe
    triggerSync();

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
    await saveRecipes(updatedRecipes);

    // Trigger sync after updating recipe
    triggerSync();

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

export const setCookedStatus = async (recipeName, isCooked) => {
  try {
    const cookedRecipes = await getCookedRecipes();
    cookedRecipes[recipeName] = isCooked;
    await AsyncStorage.setItem(COOKED_RECIPES_KEY, JSON.stringify(cookedRecipes));

    // Trigger sync after changing cooked status
    triggerSync();

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

    const currentPinnedRecipes = await getPinnedRecipes();
    const updatedPinnedRecipes = currentPinnedRecipes.includes(recipeName)
      ? currentPinnedRecipes.filter(name => name !== recipeName)
      : [...currentPinnedRecipes, recipeName];

    await AsyncStorage.setItem(PINNED_RECIPES_KEY, JSON.stringify(updatedPinnedRecipes));

    // Trigger sync after toggling pin status
    triggerSync();

    return updatedPinnedRecipes;
  } catch (error) {
    console.error('Error toggling pinned recipe:', error);
    return [];
  } finally {
    // Always remove from ongoing operations
    ongoingPinOperations.delete(recipeName);
  }
};

// Clean up stale references in pinned and cooked recipes
export const cleanupStaleReferences = async () => {
  try {
    const recipes = await loadRecipes();
    const cookedRecipes = await getCookedRecipes();
    const pinnedRecipes = await getPinnedRecipes();

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

    // Clean up pinned recipes that reference non-existent recipes
    const cleanedPinnedRecipes = pinnedRecipes.filter(name => validRecipeNames.has(name));
    if (cleanedPinnedRecipes.length !== pinnedRecipes.length) {
      await AsyncStorage.setItem(PINNED_RECIPES_KEY, JSON.stringify(cleanedPinnedRecipes));
    }

    return {
      cookedRecipes: cleanedCookedRecipes,
      pinnedRecipes: cleanedPinnedRecipes,
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
        cooked: false,
      };
      recipes.push(newRecipe);
    }

    await saveRecipes(recipes);

    // Trigger sync after adding sample recipes
    triggerSync();

    return recipes;
  } catch (error) {
    console.error('Error adding sample recipes:', error);
    throw error;
  }
};
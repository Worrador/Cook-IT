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
const triggerSync = async () => {
  try {
    const sync = await importSyncService();
    if (sync) {
      // Use quickSync for immediate updates without full merge logic
      sync.quickSync().catch(error => {
        console.warn('Background sync failed:', error);
      });
    }
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

export const togglePinnedRecipe = async (recipeName) => {
  try {
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
  }
};

// Clean up stale references in pinned and cooked recipes
export const cleanupStaleReferences = async () => {
  try {
    const recipes = await loadRecipes();
    const validRecipeNames = new Set(recipes.map(recipe => recipe.name));

    // Clean up pinned recipes
    const pinnedRecipes = await getPinnedRecipes();
    const validPinnedRecipes = pinnedRecipes.filter(name => validRecipeNames.has(name));
    if (validPinnedRecipes.length !== pinnedRecipes.length) {
      await AsyncStorage.setItem(PINNED_RECIPES_KEY, JSON.stringify(validPinnedRecipes));
    }

    // Clean up cooked recipes
    const cookedRecipes = await getCookedRecipes();
    const validCookedRecipes = {};
    let cookedRecipesChanged = false;

    for (const [recipeName, isCooked] of Object.entries(cookedRecipes)) {
      if (validRecipeNames.has(recipeName)) {
        validCookedRecipes[recipeName] = isCooked;
      } else {
        cookedRecipesChanged = true;
      }
    }

    if (cookedRecipesChanged) {
      await AsyncStorage.setItem(COOKED_RECIPES_KEY, JSON.stringify(validCookedRecipes));
    }

    return {
      pinnedRecipes: validPinnedRecipes,
      cookedRecipes: validCookedRecipes
    };
  } catch (error) {
    console.error('Error cleaning up stale references:', error);
    return null;
  }
};
// Behaviour tests for stable recipe ids.
//
// The point of the id is that a recipe keeps its identity across a rename. Under
// the old name-as-key scheme, renaming was indistinguishable from deleting one
// recipe and adding a different one, so its timestamps and images were silently
// lost on the next sync. These tests pin that.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async key => (store.has(key) ? store.get(key) : null)),
      setItem: jest.fn(async (key, value) => { store.set(key, value); }),
      removeItem: jest.fn(async key => { store.delete(key); }),
      __store: store,
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRecipes, addRecipe, generateRecipeId } from '../../utils/storage';

const RECIPES_KEY = '@cookit_recipes';

beforeEach(() => {
  AsyncStorage.__store.clear();
  jest.clearAllMocks();
});

describe('generateRecipeId', () => {
  test('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 200 }, generateRecipeId));
    expect(ids.size).toBe(200);
  });
});

describe('loadRecipes backfill', () => {
  test('assigns ids to recipes stored before ids existed', async () => {
    await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify([
      { name: 'Legacy One' },
      { name: 'Legacy Two' },
    ]));

    const recipes = await loadRecipes();
    expect(recipes.every(r => typeof r.id === 'string' && r.id.length > 0)).toBe(true);
    expect(recipes[0].id).not.toBe(recipes[1].id);
  });

  test('backfilled ids are persisted, so they are stable across reads', async () => {
    await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify([{ name: 'Legacy' }]));

    const first = await loadRecipes();
    const second = await loadRecipes();

    // Regenerating per read would defeat the entire purpose of an id.
    expect(second[0].id).toBe(first[0].id);
  });

  test('does not rewrite storage when every recipe already has an id', async () => {
    await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify([{ name: 'Has Id', id: 'r_fixed' }]));
    AsyncStorage.setItem.mockClear();

    const recipes = await loadRecipes();

    expect(recipes[0].id).toBe('r_fixed');
    // A write here would be a pointless sync-triggering no-op on every load.
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('an existing id is never reassigned', async () => {
    await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify([
      { name: 'Keeps', id: 'r_keep' },
      { name: 'Needs One' },
    ]));

    const recipes = await loadRecipes();
    expect(recipes.find(r => r.name === 'Keeps').id).toBe('r_keep');
    expect(recipes.find(r => r.name === 'Needs One').id).toBeTruthy();
  });
});

describe('addRecipe', () => {
  test('gives a new recipe an id', async () => {
    await addRecipe({ name: 'Fresh', url: '', comment: '' });
    const recipes = await loadRecipes();
    expect(recipes[0].id).toBeTruthy();
  });

  test('preserves an id supplied by the caller rather than minting a second one', async () => {
    // An import already knows the recipe's identity; overwriting it would split
    // one recipe into two across devices.
    await addRecipe({ name: 'Imported', id: 'r_from_import' });
    const recipes = await loadRecipes();
    expect(recipes[0].id).toBe('r_from_import');
  });

  test('two recipes added with the same name still get distinct ids', async () => {
    await addRecipe({ name: 'Duplicate' });
    await addRecipe({ name: 'Duplicate' });
    const recipes = await loadRecipes();
    expect(recipes).toHaveLength(2);
    expect(recipes[0].id).not.toBe(recipes[1].id);
  });
});

// Shopping list built from parsed recipe ingredients.
//
// The app's own help text has always promised a shopping list ("By first
// clicking 'I will Cook IT!' you get the chance to create your shopping list"),
// but nothing implemented one. Now that ingredients are parsed from the linked
// page and can be scaled to a serving count, the pieces exist.
//
// Stored locally: a shopping list is ephemeral and device-shaped (you take your
// own phone to the shop), so it deliberately does not go through the Drive
// workbook sync.
import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOPPING_LIST_KEY = '@cookit_shopping_list';

/**
 * @typedef {{ id: string, text: string, recipe: string, checked: boolean }} ShoppingItem
 */

export async function getShoppingList() {
  try {
    const raw = await AsyncStorage.getItem(SHOPPING_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Error loading shopping list:', error);
    return [];
  }
}

async function save(items) {
  await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(items));
  return items;
}

/**
 * Append a recipe's ingredients.
 *
 * Duplicates from the SAME recipe are skipped so adding twice doesn't double the
 * list, but an identical line from a DIFFERENT recipe is kept: two recipes each
 * needing "2 onions" really do need four, and silently merging them would send
 * someone home short. Combining quantities across recipes would need unit-aware
 * arithmetic ("1 cup" + "200 g"), which is not worth guessing at.
 */
export async function addRecipeToList(recipeName, ingredients) {
  const existing = await getShoppingList();
  const alreadyFromThisRecipe = new Set(
    existing.filter(item => item.recipe === recipeName).map(item => item.text)
  );

  const additions = (ingredients || [])
    .filter(text => text && !alreadyFromThisRecipe.has(text))
    .map((text, index) => ({
      id: `${Date.now().toString(36)}_${index}`,
      text,
      recipe: recipeName,
      checked: false,
    }));

  return save([...existing, ...additions]);
}

export async function toggleItem(id) {
  const items = await getShoppingList();
  return save(items.map(item => (item.id === id ? { ...item, checked: !item.checked } : item)));
}

export async function removeItem(id) {
  const items = await getShoppingList();
  return save(items.filter(item => item.id !== id));
}

/** Clear only the ticked items - the usual "tidy up after shopping" action. */
export async function clearChecked() {
  const items = await getShoppingList();
  return save(items.filter(item => !item.checked));
}

export async function clearAll() {
  return save([]);
}

/** Group items by the recipe they came from, for display. */
export function groupByRecipe(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.recipe)) groups.set(item.recipe, []);
    groups.get(item.recipe).push(item);
  }
  return [...groups.entries()].map(([recipe, list]) => ({ recipe, items: list }));
}

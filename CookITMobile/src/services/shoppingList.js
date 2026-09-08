// Shopping list built from parsed recipe ingredients.
//
// Shared between devices through the same Drive workbook the recipes use, so
// two people shopping from one list see the same list. Each item carries a
// device-unique id and an updatedAt stamp, and merging is last-write-wins per
// item (see mergeShoppingLists).
//
// Deleting leaves a tombstone rather than dropping the row. Merging is a union,
// so a removed item that still exists in the other device's copy would simply
// come back - a list that refuses to let you cross anything off. Tombstones are
// pruned once they are older than any plausible sync round trip.
import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOPPING_LIST_KEY = '@cookit_shopping_list';

// Long enough that a device left off for a few weeks still learns about a
// deletion, short enough that the list does not accumulate junk forever.
const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * @typedef {{ id: string, text: string, recipe: string, checked: boolean,
 *             updatedAt: string, deleted?: boolean }} ShoppingItem
 */

// Random suffix, not just a counter: two phones adding items in the same
// millisecond would otherwise mint the same id and the merge would treat two
// different ingredients as one.
export const generateItemId = () =>
  `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const isExpiredTombstone = (item, now) =>
  item.deleted && now - new Date(item.updatedAt || 0).getTime() > TOMBSTONE_TTL_MS;

/** Everything the user should see: tombstones are bookkeeping, not list items. */
const live = items => items.filter(item => !item.deleted);

/**
 * Read every entry, tombstones included. Items stored before ids and timestamps
 * existed are backfilled here so the merge has something to key on.
 */
export async function getAllEntries() {
  try {
    const raw = await AsyncStorage.getItem(SHOPPING_LIST_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const now = Date.now();

    let changed = false;
    const items = stored
      .filter(item => !isExpiredTombstone(item, now))
      .map(item => {
        if (item.id && item.updatedAt) return item;
        changed = true;
        return {
          ...item,
          id: item.id || generateItemId(),
          // Epoch, not now: an item that predates stamping must lose to any
          // genuine edit from the other device rather than beating it.
          updatedAt: item.updatedAt || new Date(0).toISOString(),
        };
      });

    if (changed || items.length !== stored.length) {
      await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(items));
    }
    return items;
  } catch (error) {
    console.error('Error loading shopping list:', error);
    return [];
  }
}

export async function getShoppingList() {
  return live(await getAllEntries());
}

async function writeAll(items) {
  await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(items));
  return live(items);
}

/** Replace the stored list wholesale. Used by the sync merge. */
export async function setShoppingList(items) {
  return writeAll(items);
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
  const existing = await getAllEntries();
  // Only live items count as duplicates: something deleted earlier should be
  // addable again.
  const alreadyFromThisRecipe = new Set(
    live(existing).filter(item => item.recipe === recipeName).map(item => item.text)
  );

  const now = new Date().toISOString();
  const additions = (ingredients || [])
    .filter(text => text && !alreadyFromThisRecipe.has(text))
    .map(text => ({
      id: generateItemId(),
      text,
      recipe: recipeName,
      checked: false,
      updatedAt: now,
    }));

  return writeAll([...existing, ...additions]);
}

export async function toggleItem(id) {
  const items = await getAllEntries();
  return writeAll(items.map(item => (
    item.id === id
      ? { ...item, checked: !item.checked, updatedAt: new Date().toISOString() }
      : item
  )));
}

export async function removeItem(id) {
  const items = await getAllEntries();
  return writeAll(items.map(item => (
    item.id === id
      ? { ...item, deleted: true, updatedAt: new Date().toISOString() }
      : item
  )));
}

/** Clear only the ticked items - the usual "tidy up after shopping" action. */
export async function clearChecked() {
  const now = new Date().toISOString();
  const items = await getAllEntries();
  return writeAll(items.map(item => (
    !item.deleted && item.checked ? { ...item, deleted: true, updatedAt: now } : item
  )));
}

export async function clearAll() {
  const now = new Date().toISOString();
  const items = await getAllEntries();
  return writeAll(items.map(item => (
    item.deleted ? item : { ...item, deleted: true, updatedAt: now }
  )));
}

/**
 * Combine two lists, keyed on item id, newest updatedAt winning.
 *
 * A tombstone beats a live item of the same age or older, so crossing something
 * off on one phone sticks rather than being undone by the other's stale copy.
 * Ties go to the tombstone for the same reason: the alternative is an item that
 * reappears every time you sync.
 *
 * @param {ShoppingItem[]} local
 * @param {ShoppingItem[]} remote
 * @returns {ShoppingItem[]} every entry, tombstones included
 */
export function mergeShoppingLists(local, remote) {
  const byId = new Map();

  for (const item of [...(local || []), ...(remote || [])]) {
    if (!item?.id) continue;
    const seen = byId.get(item.id);
    if (!seen) {
      byId.set(item.id, item);
      continue;
    }

    const seenAt = new Date(seen.updatedAt || 0).getTime();
    const itemAt = new Date(item.updatedAt || 0).getTime();

    if (itemAt > seenAt) byId.set(item.id, item);
    else if (itemAt === seenAt && item.deleted) byId.set(item.id, item);
  }

  const now = Date.now();
  return [...byId.values()].filter(item => !isExpiredTombstone(item, now));
}

/** Merge a remote list into the stored one and persist the result. */
export async function mergeShoppingList(remoteItems) {
  const merged = mergeShoppingLists(await getAllEntries(), remoteItems || []);
  await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(merged));
  return merged;
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

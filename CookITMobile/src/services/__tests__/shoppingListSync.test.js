// The shopping list is shared between devices, which makes deletion the hard
// part. Merging two lists is a union, and a union alone puts back every item
// the other device still holds - so crossing something off and clearing it
// would undo itself on the next sync. Tombstones are what stop that, and these
// tests pin down the cases where they have to win.

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
import {
  getShoppingList, getAllEntries, addRecipeToList, toggleItem,
  removeItem, clearChecked, mergeShoppingLists, mergeShoppingList, generateItemId,
} from '../shoppingList';

const KEY = '@cookit_shopping_list';

const item = (id, text, extra = {}) => ({
  id,
  text,
  recipe: 'Carbonara',
  checked: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const seed = async items => AsyncStorage.setItem(KEY, JSON.stringify(items));
const stored = async () => JSON.parse(await AsyncStorage.getItem(KEY));

beforeEach(() => {
  AsyncStorage.__store.clear();
  jest.clearAllMocks();
});

describe('mergeShoppingLists', () => {
  test('keeps items only one device has', () => {
    const merged = mergeShoppingLists([item('a', 'eggs')], [item('b', 'bacon')]);
    expect(merged.map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  test('the newer edit of the same item wins', () => {
    const merged = mergeShoppingLists(
      [item('a', 'eggs', { checked: false, updatedAt: '2026-01-01T00:00:00.000Z' })],
      [item('a', 'eggs', { checked: true, updatedAt: '2026-01-02T00:00:00.000Z' })]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].checked).toBe(true);
  });

  test('an older remote copy does not undo a local edit', () => {
    const merged = mergeShoppingLists(
      [item('a', 'eggs', { checked: true, updatedAt: '2026-01-05T00:00:00.000Z' })],
      [item('a', 'eggs', { checked: false, updatedAt: '2026-01-01T00:00:00.000Z' })]
    );
    expect(merged[0].checked).toBe(true);
  });

  test('a deletion is not resurrected by the other device still holding the item', () => {
    const merged = mergeShoppingLists(
      [item('a', 'eggs', { deleted: true, updatedAt: '2026-01-05T00:00:00.000Z' })],
      [item('a', 'eggs', { updatedAt: '2026-01-01T00:00:00.000Z' })]
    );
    expect(merged[0].deleted).toBe(true);
  });

  test('a tombstone wins a tie, so an item cannot come back every sync', () => {
    const same = '2026-01-05T00:00:00.000Z';
    const merged = mergeShoppingLists(
      [item('a', 'eggs', { updatedAt: same })],
      [item('a', 'eggs', { deleted: true, updatedAt: same })]
    );
    expect(merged[0].deleted).toBe(true);
  });

  test('re-adding after a deletion survives the merge', () => {
    const merged = mergeShoppingLists(
      [item('a', 'eggs', { deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' })],
      [item('a', 'eggs', { updatedAt: '2026-01-09T00:00:00.000Z' })]
    );
    expect(merged[0].deleted).toBeUndefined();
  });

  test('tombstones older than the retention window are dropped', () => {
    const ancient = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const merged = mergeShoppingLists(
      [item('a', 'eggs', { deleted: true, updatedAt: ancient })],
      []
    );
    expect(merged).toEqual([]);
  });

  test('rows without an id are skipped rather than merged into one another', () => {
    const merged = mergeShoppingLists([{ text: 'eggs' }, { text: 'bacon' }], []);
    expect(merged).toEqual([]);
  });
});

describe('stored list', () => {
  test('tombstones are hidden from the list but kept on disk', async () => {
    await seed([item('a', 'eggs'), item('b', 'bacon')]);

    await removeItem('a');

    expect((await getShoppingList()).map(i => i.id)).toEqual(['b']);
    expect((await getAllEntries()).map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  test('clearChecked tombstones the ticked items and leaves the rest', async () => {
    await seed([item('a', 'eggs', { checked: true }), item('b', 'bacon')]);

    const remaining = await clearChecked();

    expect(remaining.map(i => i.id)).toEqual(['b']);
    expect((await stored()).find(i => i.id === 'a').deleted).toBe(true);
  });

  test('toggling stamps the item so the other device can order the edits', async () => {
    await seed([item('a', 'eggs')]);

    await toggleItem('a');

    const [saved] = await stored();
    expect(saved.checked).toBe(true);
    expect(new Date(saved.updatedAt).getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00.000Z').getTime()
    );
  });

  test('ids minted in the same millisecond differ, so two phones cannot collide', () => {
    // Generated in a tight loop, which lands most of them on the same
    // millisecond - the case a counter-based id got wrong.
    const ids = Array.from({ length: 500 }, () => generateItemId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a deleted line can be added again', async () => {
    await seed([item('a', 'eggs', { deleted: true })]);

    const list = await addRecipeToList('Carbonara', ['eggs']);

    expect(list.map(i => i.text)).toEqual(['eggs']);
    expect(list[0].id).not.toBe('a');
  });

  test('adding the same line twice from one recipe does not duplicate it', async () => {
    await addRecipeToList('Carbonara', ['eggs']);
    const list = await addRecipeToList('Carbonara', ['eggs']);
    expect(list).toHaveLength(1);
  });

  test('the same line from a different recipe is kept, because you need both', async () => {
    await addRecipeToList('Carbonara', ['2 onions']);
    await addRecipeToList('Goulash', ['2 onions']);
    expect(await getShoppingList()).toHaveLength(2);
  });

  test('items stored before ids existed are backfilled and lose to any real edit', async () => {
    await seed([{ text: 'eggs', recipe: 'Carbonara', checked: false }]);

    const [backfilled] = await getAllEntries();

    expect(backfilled.id).toBeTruthy();
    expect(backfilled.updatedAt).toBe(new Date(0).toISOString());
  });

  test('mergeShoppingList persists the result', async () => {
    await seed([item('a', 'eggs')]);

    await mergeShoppingList([item('b', 'bacon')]);

    expect((await stored()).map(i => i.id).sort()).toEqual(['a', 'b']);
  });
});

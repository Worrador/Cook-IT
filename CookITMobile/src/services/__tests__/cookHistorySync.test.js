// Cook history is the one dataset in the app where last-writer-wins is wrong.
//
// Recipes, pins, and cooked-status are current *state* - a remote copy can
// legitimately replace them. Cooking events are immutable *facts*: two devices
// each hold a partial record of things that really happened. Overwriting one
// with the other deletes history that nobody asked to delete, and there is no
// way to get it back.

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
import { getCookHistory, setCookHistory, mergeCookHistory } from '../../utils/storage';

const event = (name, date, extra = {}) => ({ name, date, ...extra });

beforeEach(() => {
  AsyncStorage.__store.clear();
  jest.clearAllMocks();
});

describe('mergeCookHistory', () => {
  test('keeps events only one side has - the whole point', async () => {
    await setCookHistory([event('Soup', '2026-01-01T18:00:00.000Z')]);

    const merged = await mergeCookHistory([event('Curry', '2026-02-01T18:00:00.000Z')]);

    expect(merged.map(e => e.name).sort()).toEqual(['Curry', 'Soup']);
  });

  test('the same event synced twice stays one event', async () => {
    const when = '2026-01-01T18:00:00.000Z';
    await setCookHistory([event('Soup', when)]);

    const merged = await mergeCookHistory([event('Soup', when)]);

    expect(merged).toHaveLength(1);
  });

  test('the same recipe cooked at different times is two events', async () => {
    await setCookHistory([event('Soup', '2026-01-01T18:00:00.000Z')]);

    const merged = await mergeCookHistory([event('Soup', '2026-01-08T18:00:00.000Z')]);

    expect(merged).toHaveLength(2);
  });

  test('an observed entry beats a backfilled one for the same slot', async () => {
    const when = '2026-01-01T18:00:00.000Z';
    // Backfilled entries are reconstructions from the old single-date scheme,
    // not things the app actually saw happen.
    await setCookHistory([event('Soup', when, { backfilled: true })]);

    const merged = await mergeCookHistory([event('Soup', when)]);

    expect(merged).toHaveLength(1);
    expect(merged[0].backfilled).toBeUndefined();
  });

  test('result is sorted oldest first', async () => {
    await setCookHistory([event('Late', '2026-03-01T00:00:00.000Z')]);

    const merged = await mergeCookHistory([
      event('Early', '2026-01-01T00:00:00.000Z'),
      event('Middle', '2026-02-01T00:00:00.000Z'),
    ]);

    expect(merged.map(e => e.name)).toEqual(['Early', 'Middle', 'Late']);
  });

  test('malformed remote rows are skipped rather than poisoning the log', async () => {
    await setCookHistory([event('Good', '2026-01-01T00:00:00.000Z')]);

    const merged = await mergeCookHistory([
      { name: 'No Date' },
      { date: '2026-01-02T00:00:00.000Z' },
      null,
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Good');
  });

  test('merging an empty remote history preserves local history', async () => {
    await setCookHistory([event('Soup', '2026-01-01T00:00:00.000Z')]);

    expect(await mergeCookHistory([])).toHaveLength(1);
    expect(await mergeCookHistory(undefined)).toHaveLength(1);
  });

  test('setCookHistory marks the log as seeded so a later read does not backfill over it', async () => {
    // Without the seeded flag, getCookHistory would see a legitimately-empty
    // log and reconstruct entries from lastCookedDates on top of it.
    await setCookHistory([]);
    await AsyncStorage.setItem('@cookit_last_cooked_dates', JSON.stringify({ Ghost: '2026-01-01T00:00:00.000Z' }));

    expect(await getCookHistory()).toEqual([]);
  });
});

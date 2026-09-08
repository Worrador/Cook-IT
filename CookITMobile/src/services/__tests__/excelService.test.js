import * as XLSX from 'xlsx';

// --- Mocks for excelService.js's external dependencies ---------------------
// excelService.js imports expo-file-system / AsyncStorage / googleDriveService
// / storage.js unconditionally at module load time, and several of those pull
// in native modules that don't work under Jest's Node test environment. We
// mock each one with plain jest.fn() placeholders (no inline implementation,
// since jest.config.js sets `restoreMocks: true`, which would wipe an
// implementation attached inside the factory before the very first test
// runs) and configure behaviour in `beforeEach` instead.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn()
  }
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn()
}));

// excelService.js now goes through crossPlatformFileSystem.js, which imports
// `Platform` from 'react-native' to decide the web branch (see that file's
// header comment). The real 'react-native' package isn't safe to load under
// Jest's Node test environment, so it's mocked down to just the bit that
// module needs - 'ios' keeps these tests on the existing Expo-branch behavior.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

jest.mock('../googleDriveService', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    isAuthenticated: jest.fn(),
    getDriveFileId: jest.fn(),
    downloadFile: jest.fn(),
    updateFile: jest.fn(),
    createFile: jest.fn(),
    getFileInfo: jest.fn()
  }
}));

jest.mock('../../utils/storage', () => ({
  loadRecipes: jest.fn(),
  saveRecipes: jest.fn(),
  getPinnedRecipes: jest.fn(),
  getLastCookedDates: jest.fn(),
  setLastCookedDates: jest.fn(),
  // Deterministic so assertions can match on it; the real one is random.
  generateRecipeId: jest.fn(() => 'r_generated'),
  getCookHistory: jest.fn(async () => []),
  setCookHistory: jest.fn(async h => h),
  mergeCookHistory: jest.fn(async h => h || [])
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import googleDriveService from '../googleDriveService';
import {
  loadRecipes,
  saveRecipes,
  getPinnedRecipes,
  getLastCookedDates,
  setLastCookedDates
} from '../../utils/storage';
import excelService, { formatLocalDate, formatLocalDateTime } from '../excelService';

const FileSystem = require('expo-file-system');

// In-memory fake filesystem backing the mocked expo-file-system calls.
let fakeFiles;

const writeWorkbook = async (sheets) => {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  await FileSystem.writeAsStringAsync(excelService.localFilePath, base64);
};

const readWorkbookSheet = async (sheetName) => {
  const base64 = await FileSystem.readAsStringAsync(excelService.localFilePath);
  const workbook = XLSX.read(base64, { type: 'base64' });
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json(sheet) : undefined;
};

beforeEach(async () => {
  fakeFiles = new Map();

  FileSystem.writeAsStringAsync.mockImplementation(async (path, content) => {
    fakeFiles.set(path, content);
  });
  FileSystem.readAsStringAsync.mockImplementation(async (path) => {
    if (!fakeFiles.has(path)) {
      throw new Error(`ENOENT: no such file, open '${path}'`);
    }
    return fakeFiles.get(path);
  });
  FileSystem.getInfoAsync.mockImplementation(async (path) => {
    if (fakeFiles.has(path)) {
      return { exists: true, size: fakeFiles.get(path).length, modificationTime: Date.now() / 1000 };
    }
    return { exists: false };
  });
  FileSystem.deleteAsync.mockImplementation(async (path) => {
    fakeFiles.delete(path);
  });

  AsyncStorage.getItem.mockResolvedValue(null);
  AsyncStorage.setItem.mockResolvedValue(undefined);
  AsyncStorage.removeItem.mockResolvedValue(undefined);

  googleDriveService.initialize.mockResolvedValue(true);
  googleDriveService.isAuthenticated.mockReturnValue(false);

  loadRecipes.mockResolvedValue([]);
  saveRecipes.mockResolvedValue(true);
  getPinnedRecipes.mockResolvedValue([]);
  getLastCookedDates.mockResolvedValue({});
  setLastCookedDates.mockResolvedValue(true);

  await excelService.initialize();
});

describe('prepareExcelData (nine-column export schema)', () => {
  test('emits all nine columns in desktop order, with mobile-only columns appended last', () => {
    const cookedMs = new Date(2024, 0, 15, 9, 5, 3).getTime(); // Jan 15 2024, 09:05:03 local
    const recipes = [
      { name: 'Soup', url: 'http://example.com/soup', comment: 'Tasty' },
      { name: 'Salad', url: '', comment: '' }
    ];
    const lastCookedDates = { Soup: cookedMs };
    const pinnedRecipes = ['Soup'];

    const rows = excelService.prepareExcelData(recipes, lastCookedDates, pinnedRecipes);

    expect(rows).toHaveLength(2);
    // 'Images' is a mobile-only column appended LAST so it never shifts the
    // desktop-shared column indexes (see the hidden-'Pinned'-column comment
    // in createLocalExcelFile).
    // 'Id' is appended after 'Images' for the same reason 'Images' comes after
    // 'Pinned': mobile-only columns must never shift the desktop-shared indexes.
    expect(Object.keys(rows[0])).toEqual([
      'Recipe Name', 'URL', 'Comment', 'Last Shown', 'Last Cooked Date', 'Pinned',
      'Images', 'Id', 'Parsed'
    ]);

    const soupRow = rows.find(r => r['Recipe Name'] === 'Soup');
    expect(soupRow['Last Shown']).toBe('2024-01-15T09:05:03');
    expect(soupRow['Last Cooked Date']).toBe('2024-01-15');
    expect(soupRow['Pinned']).toBe('Yes');
    expect(soupRow['Images']).toBe('');

    const saladRow = rows.find(r => r['Recipe Name'] === 'Salad');
    expect(saladRow['Last Shown']).toBe('');
    expect(saladRow['Last Cooked Date']).toBe('');
    expect(saladRow['Pinned']).toBe('No');
    expect(saladRow['Images']).toBe('');
  });
});

describe('Images column round trip', () => {
  test('prepareExcelData writes only uploaded (Drive file id) images as a comma-separated list', () => {
    const recipes = [
      {
        name: 'Stew',
        images: [
          { id: 'a', localFile: '/local/a.jpg', driveFileId: 'drive-a' },
          { id: 'b', localFile: '/local/b.jpg', driveFileId: 'drive-b' },
          // Not yet uploaded - has no stable cross-device identity, so it
          // must NOT appear in the column.
          { id: 'c', localFile: '/local/c.jpg', driveFileId: null }
        ]
      },
      { name: 'No Photos' } // no `images` field at all
    ];

    const rows = excelService.prepareExcelData(recipes, {}, []);

    expect(rows.find(r => r['Recipe Name'] === 'Stew')['Images']).toBe('drive-a,drive-b');
    expect(rows.find(r => r['Recipe Name'] === 'No Photos')['Images']).toBe('');
  });

  test('parseExcelFile reconstructs images from Drive file ids, preserving already-known local paths', async () => {
    loadRecipes.mockResolvedValue([
      {
        name: 'Stew',
        images: [
          { id: 'a', localFile: '/local/a.jpg', driveFileId: 'drive-a' }, // already downloaded on this device
          { id: 'c', localFile: '/local/c.jpg', driveFileId: null } // local-only, never uploaded
        ]
      }
    ]);

    await writeWorkbook({
      Recipes: [
        {
          'Recipe Name': 'Stew', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No',
          // 'drive-a' is already known locally; 'drive-b' is new to this device.
          Images: 'drive-a,drive-b'
        }
      ]
    });

    const result = await excelService.parseExcelFile();
    const stew = result.recipes.find(r => r.name === 'Stew');

    // Known image keeps its local path (no unnecessary re-download).
    expect(stew.images).toContainEqual({ id: 'a', localFile: '/local/a.jpg', driveFileId: 'drive-a' });
    // Newly-seen Drive image has no local copy yet - ensureLocal() downloads
    // it lazily on first view.
    expect(stew.images).toContainEqual({ id: 'drive-b', localFile: null, driveFileId: 'drive-b' });
    // Local-only image (never uploaded) isn't in the Excel column at all, but
    // must survive the parse since it's the only place it's recorded.
    expect(stew.images).toContainEqual({ id: 'c', localFile: '/local/c.jpg', driveFileId: null });
    expect(stew.images).toHaveLength(3);
  });

  test('parseExcelFile gives a brand-new recipe fresh, local-file-less image refs', async () => {
    loadRecipes.mockResolvedValue([]); // nothing local yet

    await writeWorkbook({
      Recipes: [
        {
          'Recipe Name': 'Brand New', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No',
          Images: 'drive-x'
        }
      ]
    });

    const result = await excelService.parseExcelFile();
    const recipe = result.recipes.find(r => r.name === 'Brand New');

    expect(recipe.images).toEqual([{ id: 'drive-x', localFile: null, driveFileId: 'drive-x' }]);
  });

  test('an empty Images cell round-trips to an empty array, not a stray entry', async () => {
    loadRecipes.mockResolvedValue([]);

    await writeWorkbook({
      Recipes: [
        { 'Recipe Name': 'No Photos', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No', Images: '' }
      ]
    });

    const result = await excelService.parseExcelFile();
    expect(result.recipes.find(r => r.name === 'No Photos').images).toEqual([]);
  });
});

describe('formatLocalDate / formatLocalDateTime (Fix 5: local-timezone formatting)', () => {
  // Forcing the process into a specific IANA timezone (e.g. via
  // `process.env.TZ`) turned out to be unreliable under Jest on this
  // platform - Date's local-time conversion kept using the OS's actual
  // offset regardless of the env var, so a fixed-timestamp/fixed-timezone
  // assertion would be flaky across machines and CI runners. Instead, this
  // asserts the *implementation route* directly: the old, buggy code path
  // used `toISOString()` (UTC) to derive the date; the fix must use the
  // local getters (getFullYear/getMonth/getDate/...) instead. Spying on
  // both proves the regression can't silently come back regardless of what
  // timezone the test happens to run in.
  let isoSpy;
  let getFullYearSpy;
  let getMonthSpy;
  let getDateSpy;
  let getHoursSpy;

  beforeEach(() => {
    isoSpy = jest.spyOn(Date.prototype, 'toISOString');
    getFullYearSpy = jest.spyOn(Date.prototype, 'getFullYear');
    getMonthSpy = jest.spyOn(Date.prototype, 'getMonth');
    getDateSpy = jest.spyOn(Date.prototype, 'getDate');
    getHoursSpy = jest.spyOn(Date.prototype, 'getHours');
  });

  afterEach(() => {
    isoSpy.mockRestore();
    getFullYearSpy.mockRestore();
    getMonthSpy.mockRestore();
    getDateSpy.mockRestore();
    getHoursSpy.mockRestore();
  });

  test('formatLocalDate uses local date getters, never toISOString', () => {
    const reference = new Date(2024, 0, 15, 23, 30, 0); // Jan 15 2024, 23:30 local
    const ms = reference.getTime();

    const result = formatLocalDate(ms);

    expect(isoSpy).not.toHaveBeenCalled();
    expect(getFullYearSpy).toHaveBeenCalled();
    expect(getMonthSpy).toHaveBeenCalled();
    expect(getDateSpy).toHaveBeenCalled();

    const yyyy = reference.getFullYear();
    const mm = String(reference.getMonth() + 1).padStart(2, '0');
    const dd = String(reference.getDate()).padStart(2, '0');
    expect(result).toBe(`${yyyy}-${mm}-${dd}`);
    // Whatever the machine's timezone, the local calendar date of a
    // Date built from local (year, month, day, ...) components must be
    // that same day - this would fail if the implementation silently
    // fell back to a UTC-based calculation.
    expect(result).toBe('2024-01-15');
  });

  test('formatLocalDateTime uses local getters (including time-of-day), never toISOString', () => {
    const reference = new Date(2024, 0, 15, 23, 30, 5);
    const ms = reference.getTime();

    const result = formatLocalDateTime(ms);

    expect(isoSpy).not.toHaveBeenCalled();
    expect(getHoursSpy).toHaveBeenCalled();
    expect(result).toBe('2024-01-15T23:30:05');
  });

  test('returns empty string for falsy or invalid input', () => {
    expect(formatLocalDate(0)).toBe('');
    expect(formatLocalDate(null)).toBe('');
    expect(formatLocalDate(NaN)).toBe('');
    expect(formatLocalDateTime(undefined)).toBe('');
  });
});

describe('Pinned recipe deduplication (Fix 4)', () => {
  test('parseExcelFile dedupes a recipe pinned via both the Pinned column and the Pinned Recipes sheet', async () => {
    await writeWorkbook({
      Recipes: [
        { 'Recipe Name': 'Soup', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'Yes' },
        { 'Recipe Name': 'Salad', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No' }
      ],
      'Pinned Recipes': [{ 'Recipe Name': 'Soup' }]
    });

    const result = await excelService.parseExcelFile();

    expect(result.pinnedRecipes).toEqual(['Soup']);
  });

  test('createLocalExcelFile defensively dedupes before writing the Pinned Recipes sheet', async () => {
    loadRecipes.mockResolvedValue([{ name: 'Soup', url: '', comment: '' }]);
    getPinnedRecipes.mockResolvedValue(['Soup', 'Soup']); // duplicate from a bad prior round trip

    await excelService.createLocalExcelFile();

    const pinnedRows = await readWorkbookSheet('Pinned Recipes');
    expect(pinnedRows).toEqual([{ 'Recipe Name': 'Soup' }]);
  });
});

describe('Missing sheet handling (Fix 7)', () => {
  test('throws a clear error when the Recipes sheet is absent', async () => {
    await writeWorkbook({ SomeOtherSheet: [{ foo: 'bar' }] });

    await expect(excelService.parseExcelFile()).rejects.toThrow(/Recipes/);
    await expect(excelService.importFromExcel()).rejects.toThrow(/Recipes/);
  });

  test('tolerates a missing Pinned Recipes sheet as empty', async () => {
    await writeWorkbook({
      Recipes: [
        { 'Recipe Name': 'Soup', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No' }
      ]
    });

    const result = await excelService.parseExcelFile();

    expect(result.recipes).toHaveLength(1);
    expect(result.pinnedRecipes).toEqual([]);
  });
});

describe('Date-only round trip stability', () => {
  // 'Last Cooked Date' is WRITTEN from local date components, but JS parses a bare
  // 'YYYY-MM-DD' as UTC midnight. In a UTC-negative timezone that reads back as the
  // previous local day, so the date would drift one day earlier on every
  // export/import cycle. safeParseDate must treat date-only values as local midnight.
  test('safeParseDate reads a date-only value as local midnight, not UTC midnight', () => {
    const parsed = excelService.safeParseDate('2024-03-05', 'Last Cooked Date');

    expect(parsed.getFullYear()).toBe(2024);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(5);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getTime()).toBe(new Date(2024, 2, 5).getTime());
  });

  test('a cooked date survives repeated export/import cycles without drifting', async () => {
    let cooked = new Date(2024, 2, 5, 22, 30, 0).getTime();

    // Three full round trips: format for the sheet, then parse it back.
    for (let i = 0; i < 3; i++) {
      const [row] = excelService.prepareExcelData(
        [{ name: 'Stew' }],
        { Stew: cooked },
        []
      );
      expect(row['Last Cooked Date']).toBe('2024-03-05');
      cooked = excelService.safeParseDate(row['Last Cooked Date'], 'Last Cooked Date').getTime();
    }

    expect(formatLocalDate(cooked)).toBe('2024-03-05');
  });
});

describe('Timestamp preservation on import (Fix 3)', () => {
  test('preserves existing local timestamps and only stamps genuinely new recipes fresh', async () => {
    const existingIso = '2020-05-01T00:00:00.000Z';
    loadRecipes.mockResolvedValue([{ name: 'Soup', createdAt: existingIso, lastModified: existingIso }]);

    await writeWorkbook({
      Recipes: [
        { 'Recipe Name': 'Soup', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No' },
        { 'Recipe Name': 'New Recipe', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No' }
      ]
    });

    const result = await excelService.parseExcelFile();
    const soup = result.recipes.find(r => r.name === 'Soup');
    const freshRecipe = result.recipes.find(r => r.name === 'New Recipe');

    expect(soup.createdAt).toBe(existingIso);
    expect(soup.lastModified).toBe(existingIso);

    // New recipe gets a fresh ISO-string timestamp (not the old Date.now()
    // epoch number), consistent with storage.js's addRecipe/updateRecipe.
    expect(freshRecipe.createdAt).not.toBe(existingIso);
    expect(typeof freshRecipe.createdAt).toBe('string');
    expect(new Date(freshRecipe.createdAt).toString()).not.toBe('Invalid Date');
  });
});

describe('parseExcelFile vs importFromExcel side effects (Fix 6)', () => {
  test('parseExcelFile takes no arguments and never persists; importFromExcel persists', async () => {
    expect(excelService.parseExcelFile.length).toBe(0);

    // Pre-seed 'Soup' as an already-known local recipe so its timestamp is
    // preserved (Fix 3) rather than freshly stamped on every parse - this
    // keeps the two independent parseExcelFile() calls below (one direct,
    // one inside importFromExcel) byte-for-byte deterministic instead of
    // racing Date.now()/toISOString() against each other.
    const existingIso = '2020-01-01T00:00:00.000Z';
    loadRecipes.mockResolvedValue([{ name: 'Soup', createdAt: existingIso, lastModified: existingIso }]);

    await writeWorkbook({
      Recipes: [
        { 'Recipe Name': 'Soup', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No' }
      ]
    });

    const parsed = await excelService.parseExcelFile();
    expect(parsed).toEqual({
      recipes: expect.any(Array),
      cookHistory: expect.any(Array),
      lastCookedDates: expect.any(Object),
      pinnedRecipes: expect.any(Array),
      shoppingList: expect.any(Array)
    });
    expect(saveRecipes).not.toHaveBeenCalled();
    expect(setLastCookedDates).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('@cookit_pinned_recipes', expect.anything());

    const imported = await excelService.importFromExcel();
    expect(imported).toEqual(parsed);
    expect(saveRecipes).toHaveBeenCalledWith(parsed.recipes, true);
    expect(setLastCookedDates).toHaveBeenCalledWith(parsed.lastCookedDates);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@cookit_pinned_recipes', JSON.stringify(parsed.pinnedRecipes));
  });

  test('mergeWithLocalData reads remote data via parseExcelFile so local reads see genuine local data', async () => {
    loadRecipes.mockResolvedValue([{ name: 'Local Only', createdAt: '2024-01-01T00:00:00.000Z', lastModified: '2024-01-01T00:00:00.000Z' }]);
    getLastCookedDates.mockResolvedValue({});
    getPinnedRecipes.mockResolvedValue([]);

    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.getDriveFileId.mockResolvedValue('remote-file-id');
    googleDriveService.updateFile.mockResolvedValue(true);

    await writeWorkbook({
      Recipes: [
        { 'Recipe Name': 'Remote Only', URL: '', Comment: '', 'Last Shown': '', 'Last Cooked Date': '', Pinned: 'No' }
      ]
    });
    // downloadFromDrive() overwrites the local file with drive content; since
    // our fake drive download just re-reads what's already "local" here, the
    // written workbook above stands in for the downloaded remote content.
    googleDriveService.downloadFile.mockResolvedValue(await FileSystem.readAsStringAsync(excelService.localFilePath));

    const result = await excelService.mergeWithLocalData();

    // If mergeWithLocalData had used importFromExcel() for its remote read,
    // it would have clobbered local storage with remote data BEFORE the
    // `loadRecipes()` call a few lines later, and 'Local Only' would be lost.
    expect(result.recipes.map(r => r.name)).toEqual(expect.arrayContaining(['Local Only', 'Remote Only']));
  });
});


describe('Parsed column (cached recipe parse)', () => {
  test('serialises a parse and reads it back intact', async () => {
    const parsed = {
      ingredients: ['1 cup water', '2 eggs'],
      steps: ['Boil the water.', 'Add the eggs.'],
      totalTime: 'PT20M',
      servings: '4',
    };

    const rows = excelService.prepareExcelData(
      [{ name: 'Boiled Eggs', parsed }], {}, []
    );
    expect(rows[0].Parsed).toContain('1 cup water');

    loadRecipes.mockResolvedValue([]);
    await writeWorkbook({
      Recipes: [{
        'Recipe Name': 'Boiled Eggs', URL: '', Comment: '', 'Last Shown': '',
        'Last Cooked Date': '', Pinned: 'No', Parsed: rows[0].Parsed,
      }]
    });

    const result = await excelService.parseExcelFile();
    expect(result.recipes[0].parsed.ingredients).toEqual(['1 cup water', '2 eggs']);
    expect(result.recipes[0].parsed.steps).toHaveLength(2);
  });

  test('a recipe with no parse writes an empty cell rather than junk', () => {
    const rows = excelService.prepareExcelData([{ name: 'Plain' }], {}, []);
    expect(rows[0].Parsed).toBe('');
  });

  test('an empty remote cell does NOT wipe a parse this device already has', async () => {
    // The whole point of the cache: a device that cannot fetch a page (blocked
    // by the publisher) writes an empty cell. If that overwrote a parse another
    // device obtained, the two would erase each other's work forever.
    const existing = {
      name: 'Apple Pie',
      parsed: { ingredients: ['8 apples'], steps: ['Bake.'] },
    };
    loadRecipes.mockResolvedValue([existing]);

    await writeWorkbook({
      Recipes: [{
        'Recipe Name': 'Apple Pie', URL: '', Comment: '', 'Last Shown': '',
        'Last Cooked Date': '', Pinned: 'No', Parsed: '',
      }]
    });

    const result = await excelService.parseExcelFile();
    expect(result.recipes[0].parsed.ingredients).toEqual(['8 apples']);
  });

  test('a corrupt Parsed cell is ignored rather than throwing', async () => {
    loadRecipes.mockResolvedValue([]);
    await writeWorkbook({
      Recipes: [{
        'Recipe Name': 'Broken', URL: '', Comment: '', 'Last Shown': '',
        'Last Cooked Date': '', Pinned: 'No', Parsed: '{not valid json',
      }]
    });

    const result = await excelService.parseExcelFile();
    expect(result.recipes[0].parsed).toBeUndefined();
  });
});

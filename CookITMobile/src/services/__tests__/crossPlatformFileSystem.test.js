// Covers the platform-selection logic in crossPlatformFileSystem.js.
//
// This is the branch whose failure mode is silent: on web, require('expo-file-system')
// resolves (the package exists) but documentDirectory is null, so a naive isExpo
// check sends every file operation into the Expo branch where it quietly
// misbehaves instead of throwing. The whole point of the module is that `isWeb`
// is checked FIRST, and until now nothing tested that.
//
// Each block re-requires the module under a different mocked Platform, because
// the platform is read once when the singleton is constructed at import time.

// Names must begin with `mock`: jest.mock() factories are hoisted above these
// declarations, and babel-plugin-jest-hoist only permits out-of-scope references
// whose identifier starts with `mock`.
const mockWebFileSystem = {
  documentDirectory: '/CookITWeb/',
  ensureDirectory: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  getInfo: jest.fn(),
  deleteFile: jest.fn(),
};

jest.mock('../webFileSystem', () => ({
  __esModule: true,
  default: mockWebFileSystem,
}));

const mockExpo = {
  // Exactly the trap this module exists to avoid: the module resolves fine on
  // web, but its documentDirectory is null there.
  documentDirectory: null,
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
};

jest.mock('expo-file-system', () => mockExpo, { virtual: true });

function loadWith(platformOS) {
  let fileSystem;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: platformOS } }));
    fileSystem = require('../crossPlatformFileSystem').default;
  });
  return fileSystem;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('on web', () => {
  test('reports isWeb and does NOT claim the Expo backend', () => {
    const fs = loadWith('web');
    expect(fs.isWeb).toBe(true);
    // The regression this guards: expo-file-system resolves on web, so a check
    // of `!!FileSystem` alone would set isExpo true and route calls into a
    // backend whose documentDirectory is null.
    expect(fs.isExpo).toBe(false);
    expect(fs.isRNFS).toBe(false);
  });

  test('documentDirectory comes from the web backend, not the null Expo one', () => {
    const fs = loadWith('web');
    expect(fs.documentDirectory).toBe('/CookITWeb/');
    expect(fs.documentDirectory).not.toBeNull();
  });

  test.each([
    ['ensureDirectory', ['/CookITWeb/images/']],
    ['getInfo', ['/CookITWeb/a.jpg']],
    ['deleteFile', ['/CookITWeb/a.jpg']],
  ])('%s delegates to the web backend', async (method, args) => {
    const fs = loadWith('web');
    await fs[method](...args);
    expect(mockWebFileSystem[method]).toHaveBeenCalledWith(...args);
    expect(mockExpo.getInfoAsync).not.toHaveBeenCalled();
    expect(mockExpo.deleteAsync).not.toHaveBeenCalled();
  });

  test('writeFile and readFile delegate with their encoding argument intact', async () => {
    const fs = loadWith('web');

    await fs.writeFile('/CookITWeb/a.jpg', 'AAAA', 'base64');
    expect(mockWebFileSystem.writeFile).toHaveBeenCalledWith('/CookITWeb/a.jpg', 'AAAA', 'base64');
    expect(mockExpo.writeAsStringAsync).not.toHaveBeenCalled();

    mockWebFileSystem.readFile.mockResolvedValue('BBBB');
    await expect(fs.readFile('/CookITWeb/a.jpg', 'base64')).resolves.toBe('BBBB');
    expect(mockExpo.readAsStringAsync).not.toHaveBeenCalled();
  });
});

describe('on native', () => {
  test('uses the Expo backend and never the web one', async () => {
    const fs = loadWith('ios');
    expect(fs.isWeb).toBe(false);
    expect(fs.isExpo).toBe(true);

    mockExpo.readAsStringAsync.mockResolvedValue('CCCC');
    await expect(fs.readFile('file:///docs/a.jpg')).resolves.toBe('CCCC');

    expect(mockExpo.readAsStringAsync).toHaveBeenCalled();
    expect(mockWebFileSystem.readFile).not.toHaveBeenCalled();
  });

  test('writes go through Expo with base64 encoding', async () => {
    const fs = loadWith('android');
    await fs.writeFile('file:///docs/a.jpg', 'AAAA');
    expect(mockExpo.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///docs/a.jpg', 'AAAA', { encoding: 'base64' }
    );
    expect(mockWebFileSystem.writeFile).not.toHaveBeenCalled();
  });

  test('deleteFile is idempotent, matching the behaviour callers rely on', async () => {
    const fs = loadWith('ios');
    await fs.deleteFile('file:///docs/a.jpg');
    expect(mockExpo.deleteAsync).toHaveBeenCalledWith('file:///docs/a.jpg', { idempotent: true });
  });
});

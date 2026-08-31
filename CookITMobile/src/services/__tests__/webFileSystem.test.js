// webFileSystem.js has no npm-package dependencies of its own to mock (it
// only touches the browser globals `navigator`/`indexedDB`/`fetch`, plus the
// 'buffer' package already used elsewhere in this codebase) - so instead of
// jest.mock()'ing a module, these tests stand up minimal in-memory fakes for
// those globals directly, in the same spirit as the fake filesystems
// excelService.test.js / recipeImageService.test.js build on top of the
// mocked expo-file-system module.
//
// webFileSystem.js re-checks `navigator`/`indexedDB` on every call (it never
// caches a backend choice), so reassigning these globals in `beforeEach` is
// enough to steer each test to the backend it wants to exercise - no module
// reset/re-import needed.
import { Buffer } from 'buffer';
import webFileSystem from '../webFileSystem';

// --- Fake OPFS (Origin Private File System) ---------------------------
// Mirrors the real API surface webFileSystem.js uses: directory handles with
// getDirectoryHandle/getFileHandle/removeEntry, and file handles with
// createWritable()/getFile().
function createFakeDirectoryHandle() {
  const dirs = new Map();
  const files = new Map();
  return {
    dirs,
    files,
    async getDirectoryHandle(name, { create = false } = {}) {
      if (!dirs.has(name)) {
        if (!create) {
          const error = new Error(`NotFoundError: directory '${name}' not found`);
          error.name = 'NotFoundError';
          throw error;
        }
        dirs.set(name, createFakeDirectoryHandle());
      }
      return dirs.get(name);
    },
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name)) {
        if (!create) {
          const error = new Error(`NotFoundError: file '${name}' not found`);
          error.name = 'NotFoundError';
          throw error;
        }
        files.set(name, createFakeFileHandle());
      }
      return files.get(name);
    },
    async removeEntry(name) {
      if (!files.delete(name) && !dirs.delete(name)) {
        const error = new Error(`NotFoundError: '${name}' not found`);
        error.name = 'NotFoundError';
        throw error;
      }
    }
  };
}

function createFakeFileHandle() {
  const handle = {
    bytes: new Uint8Array(0),
    lastModified: Date.now(),
    async createWritable() {
      let pending = new Uint8Array(0);
      return {
        async write(bytes) { pending = bytes; },
        async close() {
          handle.bytes = pending;
          handle.lastModified = Date.now();
        }
      };
    },
    async getFile() {
      return {
        size: handle.bytes.byteLength,
        lastModified: handle.lastModified,
        async arrayBuffer() {
          return handle.bytes.buffer.slice(
            handle.bytes.byteOffset,
            handle.bytes.byteOffset + handle.bytes.byteLength
          );
        },
        async text() {
          return new TextDecoder().decode(handle.bytes);
        }
      };
    }
  };
  return handle;
}

function installFakeOPFS() {
  const root = createFakeDirectoryHandle();
  global.navigator = {
    storage: {
      getDirectory: async () => root
    }
  };
  return root;
}

// --- Fake IndexedDB -----------------------------------------------------
// Minimal enough to exercise webFileSystem.js's open/get/put/delete usage:
// async completion is simulated via a microtask, matching real IDBRequest
// event timing closely enough for these tests.
function installFakeIndexedDB() {
  const stores = new Map();

  function makeStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    const makeRequest = (work) => {
      const request = {};
      queueMicrotask(() => {
        try {
          request.result = work();
          if (request.onsuccess) request.onsuccess();
        } catch (error) {
          request.error = error;
          if (request.onerror) request.onerror();
        }
      });
      return request;
    };
    return {
      get: (key) => makeRequest(() => data.get(key)),
      put: (value, key) => makeRequest(() => { data.set(key, value); return key; }),
      delete: (key) => makeRequest(() => { data.delete(key); })
    };
  }

  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore: (name) => { stores.set(name, new Map()); },
    transaction: (name) => ({ objectStore: () => makeStore(name) })
  };

  global.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };

  return stores;
}

const originalNavigator = global.navigator;
const originalIndexedDB = global.indexedDB;
const originalFetch = global.fetch;

afterEach(() => {
  global.navigator = originalNavigator;
  global.indexedDB = originalIndexedDB;
  global.fetch = originalFetch;
});

describe('documentDirectory', () => {
  test('returns a stable virtual root prefix', () => {
    const first = webFileSystem.documentDirectory;
    const second = webFileSystem.documentDirectory;
    expect(first).toBe(second);
    expect(typeof first).toBe('string');
    expect(first.endsWith('/')).toBe(true);
  });
});

describe('OPFS backend (primary)', () => {
  let fakeRoot;

  beforeEach(() => {
    fakeRoot = installFakeOPFS();
    delete global.indexedDB;
  });

  test('round-trips a base64 write and read', async () => {
    const path = `${webFileSystem.documentDirectory}CookIT_Recipes.xlsx`;
    const base64 = Buffer.from('hello xlsx bytes').toString('base64');

    await webFileSystem.writeFile(path, base64, 'base64');
    const readBack = await webFileSystem.readFile(path, 'base64');

    expect(readBack).toBe(base64);
    expect(Buffer.from(readBack, 'base64').toString('utf8')).toBe('hello xlsx bytes');
  });

  test('getInfo reports exists: false for a file that was never written', async () => {
    const path = `${webFileSystem.documentDirectory}recipe_images/missing.jpg`;
    const info = await webFileSystem.getInfo(path);
    expect(info).toEqual({ exists: false });
  });

  test('getInfo reports exists: true with size after a write', async () => {
    const path = `${webFileSystem.documentDirectory}recipe_images/photo.jpg`;
    const base64 = Buffer.from('jpeg-bytes').toString('base64');
    await webFileSystem.writeFile(path, base64, 'base64');

    const info = await webFileSystem.getInfo(path);

    expect(info.exists).toBe(true);
    expect(info.size).toBe(Buffer.from(base64, 'base64').byteLength);
    expect(typeof info.modificationTime).toBe('number');
  });

  test('deleteFile removes a written file, and is idempotent on a second call', async () => {
    const path = `${webFileSystem.documentDirectory}recipe_images/to-delete.jpg`;
    await webFileSystem.writeFile(path, Buffer.from('data').toString('base64'), 'base64');

    await webFileSystem.deleteFile(path);
    expect((await webFileSystem.getInfo(path)).exists).toBe(false);

    // Deleting again must not throw even though the file is already gone.
    await expect(webFileSystem.deleteFile(path)).resolves.toBeUndefined();
  });

  test('ensureDirectory creates nested directories that a subsequent write can use', async () => {
    const dirPath = `${webFileSystem.documentDirectory}recipe_images/`;

    await webFileSystem.ensureDirectory(dirPath);

    expect(fakeRoot.dirs.has('recipe_images')).toBe(true);

    // The directory being created ahead of time isn't required for
    // writeFile() (which creates intermediate directories itself), but a
    // caller that calls ensureDirectory() first (as recipeImageService.js
    // does) must still be able to write into it afterwards.
    const filePath = `${dirPath}nested.jpg`;
    await webFileSystem.writeFile(filePath, Buffer.from('x').toString('base64'), 'base64');
    expect((await webFileSystem.getInfo(filePath)).exists).toBe(true);
  });

  test('readFile throws for a missing file instead of returning garbage', async () => {
    const path = `${webFileSystem.documentDirectory}recipe_images/absent.jpg`;
    await expect(webFileSystem.readFile(path, 'base64')).rejects.toThrow();
  });

  test('readFile fetches blob:/data:/http(s) URIs directly rather than treating them as a virtual path', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: async () => bytes.buffer
    });

    const result = await webFileSystem.readFile('blob:http://localhost/some-uuid', 'base64');

    expect(global.fetch).toHaveBeenCalledWith('blob:http://localhost/some-uuid');
    expect(result).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('IndexedDB fallback (when OPFS is unavailable)', () => {
  beforeEach(() => {
    // No navigator.storage.getDirectory at all - e.g. Safari private mode.
    global.navigator = {};
    installFakeIndexedDB();
  });

  test('round-trips a base64 write and read', async () => {
    const path = `${webFileSystem.documentDirectory}CookIT_Recipes.xlsx`;
    const base64 = Buffer.from('fallback bytes').toString('base64');

    await webFileSystem.writeFile(path, base64, 'base64');
    const readBack = await webFileSystem.readFile(path, 'base64');

    expect(readBack).toBe(base64);
  });

  test('getInfo reports exists: false for a missing file', async () => {
    const path = `${webFileSystem.documentDirectory}recipe_images/missing.jpg`;
    expect(await webFileSystem.getInfo(path)).toEqual({ exists: false });
  });

  test('deleteFile removes a written file', async () => {
    const path = `${webFileSystem.documentDirectory}recipe_images/to-delete.jpg`;
    await webFileSystem.writeFile(path, Buffer.from('data').toString('base64'), 'base64');

    await webFileSystem.deleteFile(path);

    expect((await webFileSystem.getInfo(path)).exists).toBe(false);
  });

  test('ensureDirectory does not throw even though IndexedDB has no real directory concept', async () => {
    await expect(
      webFileSystem.ensureDirectory(`${webFileSystem.documentDirectory}recipe_images/`)
    ).resolves.toBeUndefined();
  });
});

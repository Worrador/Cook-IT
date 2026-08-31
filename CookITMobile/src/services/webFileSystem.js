// Web filesystem backend for CookIT's local-first storage model (see the
// header comments in excelService.js and recipeImageService.js for the
// overall local-first / Drive-backup design). Neither native implementation
// those files know about works in a browser:
//
//   - expo-file-system's web shim `require()`s successfully (the package
//     exists), but its `documentDirectory` is `null`, so every path-based
//     call would silently misbehave rather than throw.
//   - react-native-fs has no web build at all.
//
// This module is the actual storage backend crossPlatformFileSystem.js
// delegates to when `Platform.OS === 'web'`, checked BEFORE either native
// branch so the null-documentDirectory trap above is never reached.
//
// Primary backend: OPFS (Origin Private File System, via
// `navigator.storage.getDirectory()`). Falls back to IndexedDB when OPFS
// isn't available (Safari private browsing, or older browsers that never
// shipped it) - both backends expose the same six-method surface below, so
// callers never need to know which one is active.
//
// Why not AsyncStorage (already used elsewhere in the app, and backed by
// localStorage on web)? localStorage caps out around 5MB total, and this app
// resizes photos up to MAX_DIMENSION = 1600px (see recipeImageService.js) -
// a handful of photos would blow that quota. Images (and the Excel backup
// file) need a backend with real storage headroom.
//
// Paths in and out of this module are always documentDirectory-relative
// strings built by callers, e.g. `${documentDirectory}recipe_images/foo.jpg`
// - `documentDirectory` here is a virtual root prefix (WEB_ROOT below), not a
// real filesystem path. Both backends key their data off the path's
// segments below that root; IndexedDB has no real directory tree, but
// ensureDirectory()/writeFile() accept the same paths regardless of backend.
//
// Callers pass base64 strings in and expect base64 strings back (mirroring
// FileSystem.writeAsStringAsync/readAsStringAsync's Base64 encoding option) -
// all base64 <-> binary conversion happens inside this module, using the
// 'buffer' package the rest of the codebase already relies on for the same
// thing (see googleDriveService.js).
import { Buffer } from 'buffer';

const WEB_ROOT = '/CookITWeb/';

const IDB_NAME = 'cookit-web-fs';
const IDB_STORE = 'files';
const IDB_VERSION = 1;
// Directory "existence" has no native meaning in a flat IndexedDB key-value
// store, so ensureDirectory() drops a marker record under this suffix purely
// so getInfo() can answer truthfully if it's ever called on a directory path.
const IDB_DIR_MARKER_SUFFIX = '/.dir';

function base64ToBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

// Strips the virtual root prefix (if present) and splits the remainder into
// path segments, dropping empty ones (e.g. from a trailing slash on a
// directory path like `${documentDirectory}recipe_images/`).
function normalizeSegments(path) {
  const withoutRoot = path.startsWith(WEB_ROOT) ? path.slice(WEB_ROOT.length) : path;
  return withoutRoot.split('/').filter(Boolean);
}

function normalizeKey(path) {
  return normalizeSegments(path).join('/');
}

// expo-image-picker / expo-image-manipulator's web shims hand back blob:/
// data: URIs (occasionally http(s) URLs) rather than a documentDirectory-
// style path. Those were never written through writeFile() on this module,
// so they can't be looked up in OPFS/IndexedDB - fetch them directly
// instead. (The picker/manipulator web pipeline itself is a separate concern
// from this filesystem layer; this only keeps readFile() from throwing on an
// input shape it wasn't designed for.)
function isRemoteUri(path) {
  return /^(blob:|data:|https?:)/i.test(path);
}

async function readRemoteUri(uri, encoding) {
  const response = await fetch(uri);
  if (encoding === 'base64') {
    const buffer = await response.arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
  }
  return response.text();
}

function isOPFSAvailable() {
  return typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === 'function';
}

// --- OPFS backend ------------------------------------------------------

async function opfsGetDirectoryHandle(segments, create) {
  let dir = await navigator.storage.getDirectory();
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

async function opfsEnsureDirectory(path) {
  await opfsGetDirectoryHandle(normalizeSegments(path), true);
}

async function opfsWriteFile(path, content, encoding) {
  const segments = normalizeSegments(path);
  const fileName = segments.pop();
  const dir = await opfsGetDirectoryHandle(segments, true);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const bytes = encoding === 'base64' ? base64ToBytes(content) : new TextEncoder().encode(content);
  await writable.write(bytes);
  await writable.close();
}

async function opfsReadFile(path, encoding) {
  const segments = normalizeSegments(path);
  const fileName = segments.pop();
  const dir = await opfsGetDirectoryHandle(segments, false);
  const fileHandle = await dir.getFileHandle(fileName, { create: false });
  const file = await fileHandle.getFile();
  if (encoding === 'base64') {
    return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  }
  return file.text();
}

async function opfsGetInfo(path) {
  try {
    const segments = normalizeSegments(path);
    const fileName = segments.pop();
    const dir = await opfsGetDirectoryHandle(segments, false);
    const fileHandle = await dir.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    // lastModified is epoch milliseconds (like RNFS.stat's mtime); divide to
    // match the epoch-seconds convention the rest of the app's fileSystem
    // wrapper already uses (see crossPlatformFileSystem.js's RNFS branch).
    return { exists: true, size: file.size, modificationTime: file.lastModified / 1000 };
  } catch (_error) {
    return { exists: false };
  }
}

async function opfsDeleteFile(path) {
  try {
    const segments = normalizeSegments(path);
    const fileName = segments.pop();
    const dir = await opfsGetDirectoryHandle(segments, false);
    await dir.removeEntry(fileName);
  } catch (_error) {
    // Idempotent: deleting a file that's already gone (or whose parent
    // directory never existed) is a no-op, matching the { idempotent: true }
    // behaviour used for Expo's FileSystem.deleteAsync elsewhere.
  }
}

// --- IndexedDB backend (fallback) ---------------------------------------
// Deliberately reopens the database on every call instead of caching the
// connection: this backend only exists for the rare case OPFS is missing, so
// the extra open() per call is inconsequential, and avoiding a cached handle
// sidesteps needing any teardown/reset hook between callers (or test runs).

function idbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(store, method, ...args) {
  return new Promise((resolve, reject) => {
    const request = store[method](...args);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbRun(mode, fn) {
  const db = await idbOpen();
  try {
    const store = db.transaction(IDB_STORE, mode).objectStore(IDB_STORE);
    return await fn(store);
  } finally {
    // Every call opens its own connection (see the note above), so every call
    // must close it. Leaving them open leaks a connection per operation and,
    // worse, open connections block any future IDB_VERSION upgrade - the
    // database would silently refuse to migrate.
    db.close();
  }
}

async function idbEnsureDirectory(path) {
  const key = normalizeKey(path) + IDB_DIR_MARKER_SUFFIX;
  await idbRun('readwrite', store => idbRequest(store, 'put', { isDirectory: true }, key));
}

async function idbWriteFile(path, content, encoding) {
  const bytes = encoding === 'base64' ? base64ToBytes(content) : new TextEncoder().encode(content);
  const key = normalizeKey(path);
  await idbRun('readwrite', store => idbRequest(store, 'put', { bytes, lastModified: Date.now() }, key));
}

async function idbReadFile(path, encoding) {
  const key = normalizeKey(path);
  const record = await idbRun('readonly', store => idbRequest(store, 'get', key));
  if (!record || record.isDirectory) {
    throw new Error(`ENOENT: no such file, open '${path}'`);
  }
  return encoding === 'base64' ? bytesToBase64(record.bytes) : new TextDecoder().decode(record.bytes);
}

async function idbGetInfo(path) {
  const key = normalizeKey(path);
  const record = await idbRun('readonly', store => idbRequest(store, 'get', key));
  if (record && !record.isDirectory) {
    return { exists: true, size: record.bytes.byteLength, modificationTime: record.lastModified / 1000 };
  }
  const dirRecord = await idbRun('readonly', store => idbRequest(store, 'get', key + IDB_DIR_MARKER_SUFFIX));
  return dirRecord ? { exists: true } : { exists: false };
}

async function idbDeleteFile(path) {
  const key = normalizeKey(path);
  await idbRun('readwrite', store => idbRequest(store, 'delete', key));
}

// --- Public surface ------------------------------------------------------
// Matches the method set crossPlatformFileSystem.js's Expo/RNFS branches
// expose, so it can delegate to this module on web without any caller
// (excelService.js / recipeImageService.js) needing to know the difference.

class WebFileSystem {
  get documentDirectory() {
    return WEB_ROOT;
  }

  async ensureDirectory(path) {
    return isOPFSAvailable() ? opfsEnsureDirectory(path) : idbEnsureDirectory(path);
  }

  async writeFile(path, content, encoding = 'base64') {
    return isOPFSAvailable() ? opfsWriteFile(path, content, encoding) : idbWriteFile(path, content, encoding);
  }

  async readFile(path, encoding = 'base64') {
    if (isRemoteUri(path)) {
      return readRemoteUri(path, encoding);
    }
    return isOPFSAvailable() ? opfsReadFile(path, encoding) : idbReadFile(path, encoding);
  }

  async getInfo(path) {
    return isOPFSAvailable() ? opfsGetInfo(path) : idbGetInfo(path);
  }

  async deleteFile(path) {
    return isOPFSAvailable() ? opfsDeleteFile(path) : idbDeleteFile(path);
  }
}

export default new WebFileSystem();

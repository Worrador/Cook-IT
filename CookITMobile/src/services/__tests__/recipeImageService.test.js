// --- Mocks for recipeImageService.js's external dependencies ----------------
// Same approach as excelService.test.js: plain jest.fn() placeholders (no
// inline implementation, since jest.config.js sets `restoreMocks: true`,
// which wipes any implementation attached inside the factory before the
// very first test runs), configured in beforeEach instead.

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
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  readDirectoryAsync: jest.fn()
}));

// recipeImageService.js now goes through crossPlatformFileSystem.js, which
// imports `Platform` from 'react-native' to decide the web branch (see that
// file's header comment). The real 'react-native' package isn't safe to load
// under Jest's Node test environment, so it's mocked down to just the bit
// that module needs - 'ios' keeps these tests on the existing Expo-branch
// behavior.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' }
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' }
}));

jest.mock('../googleDriveService', () => ({
  __esModule: true,
  default: {
    isAuthenticated: jest.fn(),
    makeAuthenticatedRequest: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn()
  }
}));

jest.mock('../../utils/storage', () => ({
  loadRecipes: jest.fn(),
  saveRecipes: jest.fn()
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import googleDriveService from '../googleDriveService';
import { loadRecipes, saveRecipes } from '../../utils/storage';
import recipeImageService from '../recipeImageService';

const FileSystem = require('expo-file-system');

// In-memory fake filesystem backing the mocked expo-file-system calls.
let fakeFiles;
let fakeDirs;

const jsonResponse = (body, ok = true, headers = {}) => ({
  ok,
  status: ok ? 200 : 400,
  statusText: ok ? 'OK' : 'Bad Request',
  headers: { get: (key) => headers[key] ?? null },
  json: async () => body,
});

beforeEach(() => {
  fakeFiles = new Map();
  fakeDirs = new Set(['/mock/documents/recipe_images/']);

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
    if (fakeDirs.has(path) || fakeFiles.has(path)) {
      return { exists: true };
    }
    return { exists: false };
  });
  FileSystem.deleteAsync.mockImplementation(async (path) => {
    fakeFiles.delete(path);
  });
  FileSystem.makeDirectoryAsync.mockImplementation(async (path) => {
    fakeDirs.add(path);
  });
  FileSystem.readDirectoryAsync.mockImplementation(async (path) => {
    const prefix = path;
    return [...fakeFiles.keys()]
      .filter(f => f.startsWith(prefix))
      .map(f => f.slice(prefix.length));
  });

  AsyncStorage.getItem.mockResolvedValue(null);
  AsyncStorage.setItem.mockResolvedValue(undefined);
  AsyncStorage.removeItem.mockResolvedValue(undefined);

  googleDriveService.isAuthenticated.mockReturnValue(false);
  googleDriveService.makeAuthenticatedRequest.mockResolvedValue(jsonResponse({}));
  googleDriveService.downloadFile.mockResolvedValue(null);
  googleDriveService.deleteFile.mockResolvedValue(true);

  loadRecipes.mockResolvedValue([]);
  saveRecipes.mockResolvedValue(undefined);

  ImageManipulator.manipulateAsync.mockResolvedValue({ uri: '/mock/cache/manipulated.jpg', width: 800, height: 600 });
  // The manipulated output must itself be readable as a "file" by the fake FS.
  fakeFiles.set('/mock/cache/manipulated.jpg', 'manipulated-base64-data');
});

describe('captureFromCamera', () => {
  test('returns null without saving when camera permission is denied', async () => {
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await recipeImageService.captureFromCamera();

    expect(result).toBeNull();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  test('returns null when the user cancels the camera', async () => {
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

    const result = await recipeImageService.captureFromCamera();

    expect(result).toBeNull();
  });

  test('resizes, compresses, and saves the captured photo locally, returning an image ref', async () => {
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/mock/camera/original.jpg', width: 3000, height: 4000 }]
    });

    const result = await recipeImageService.captureFromCamera();

    expect(result).toEqual({
      id: expect.any(String),
      localFile: expect.stringContaining('/mock/documents/recipe_images/'),
      driveFileId: null
    });

    // Portrait photo (height > width) - resize must cap the LONG edge
    // (height), not blindly cap width, or a tall cookbook page would come
    // out far larger than the 1600px budget.
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      '/mock/camera/original.jpg',
      [{ resize: { height: 1600 } }],
      expect.objectContaining({ compress: 0.8, format: 'jpeg' })
    );

    // The manipulated output actually got written into the managed local dir.
    expect(fakeFiles.get(result.localFile)).toBe('manipulated-base64-data');
  });

  test('caps the width for a landscape photo instead of the height', async () => {
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/mock/camera/wide.jpg', width: 4000, height: 2000 }]
    });

    await recipeImageService.captureFromCamera();

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      '/mock/camera/wide.jpg',
      [{ resize: { width: 1600 } }],
      expect.objectContaining({ compress: 0.8, format: 'jpeg' })
    );
  });
});

describe('pickFromLibrary', () => {
  test('returns an empty array without saving when library permission is denied', async () => {
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await recipeImageService.pickFromLibrary();

    expect(result).toEqual([]);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  test('saves every selected asset and returns one image ref per photo', async () => {
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: '/mock/gallery/one.jpg', width: 1000, height: 800 },
        { uri: '/mock/gallery/two.jpg', width: 1000, height: 800 }
      ]
    });

    const result = await recipeImageService.pickFromLibrary();

    expect(result).toHaveLength(2);
    expect(result[0].id).not.toBe(result[1].id);
    result.forEach(imageRef => {
      expect(imageRef.driveFileId).toBeNull();
      expect(fakeFiles.has(imageRef.localFile)).toBe(true);
    });
  });
});

describe('Drive images folder find-or-create', () => {
  test('returns null without any network call when not authenticated', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(false);

    const folderId = await recipeImageService.getOrCreateImagesFolderId();

    expect(folderId).toBeNull();
    expect(googleDriveService.makeAuthenticatedRequest).not.toHaveBeenCalled();
  });

  test('returns the cached folder id from AsyncStorage without a network call', async () => {
    AsyncStorage.getItem.mockImplementation(async (key) =>
      key === '@cookit_drive_images_folder_id' ? 'cached-folder-id' : null
    );

    const folderId = await recipeImageService.getOrCreateImagesFolderId();

    expect(folderId).toBe('cached-folder-id');
    expect(googleDriveService.makeAuthenticatedRequest).not.toHaveBeenCalled();
  });

  test('finds an existing "Cook-IT Images" folder and caches its id', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest.mockResolvedValue(
      jsonResponse({ files: [{ id: 'existing-folder-id', name: 'Cook-IT Images' }] })
    );

    const folderId = await recipeImageService.getOrCreateImagesFolderId();

    expect(folderId).toBe('existing-folder-id');
    expect(googleDriveService.makeAuthenticatedRequest.mock.calls[0][0]).toContain('files?');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@cookit_drive_images_folder_id', 'existing-folder-id');
  });

  test('creates the folder when none is found, then caches its id', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // search: nothing found
      .mockResolvedValueOnce(jsonResponse({ id: 'new-folder-id' })); // create

    const folderId = await recipeImageService.getOrCreateImagesFolderId();

    expect(folderId).toBe('new-folder-id');
    const [createUrl, createOptions] = googleDriveService.makeAuthenticatedRequest.mock.calls[1];
    expect(createUrl).toBe('https://www.googleapis.com/drive/v3/files');
    expect(createOptions.method).toBe('POST');
    expect(JSON.parse(createOptions.body)).toEqual({
      name: 'Cook-IT Images',
      mimeType: 'application/vnd.google-apps.folder'
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@cookit_drive_images_folder_id', 'new-folder-id');
  });

  test('never throws when the network call fails - returns null instead', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest.mockRejectedValue(new Error('network down'));

    await expect(recipeImageService.getOrCreateImagesFolderId()).resolves.toBeNull();
  });
});

describe('uploadImage (non-fatal Drive upload)', () => {
  const localPath = '/mock/documents/recipe_images/img_1.jpg';

  beforeEach(() => {
    fakeFiles.set(localPath, 'jpeg-base64-content');
  });

  test('returns null without throwing when not authenticated', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(false);

    await expect(recipeImageService.uploadImage(localPath, 'img_1')).resolves.toBeNull();
    expect(googleDriveService.makeAuthenticatedRequest).not.toHaveBeenCalled();
  });

  test('returns null when the folder cannot be resolved', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest.mockResolvedValue(jsonResponse({}, false));

    await expect(recipeImageService.uploadImage(localPath, 'img_1')).resolves.toBeNull();
  });

  test('uploads via the resumable flow with an image mime type and the images folder as parent', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1' }] })) // folder search
      .mockResolvedValueOnce(jsonResponse({}, true, { Location: 'https://upload.example/session' })) // init
      .mockResolvedValueOnce(jsonResponse({ id: 'uploaded-file-id' })); // put content

    const driveFileId = await recipeImageService.uploadImage(localPath, 'img_1');

    expect(driveFileId).toBe('uploaded-file-id');

    const [initUrl, initOptions] = googleDriveService.makeAuthenticatedRequest.mock.calls[1];
    expect(initUrl).toContain('uploadType=resumable');
    const metadata = JSON.parse(initOptions.body);
    expect(metadata.mimeType).toBe('image/jpeg');
    expect(metadata.parents).toEqual(['folder-1']);

    const [putUrl, putOptions] = googleDriveService.makeAuthenticatedRequest.mock.calls[2];
    expect(putUrl).toBe('https://upload.example/session');
    expect(putOptions.headers['Content-Type']).toBe('image/jpeg');
  });

  test('returns null (never throws) when the upload request rejects', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest.mockRejectedValue(new Error('offline'));

    await expect(recipeImageService.uploadImage(localPath, 'img_1')).resolves.toBeNull();
  });
});

describe('downloadImage', () => {
  test('returns null without throwing when not authenticated', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(false);

    await expect(recipeImageService.downloadImage('drive-id')).resolves.toBeNull();
    expect(googleDriveService.downloadFile).not.toHaveBeenCalled();
  });

  test('downloads and writes the file to the local cache dir, returning its path', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.downloadFile.mockResolvedValue('downloaded-base64-content');

    const localPath = await recipeImageService.downloadImage('drive-id-123');

    expect(localPath).toBe('/mock/documents/recipe_images/drive-id-123.jpg');
    expect(fakeFiles.get(localPath)).toBe('downloaded-base64-content');
  });

  test('returns null (never throws) if the download fails', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.downloadFile.mockRejectedValue(new Error('offline'));

    await expect(recipeImageService.downloadImage('drive-id-123')).resolves.toBeNull();
  });
});

describe('ensureLocal', () => {
  test('returns the existing local path without any Drive call when the file is already there', async () => {
    const localFile = '/mock/documents/recipe_images/already-here.jpg';
    fakeFiles.set(localFile, 'data');

    const result = await recipeImageService.ensureLocal({ id: 'x', localFile, driveFileId: 'drive-x' });

    expect(result).toBe(localFile);
    expect(googleDriveService.downloadFile).not.toHaveBeenCalled();
  });

  test('downloads from Drive when the local file is missing but a Drive id exists', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.downloadFile.mockResolvedValue('content');

    const result = await recipeImageService.ensureLocal({
      id: 'x',
      localFile: '/mock/documents/recipe_images/missing.jpg',
      driveFileId: 'drive-x'
    });

    expect(result).toBe('/mock/documents/recipe_images/drive-x.jpg');
  });

  test('returns null when there is neither a local file nor a Drive id', async () => {
    const result = await recipeImageService.ensureLocal({ id: 'x', localFile: null, driveFileId: null });

    expect(result).toBeNull();
  });
});

describe('deleteImage', () => {
  test('deletes the local file and best-effort deletes the Drive file', async () => {
    const localFile = '/mock/documents/recipe_images/to-delete.jpg';
    fakeFiles.set(localFile, 'data');
    googleDriveService.isAuthenticated.mockReturnValue(true);

    await recipeImageService.deleteImage({ id: 'x', localFile, driveFileId: 'drive-x' });

    expect(fakeFiles.has(localFile)).toBe(false);
    expect(googleDriveService.deleteFile).toHaveBeenCalledWith('drive-x');
  });

  test('never throws when the Drive delete fails - the local delete still happened', async () => {
    const localFile = '/mock/documents/recipe_images/to-delete.jpg';
    fakeFiles.set(localFile, 'data');
    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.deleteFile.mockRejectedValue(new Error('network error'));

    await expect(
      recipeImageService.deleteImage({ id: 'x', localFile, driveFileId: 'drive-x' })
    ).resolves.toBeUndefined();

    expect(fakeFiles.has(localFile)).toBe(false);
  });

  test('skips the Drive call entirely for a local-only image (no driveFileId)', async () => {
    const localFile = '/mock/documents/recipe_images/local-only.jpg';
    fakeFiles.set(localFile, 'data');

    await recipeImageService.deleteImage({ id: 'x', localFile, driveFileId: null });

    expect(fakeFiles.has(localFile)).toBe(false);
    expect(googleDriveService.deleteFile).not.toHaveBeenCalled();
  });
});

describe('processUploadQueue (retry queued uploads)', () => {
  test('does nothing when not authenticated', async () => {
    googleDriveService.isAuthenticated.mockReturnValue(false);
    AsyncStorage.getItem.mockImplementation(async (key) =>
      key === '@cookit_pending_image_uploads' ? JSON.stringify([{ id: 'img_1', localFile: '/mock/documents/recipe_images/img_1.jpg' }]) : null
    );

    await recipeImageService.processUploadQueue();

    expect(googleDriveService.makeAuthenticatedRequest).not.toHaveBeenCalled();
  });

  test('retries a queued upload, records the resulting Drive id on the matching recipe, and clears the queue entry', async () => {
    const localFile = '/mock/documents/recipe_images/img_1.jpg';
    fakeFiles.set(localFile, 'jpeg-data');

    AsyncStorage.getItem.mockImplementation(async (key) =>
      key === '@cookit_pending_image_uploads' ? JSON.stringify([{ id: 'img_1', localFile }]) : null
    );

    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1' }] })) // folder search
      .mockResolvedValueOnce(jsonResponse({}, true, { Location: 'https://upload.example/session' })) // init
      .mockResolvedValueOnce(jsonResponse({ id: 'drive-file-1' })); // put content

    loadRecipes.mockResolvedValue([
      { name: 'Soup', images: [{ id: 'img_1', localFile, driveFileId: null }] }
    ]);

    await recipeImageService.processUploadQueue();

    expect(saveRecipes).toHaveBeenCalledWith([
      { name: 'Soup', images: [{ id: 'img_1', localFile, driveFileId: 'drive-file-1' }] }
    ]);

    // The queue entry for the now-uploaded image must be cleared.
    const setItemCalls = AsyncStorage.setItem.mock.calls.filter(([key]) => key === '@cookit_pending_image_uploads');
    const lastQueueWrite = JSON.parse(setItemCalls[setItemCalls.length - 1][1]);
    expect(lastQueueWrite).toEqual([]);
  });

  test('leaves a still-failing upload in the queue instead of throwing', async () => {
    const localFile = '/mock/documents/recipe_images/img_2.jpg';
    fakeFiles.set(localFile, 'jpeg-data');

    AsyncStorage.getItem.mockImplementation(async (key) =>
      key === '@cookit_pending_image_uploads' ? JSON.stringify([{ id: 'img_2', localFile }]) : null
    );

    googleDriveService.isAuthenticated.mockReturnValue(true);
    googleDriveService.makeAuthenticatedRequest.mockRejectedValue(new Error('still offline'));

    await expect(recipeImageService.processUploadQueue()).resolves.toBeUndefined();
    expect(saveRecipes).not.toHaveBeenCalled();
  });

  test('drops a queue entry whose local file no longer exists (e.g. the recipe was deleted)', async () => {
    AsyncStorage.getItem.mockImplementation(async (key) =>
      key === '@cookit_pending_image_uploads'
        ? JSON.stringify([{ id: 'img_gone', localFile: '/mock/documents/recipe_images/gone.jpg' }])
        : null
    );
    googleDriveService.isAuthenticated.mockReturnValue(true);

    await recipeImageService.processUploadQueue();

    expect(googleDriveService.makeAuthenticatedRequest).not.toHaveBeenCalled();
    const setItemCalls = AsyncStorage.setItem.mock.calls.filter(([key]) => key === '@cookit_pending_image_uploads');
    const lastQueueWrite = JSON.parse(setItemCalls[setItemCalls.length - 1][1]);
    expect(lastQueueWrite).toEqual([]);
  });
});

describe('cleanupOrphanedFiles', () => {
  test('deletes local image files that no current recipe references', async () => {
    const referenced = '/mock/documents/recipe_images/keep.jpg';
    const orphan = '/mock/documents/recipe_images/orphan.jpg';
    fakeFiles.set(referenced, 'data');
    fakeFiles.set(orphan, 'data');

    await recipeImageService.cleanupOrphanedFiles([
      { name: 'Soup', images: [{ id: 'a', localFile: referenced, driveFileId: 'd1' }] }
    ]);

    expect(fakeFiles.has(referenced)).toBe(true);
    expect(fakeFiles.has(orphan)).toBe(false);
  });

  test('never throws even if listing the directory fails', async () => {
    FileSystem.readDirectoryAsync.mockRejectedValue(new Error('fs error'));

    await expect(recipeImageService.cleanupOrphanedFiles([])).resolves.toBeUndefined();
  });
});

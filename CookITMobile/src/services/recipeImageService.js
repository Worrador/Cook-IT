// Recipe image lifecycle: capture/pick -> resize/compress -> local save ->
// background Drive upload, plus lazy Drive download and cleanup.
//
// Mirrors excelService.js's local-first design: the local file is always
// what the UI reads (instant, works offline), and Drive is a background
// backup/sync target. All Drive operations in this file are NON-FATAL - if
// the user isn't signed in, is offline, or a Drive call fails, the photo
// still saves locally and the caller never sees a thrown error from a Drive
// problem. Failed uploads are queued in AsyncStorage and retried the next
// time processUploadQueue() is called (wired into storage.js's background
// sync trigger).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import googleDriveService from './googleDriveService';
// Safe as a static import: storage.js only ever reaches this module through
// a lazy `await import(...)` inside its own importServices() helper (like it
// already does for excelService/syncService), so there's no eager cycle -
// by the time storage.js's dynamic import resolves, this module (and
// storage.js itself) are already fully loaded. Mirrors excelService.js,
// which statically imports the same storage.js functions today.
import { loadRecipes, saveRecipes } from '../utils/storage';

// Cross-platform file system, same pattern as excelService.js's
// CrossPlatformFileSystem: Expo FileSystem in dev/most builds, react-native-fs
// as a fallback in production builds where Expo's module isn't present.
let FileSystem;
let RNFS;

try {
  FileSystem = require('expo-file-system');
} catch (_error) {
  RNFS = require('react-native-fs');
}

class ImageFileSystem {
  constructor() {
    this.isExpo = !!FileSystem;
    this.isRNFS = !!RNFS;
  }

  get documentDirectory() {
    if (this.isExpo) return FileSystem.documentDirectory;
    if (this.isRNFS) return RNFS.DocumentDirectoryPath + '/';
    throw new Error('No file system available');
  }

  async ensureDirectory(path) {
    if (this.isExpo) {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(path, { intermediates: true });
      }
      return;
    }
    if (this.isRNFS) {
      const exists = await RNFS.exists(path);
      if (!exists) {
        await RNFS.mkdir(path);
      }
      return;
    }
    throw new Error('No file system available');
  }

  async writeFile(path, content, encoding = 'base64') {
    if (this.isExpo) {
      return FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.Base64
      });
    }
    if (this.isRNFS) {
      return RNFS.writeFile(path, content, encoding);
    }
    throw new Error('No file system available');
  }

  async readFile(path, encoding = 'base64') {
    if (this.isExpo) {
      return FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64
      });
    }
    if (this.isRNFS) {
      return RNFS.readFile(path, encoding);
    }
    throw new Error('No file system available');
  }

  async getInfo(path) {
    if (this.isExpo) {
      return FileSystem.getInfoAsync(path);
    }
    if (this.isRNFS) {
      const exists = await RNFS.exists(path);
      return { exists };
    }
    throw new Error('No file system available');
  }

  async deleteFile(path) {
    if (this.isExpo) {
      return FileSystem.deleteAsync(path, { idempotent: true });
    }
    if (this.isRNFS) {
      const exists = await RNFS.exists(path);
      if (exists) await RNFS.unlink(path);
      return;
    }
    throw new Error('No file system available');
  }
}

const fileSystem = new ImageFileSystem();

const IMAGE_DIR_NAME = 'recipe_images/';
const DRIVE_IMAGES_FOLDER_NAME = 'Cook-IT Images';
const DRIVE_IMAGES_FOLDER_ID_KEY = '@cookit_drive_images_folder_id';
const PENDING_UPLOADS_KEY = '@cookit_pending_image_uploads';
const MAX_DIMENSION = 1600;
const JPEG_COMPRESSION = 0.8;

function generateImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class RecipeImageService {
  getLocalDir() {
    return `${fileSystem.documentDirectory}${IMAGE_DIR_NAME}`;
  }

  getLocalPathForId(id) {
    return `${this.getLocalDir()}${id}.jpg`;
  }

  async ensureLocalDir() {
    await fileSystem.ensureDirectory(this.getLocalDir());
  }

  // --- Capture / pick -------------------------------------------------

  /**
   * Launch the camera, resize/compress the result, and save it to local
   * document storage. Returns null if the user cancels or permission is
   * denied (never throws for a user-cancel/deny - only for genuine I/O
   * failures while saving).
   */
  async captureFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission?.granted) {
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled || !result.assets?.length) {
      return null;
    }

    return this._saveAsset(result.assets[0]);
  }

  /**
   * Launch the photo library picker (multi-select) and save every chosen
   * image locally. Returns an array (possibly empty) of saved image refs.
   */
  async pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission?.granted) {
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'Images',
      allowsMultipleSelection: true,
      quality: 1
    });
    if (result.canceled || !result.assets?.length) {
      return [];
    }

    const saved = [];
    for (const asset of result.assets) {
      const imageRef = await this._saveAsset(asset);
      if (imageRef) saved.push(imageRef);
    }
    return saved;
  }

  async _saveAsset(asset) {
    await this.ensureLocalDir();
    const id = generateImageId();
    const destPath = this.getLocalPathForId(id);

    const manipulated = await this._resizeAndCompress(asset);
    const base64 = await fileSystem.readFile(manipulated.uri, 'base64');
    await fileSystem.writeFile(destPath, base64, 'base64');

    const imageRef = { id, localFile: destPath, driveFileId: null };

    // Fire-and-forget background upload. Never lets an upload failure
    // propagate to the caller - the image already exists locally and is
    // fully usable; the queue below picks it up again on the next sync.
    this._backgroundUpload(imageRef).catch(() => {});

    return imageRef;
  }

  async _resizeAndCompress(asset) {
    const { width, height, uri } = asset;
    const resizeAction = width && height && height > width
      ? { resize: { height: Math.min(height, MAX_DIMENSION) } }
      : { resize: { width: Math.min(width || MAX_DIMENSION, MAX_DIMENSION) } };

    return ImageManipulator.manipulateAsync(uri, [resizeAction], {
      compress: JPEG_COMPRESSION,
      format: ImageManipulator.SaveFormat.JPEG
    });
  }

  // --- Drive folder ------------------------------------------------------

  async getOrCreateImagesFolderId() {
    const cached = await AsyncStorage.getItem(DRIVE_IMAGES_FOLDER_ID_KEY);
    if (cached) return cached;

    if (!googleDriveService.isAuthenticated()) return null;

    try {
      const found = await this._findImagesFolder();
      if (found) {
        await AsyncStorage.setItem(DRIVE_IMAGES_FOLDER_ID_KEY, found);
        return found;
      }

      const created = await this._createImagesFolder();
      if (created) {
        await AsyncStorage.setItem(DRIVE_IMAGES_FOLDER_ID_KEY, created);
      }
      return created;
    } catch (error) {
      console.warn('recipeImageService: could not find/create Drive images folder:', error?.message || error);
      return null;
    }
  }

  async _findImagesFolder() {
    const queryParts = [
      `name = '${DRIVE_IMAGES_FOLDER_NAME.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false'
    ];
    const params = new URLSearchParams({
      q: queryParts.join(' and '),
      fields: 'files(id,name)',
      spaces: 'drive',
      pageSize: '10'
    });

    const response = await googleDriveService.makeAuthenticatedRequest(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { method: 'GET' }
    );
    if (!response?.ok) return null;

    const data = await response.json();
    const files = Array.isArray(data.files) ? data.files : [];
    return files.length > 0 ? files[0].id : null;
  }

  async _createImagesFolder() {
    const response = await googleDriveService.makeAuthenticatedRequest(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          name: DRIVE_IMAGES_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder'
        })
      }
    );
    if (!response?.ok) return null;

    const result = await response.json();
    return result.id || null;
  }

  // --- Upload --------------------------------------------------------

  /**
   * Upload a local image file to the Cook-IT Images Drive folder. Resumable
   * upload, modeled on googleDriveService.createFile() but with an
   * image-specific mime type and the images folder as parent (createFile()
   * hardcodes the xlsx mime type and 'root').
   *
   * Non-fatal by design: returns null (never throws) on any failure -
   * not authenticated, offline, folder lookup failure, etc.
   */
  async uploadImage(localPath, id) {
    try {
      if (!googleDriveService.isAuthenticated()) return null;

      const folderId = await this.getOrCreateImagesFolderId();
      if (!folderId) return null;

      const fileInfo = await fileSystem.getInfo(localPath);
      if (!fileInfo.exists) return null;

      const metadata = {
        name: `${id}.jpg`,
        mimeType: 'image/jpeg',
        parents: [folderId]
      };

      const initResponse = await googleDriveService.makeAuthenticatedRequest(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify(metadata)
        }
      );
      if (!initResponse?.ok) return null;

      const location = initResponse.headers.get('Location');
      if (!location) return null;

      const base64Content = await fileSystem.readFile(localPath, 'base64');
      const buffer = Buffer.from(base64Content, 'base64');

      const uploadResponse = await googleDriveService.makeAuthenticatedRequest(location, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: buffer
      });
      if (!uploadResponse?.ok) return null;

      const result = await uploadResponse.json();
      return result.id || null;
    } catch (error) {
      console.warn('recipeImageService: upload failed (non-fatal):', error?.message || error);
      return null;
    }
  }

  // Attempts an immediate upload; on failure, queues the image for retry on
  // the next successful background sync rather than surfacing the error.
  async _backgroundUpload(imageRef) {
    const driveFileId = await this.uploadImage(imageRef.localFile, imageRef.id);
    if (driveFileId) {
      await this._applyUploadedDriveId(imageRef.id, driveFileId);
      await this._removeFromQueue(imageRef.id);
    } else {
      await this._queueUpload(imageRef);
    }
  }

  async _queueUpload({ id, localFile }) {
    try {
      const queue = await this._loadQueue();
      if (!queue.some(entry => entry.id === id)) {
        queue.push({ id, localFile });
        await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(queue));
      }
    } catch (error) {
      console.warn('recipeImageService: could not queue image upload:', error?.message || error);
    }
  }

  async _removeFromQueue(id) {
    try {
      const queue = await this._loadQueue();
      const filtered = queue.filter(entry => entry.id !== id);
      if (filtered.length !== queue.length) {
        await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(filtered));
      }
    } catch (error) {
      console.warn('recipeImageService: could not update upload queue:', error?.message || error);
    }
  }

  async _loadQueue() {
    try {
      const raw = await AsyncStorage.getItem(PENDING_UPLOADS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  // Patches the driveFileId onto the matching image entry across all
  // recipes once a queued/background upload finally succeeds. Recipes are
  // addressed generically (not by name) since the queue only knows the
  // image id.
  async _applyUploadedDriveId(imageId, driveFileId) {
    try {
      const recipes = await loadRecipes();
      let changed = false;

      const updated = recipes.map(recipe => {
        if (!Array.isArray(recipe.images) || recipe.images.length === 0) return recipe;
        const images = recipe.images.map(img => {
          if (img.id === imageId && !img.driveFileId) {
            changed = true;
            return { ...img, driveFileId };
          }
          return img;
        });
        return changed ? { ...recipe, images } : recipe;
      });

      if (changed) {
        await saveRecipes(updated);
      }
    } catch (error) {
      console.warn('recipeImageService: could not record uploaded image id:', error?.message || error);
    }
  }

  /**
   * Retry every queued (previously failed) upload. Safe to call frequently
   * (e.g. from the background sync trigger) - each entry is only removed
   * from the queue once it genuinely succeeds.
   */
  async processUploadQueue() {
    if (!googleDriveService.isAuthenticated()) return;

    const queue = await this._loadQueue();
    for (const entry of queue) {
      try {
        const fileInfo = await fileSystem.getInfo(entry.localFile);
        if (!fileInfo.exists) {
          // The local file is gone (e.g. the image/recipe was deleted) -
          // nothing left to upload, drop it from the queue.
          await this._removeFromQueue(entry.id);
          continue;
        }
        const driveFileId = await this.uploadImage(entry.localFile, entry.id);
        if (driveFileId) {
          await this._applyUploadedDriveId(entry.id, driveFileId);
          await this._removeFromQueue(entry.id);
        }
      } catch (error) {
        console.warn('recipeImageService: retrying upload failed (non-fatal):', error?.message || error);
      }
    }
  }

  // --- Download / local hydration -------------------------------------

  /**
   * Download a Drive image to the local cache dir and return its local
   * path. Non-fatal: returns null on any failure instead of throwing.
   */
  async downloadImage(driveFileId) {
    try {
      if (!driveFileId) return null;
      if (!googleDriveService.isAuthenticated()) return null;

      const base64Content = await googleDriveService.downloadFile(driveFileId);
      if (!base64Content) return null;

      await this.ensureLocalDir();
      const localPath = `${this.getLocalDir()}${driveFileId}.jpg`;
      await fileSystem.writeFile(localPath, base64Content, 'base64');
      return localPath;
    } catch (error) {
      console.warn('recipeImageService: download failed (non-fatal):', error?.message || error);
      return null;
    }
  }

  /**
   * Returns a usable local path for an image ref, downloading from Drive on
   * demand if the local copy is missing (e.g. a fresh install that only has
   * the Excel-synced reference). Returns null if there's no local copy and
   * no way to fetch one (no Drive id, not signed in, offline, etc).
   */
  async ensureLocal(imageRef) {
    if (!imageRef) return null;

    if (imageRef.localFile) {
      const info = await fileSystem.getInfo(imageRef.localFile);
      if (info.exists) return imageRef.localFile;
    }

    if (imageRef.driveFileId) {
      return this.downloadImage(imageRef.driveFileId);
    }

    return null;
  }

  // --- Delete ----------------------------------------------------------

  /**
   * Delete an image's local file and (best-effort, non-fatal) its Drive
   * counterpart. Never throws - a failed Drive delete just leaves an orphan
   * file in the user's Drive folder, which is a much better outcome than
   * blocking the user's local delete action.
   */
  async deleteImage(imageRef) {
    if (!imageRef) return;

    if (imageRef.localFile) {
      try {
        await fileSystem.deleteFile(imageRef.localFile);
      } catch (error) {
        console.warn('recipeImageService: local image delete failed (non-fatal):', error?.message || error);
      }
    }

    if (imageRef.driveFileId && googleDriveService.isAuthenticated()) {
      try {
        await googleDriveService.deleteFile(imageRef.driveFileId);
      } catch (error) {
        console.warn('recipeImageService: Drive image delete failed (non-fatal):', error?.message || error);
      }
    }

    await this._removeFromQueue(imageRef.id);
  }

  /**
   * Delete every local file under the recipe images directory that isn't
   * referenced by any current recipe. Best-effort/non-fatal.
   */
  async cleanupOrphanedFiles(recipes) {
    try {
      const referencedFiles = new Set();
      for (const recipe of recipes || []) {
        for (const img of recipe.images || []) {
          if (img?.localFile) referencedFiles.add(img.localFile);
        }
      }

      if (!fileSystem.isExpo || typeof FileSystem.readDirectoryAsync !== 'function') {
        // No directory listing available on this platform/fallback - skip
        // rather than risk deleting something we can't verify.
        return;
      }

      const dir = this.getLocalDir();
      const dirInfo = await fileSystem.getInfo(dir);
      if (!dirInfo.exists) return;

      const entries = await FileSystem.readDirectoryAsync(dir);
      for (const entry of entries) {
        const fullPath = `${dir}${entry}`;
        if (!referencedFiles.has(fullPath)) {
          await fileSystem.deleteFile(fullPath);
        }
      }
    } catch (error) {
      console.warn('recipeImageService: orphan cleanup failed (non-fatal):', error?.message || error);
    }
  }
}

export default new RecipeImageService();

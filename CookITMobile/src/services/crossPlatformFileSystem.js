// Cross-platform file system wrapper shared by excelService.js (the local
// Excel backup file) and recipeImageService.js (recipe photos). Both used to
// define their own near-identical copy of this class; it now lives here once
// so the two stay in lockstep instead of drifting.
//
// Native platforms use Expo's FileSystem module where available, falling
// back to react-native-fs in builds where Expo's module isn't present. Web
// can't use either - it delegates to webFileSystem.js's OPFS/IndexedDB
// backend instead.
//
// IMPORTANT: `require('expo-file-system')` *resolves* even inside a web
// bundle (the package exists on disk), so a naive `isExpo` check would be
// `true` on web too - but `FileSystem.documentDirectory` is `null` there,
// which would silently break every file operation instead of failing
// loudly. That's why `isWeb` is computed independently of `isExpo`/`isRNFS`
// below, and every method checks it FIRST.
import { Platform } from 'react-native';
import webFileSystem from './webFileSystem';

let FileSystem;
let RNFS;

try {
  // Try to import Expo FileSystem first (for development builds).
  FileSystem = require('expo-file-system');
} catch (_error) {
  // Fall back to react-native-fs (for production builds).
  RNFS = require('react-native-fs');
}

class CrossPlatformFileSystem {
  constructor() {
    this.isWeb = Platform.OS === 'web';
    // Deliberately excludes `isWeb` even though `FileSystem` is truthy there
    // too - see the module comment above.
    this.isExpo = !this.isWeb && !!FileSystem;
    this.isRNFS = !this.isWeb && !!RNFS;
  }

  get documentDirectory() {
    if (this.isWeb) return webFileSystem.documentDirectory;
    if (this.isExpo) return FileSystem.documentDirectory;
    if (this.isRNFS) return RNFS.DocumentDirectoryPath + '/';
    throw new Error('No file system available');
  }

  async ensureDirectory(path) {
    if (this.isWeb) return webFileSystem.ensureDirectory(path);
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
    if (this.isWeb) return webFileSystem.writeFile(path, content, encoding);
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
    if (this.isWeb) return webFileSystem.readFile(path, encoding);
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
    if (this.isWeb) return webFileSystem.getInfo(path);
    if (this.isExpo) {
      return FileSystem.getInfoAsync(path);
    }
    if (this.isRNFS) {
      const exists = await RNFS.exists(path);
      if (exists) {
        const stats = await RNFS.stat(path);
        return {
          exists: true,
          size: stats.size,
          modificationTime: stats.mtime.getTime() / 1000
        };
      }
      return { exists: false };
    }
    throw new Error('No file system available');
  }

  async deleteFile(path) {
    if (this.isWeb) return webFileSystem.deleteFile(path);
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

export default new CrossPlatformFileSystem();

import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import googleDriveService from './googleDriveService';
import { loadRecipes, saveRecipes, getPinnedRecipes } from '../utils/storage';
import { getLastCookedDates, setLastCookedDates } from '../utils/storage';

// Cross-platform file system imports
let FileSystem;
let RNFS;

try {
  // Try to import Expo FileSystem first (for development builds)
  FileSystem = require('expo-file-system');
} catch (error) {
  // Fall back to react-native-fs (for production builds)
  RNFS = require('react-native-fs');
}

const EXCEL_FILE_NAME = 'CookIT_Recipes.xlsx';
const EXCEL_METADATA_KEY = '@cookit_excel_metadata';
const EXCEL_CONFLICT_KEY = '@cookit_excel_conflict';

// Cross-platform file system wrapper
class CrossPlatformFileSystem {
  constructor() {
    this.isExpo = !!FileSystem;
    this.isRNFS = !!RNFS;
  }

  get documentDirectory() {
    if (this.isExpo) {
      return FileSystem.documentDirectory;
    } else if (this.isRNFS) {
      return RNFS.DocumentDirectoryPath;
    }
    throw new Error('No file system available');
  }

  async writeFile(path, content, encoding = 'base64') {
    if (this.isExpo) {
      return await FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.Base64
      });
    } else if (this.isRNFS) {
      return await RNFS.writeFile(path, content, encoding);
    }
    throw new Error('No file system available');
  }

  async readFile(path, encoding = 'base64') {
    if (this.isExpo) {
      return await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64
      });
    } else if (this.isRNFS) {
      return await RNFS.readFile(path, encoding);
    }
    throw new Error('No file system available');
  }

  async getInfo(path) {
    if (this.isExpo) {
      return await FileSystem.getInfoAsync(path);
    } else if (this.isRNFS) {
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
    if (this.isExpo) {
      return await FileSystem.deleteAsync(path);
    } else if (this.isRNFS) {
      return await RNFS.unlink(path);
    }
    throw new Error('No file system available');
  }
}

const fileSystem = new CrossPlatformFileSystem();

class ExcelService {
  constructor() {
    this.isInitialized = false;
    this.localFilePath = null;
    this.lastModified = null;
    this.fileSize = 0;
    this.conflictData = null;
  }

  async initialize() {
    if (this.isInitialized) return true;

    try {
      // Initialize Google Drive service
      await googleDriveService.initialize();

      // Set up local file path using cross-platform file system
      this.localFilePath = `${fileSystem.documentDirectory}${EXCEL_FILE_NAME}`;

      // Log the file path for debugging
      console.log('📁 Excel file will be stored at:', this.localFilePath);
      console.log('📁 Document directory:', fileSystem.documentDirectory);

      // Load metadata
      await this.loadMetadata();

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing Excel service:', error);
      return false;
    }
  }

  async loadMetadata() {
    try {
      const metadata = await AsyncStorage.getItem(EXCEL_METADATA_KEY);
      if (metadata) {
        const parsed = JSON.parse(metadata);
        this.lastModified = parsed.lastModified ? new Date(parsed.lastModified) : null;
        this.fileSize = parsed.fileSize || 0;
      }

      // Check if local file exists and get its info
      const fileInfo = await fileSystem.getInfo(this.localFilePath);
      if (fileInfo.exists) {
        this.fileSize = fileInfo.size;
        this.lastModified = new Date(fileInfo.modificationTime * 1000);
      }
    } catch (error) {
      console.error('Error loading Excel metadata:', error);
    }
  }

  async saveMetadata() {
    try {
      const metadata = {
        lastModified: this.lastModified?.toISOString(),
        fileSize: this.fileSize,
        localPath: this.localFilePath
      };
      await AsyncStorage.setItem(EXCEL_METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('Error saving Excel metadata:', error);
    }
  }

  /**
   * Download Excel file from Google Drive
   */
  async downloadFromDrive() {
    try {
      if (!googleDriveService.isAuthenticated()) {
        throw new Error('Not authenticated with Google Drive');
      }

      console.log('Downloading Excel file from Google Drive...');

      // Get file ID from Google Drive service
      const fileId = await googleDriveService.getDriveFileId();
      if (!fileId) {
        throw new Error('No Excel file found in Google Drive');
      }

      // Download file content
      const fileContent = await googleDriveService.downloadFile(fileId);
      if (!fileContent) {
        throw new Error('Failed to download file content');
      }

      // Save to local file system using cross-platform file system
      await fileSystem.writeFile(this.localFilePath, fileContent);

      // Update metadata
      const fileInfo = await fileSystem.getInfo(this.localFilePath);
      this.fileSize = fileInfo.size;
      this.lastModified = new Date(fileInfo.modificationTime * 1000);
      await this.saveMetadata();

      console.log('Excel file downloaded successfully');
      return true;
    } catch (error) {
      console.error('Error downloading Excel file:', error);
      throw error;
    }
  }

  /**
   * Upload Excel file to Google Drive
   */
  async uploadToDrive() {
    try {
      if (!googleDriveService.isAuthenticated()) {
        throw new Error('Not authenticated with Google Drive');
      }

      // Check if local file exists
      const fileInfo = await fileSystem.getInfo(this.localFilePath);
      if (!fileInfo.exists) {
        throw new Error('Local Excel file does not exist');
      }

      console.log('Uploading Excel file to Google Drive...');

      // Read file content
      const fileContent = await fileSystem.readFile(this.localFilePath);

      // Get file ID or create new file
      let fileId = await googleDriveService.getDriveFileId();

      if (fileId) {
        // Update existing file
        await googleDriveService.updateFile(fileId, fileContent);
      } else {
        // Create new file
        fileId = await googleDriveService.createFile(EXCEL_FILE_NAME, fileContent);
      }

      // Update metadata
      this.fileSize = fileInfo.size;
      this.lastModified = new Date(fileInfo.modificationTime * 1000);
      await this.saveMetadata();

      console.log('Excel file uploaded successfully');
      return true;
    } catch (error) {
      console.error('Error uploading Excel file:', error);
      throw error;
    }
  }

  /**
   * Create or update local Excel file
   */
  async createLocalExcelFile() {
    try {
      console.log('📄 Creating local Excel file...');
      console.log('📁 File path:', this.localFilePath);

      // Get current data
      const recipes = await loadRecipes();
      const lastCookedDates = await getLastCookedDates();
      const pinnedRecipes = await getPinnedRecipes();

      console.log(`📊 Creating Excel with ${recipes.length} recipes`);

      // Prepare Excel data
      const excelData = this.prepareExcelData(recipes, lastCookedDates, pinnedRecipes);

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipes');

      // Write to file
      const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

      await fileSystem.writeFile(this.localFilePath, excelBuffer);

      // Update metadata
      const fileInfo = await fileSystem.getInfo(this.localFilePath);
      this.fileSize = fileInfo.size;
      this.lastModified = new Date(fileInfo.modificationTime * 1000);
      await this.saveMetadata();

      console.log('✅ Local Excel file created successfully');
      console.log('📁 File size:', fileInfo.size, 'bytes');
      console.log('📁 File path:', this.localFilePath);
      return true;
    } catch (error) {
      console.error('❌ Error creating local Excel file:', error);
      throw error;
    }
  }

  /**
   * Import data from Excel file
   */
  async importFromExcel() {
    try {
      // Check if local file exists
      const fileInfo = await fileSystem.getInfo(this.localFilePath);
      if (!fileInfo.exists) {
        throw new Error('Local Excel file does not exist');
      }

      console.log('Importing data from Excel file...');

      // Read file content
      const fileContent = await fileSystem.readFile(this.localFilePath);

      // Convert base64 to buffer
      const buffer = Buffer.from(fileContent, 'base64');

      // Parse Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Process imported data
      const recipes = [];
      const lastCookedDates = {};
      const pinnedRecipes = [];

      for (const row of jsonData) {
        if (row['Recipe Name']) {
          // Create recipe object
          const recipe = {
            name: row['Recipe Name'],
            url: row['URL'] || '',
            comment: row['Comment'] || '',
            createdAt: row['Created Date'] ? new Date(row['Created Date']).getTime() : Date.now()
          };
          recipes.push(recipe);

          // Process last cooked date
          if (row['Last Cooked Date']) {
            const cookedDate = new Date(row['Last Cooked Date']);
            if (!isNaN(cookedDate.getTime())) {
              lastCookedDates[recipe.name] = cookedDate.getTime();
            }
          }

          // Process pinned status
          if (row['Pinned'] === 'Yes') {
            pinnedRecipes.push(recipe.name);
          }
        }
      }

      // Save imported data
      await saveRecipes(recipes);
      await setLastCookedDates(lastCookedDates);

      // Save pinned recipes
      const pinnedRecipesString = JSON.stringify(pinnedRecipes);
      await AsyncStorage.setItem('@cookit_pinned_recipes', pinnedRecipesString);

      console.log(`Imported ${recipes.length} recipes from Excel`);
      return { recipes, lastCookedDates, pinnedRecipes };
    } catch (error) {
      console.error('Error importing from Excel:', error);
      throw error;
    }
  }

  /**
   * Check for conflicts between local and remote files
   */
  async checkConflicts() {
    try {
      if (!googleDriveService.isAuthenticated()) {
        return { hasConflict: false };
      }

      // Get local file info
      const localFileInfo = await fileSystem.getInfo(this.localFilePath);
      if (!localFileInfo.exists) {
        return { hasConflict: false };
      }

      // Get remote file info
      const fileId = await googleDriveService.getDriveFileId();
      if (!fileId) {
        return { hasConflict: false };
      }

      const remoteFileInfo = await googleDriveService.getFileInfo(fileId);
      if (!remoteFileInfo) {
        return { hasConflict: false };
      }

      // Compare modification times and sizes
      const localModified = new Date(localFileInfo.modificationTime * 1000);
      const remoteModified = new Date(remoteFileInfo.modifiedTime);

      const hasConflict = localModified.getTime() !== remoteModified.getTime() ||
                         localFileInfo.size !== parseInt(remoteFileInfo.size);

      if (hasConflict) {
        // Store conflict data
        this.conflictData = {
          local: {
            modified: localModified,
            size: localFileInfo.size
          },
          remote: {
            modified: remoteModified,
            size: parseInt(remoteFileInfo.size)
          }
        };

        await AsyncStorage.setItem(EXCEL_CONFLICT_KEY, JSON.stringify(this.conflictData));
      }

      return { hasConflict, conflictData: this.conflictData };
    } catch (error) {
      console.error('Error checking conflicts:', error);
      return { hasConflict: false };
    }
  }

  /**
   * Resolve conflict by choosing local or remote version
   */
  async resolveConflict(strategy) {
    try {
      if (!this.conflictData) {
        throw new Error('No conflict data available');
      }

      switch (strategy) {
        case 'local':
          // Upload local version to Drive
          await this.uploadToDrive();
          break;
        case 'remote':
          // Download remote version
          await this.downloadFromDrive();
          await this.importFromExcel();
          break;
        case 'merge':
          // Perform merge operation
          await this.mergeWithLocalData();
          break;
        default:
          throw new Error('Invalid conflict resolution strategy');
      }

      // Clear conflict data
      this.conflictData = null;
      await AsyncStorage.removeItem(EXCEL_CONFLICT_KEY);

      return true;
    } catch (error) {
      console.error('Error resolving conflict:', error);
      throw error;
    }
  }

  /**
   * Merge remote data with local data
   */
  async mergeWithLocalData() {
    try {
      // Download remote version
      await this.downloadFromDrive();

      // Import remote data
      const remoteData = await this.importFromExcel();

      // Get current local data
      const localRecipes = await loadRecipes();
      const localLastCookedDates = await getLastCookedDates();
      const localPinnedRecipes = await getPinnedRecipes();

      // Merge recipes (keep all unique recipes)
      const mergedRecipes = [...localRecipes];
      for (const remoteRecipe of remoteData.recipes) {
        const exists = mergedRecipes.find(r => r.name === remoteRecipe.name);
        if (!exists) {
          mergedRecipes.push(remoteRecipe);
        }
      }

      // Merge last cooked dates (keep most recent)
      const mergedLastCookedDates = { ...localLastCookedDates };
      for (const [recipeName, cookedDate] of Object.entries(remoteData.lastCookedDates)) {
        const localDate = localLastCookedDates[recipeName];
        if (!localDate || cookedDate > localDate) {
          mergedLastCookedDates[recipeName] = cookedDate;
        }
      }

      // Merge pinned recipes (union)
      const mergedPinnedRecipes = [...new Set([...localPinnedRecipes, ...remoteData.pinnedRecipes])];

      // Save merged data
      await saveRecipes(mergedRecipes);
      await setLastCookedDates(mergedLastCookedDates);

      const pinnedRecipesString = JSON.stringify(mergedPinnedRecipes);
      await AsyncStorage.setItem('@cookit_pinned_recipes', pinnedRecipesString);

      // Create new Excel file with merged data
      await this.createLocalExcelFile();

      // Upload merged data to Drive
      await this.uploadToDrive();

      console.log('Data merged successfully');
      return { recipes: mergedRecipes, lastCookedDates: mergedLastCookedDates, pinnedRecipes: mergedPinnedRecipes };
    } catch (error) {
      console.error('Error merging data:', error);
      throw error;
    }
  }

  /**
   * Prepare data for Excel export
   */
  prepareExcelData(recipes, lastCookedDates, pinnedRecipes) {
    return recipes.map(recipe => ({
      'Recipe Name': recipe.name,
      'URL': recipe.url || '',
      'Comment': recipe.comment || '',
      'Created Date': recipe.createdAt ? new Date(recipe.createdAt).toISOString() : '',
      'Last Cooked Date': lastCookedDates[recipe.name] ? new Date(lastCookedDates[recipe.name]).toISOString() : '',
      'Pinned': pinnedRecipes.includes(recipe.name) ? 'Yes' : 'No'
    }));
  }

  /**
   * Get local file information
   */
  async getLocalFileInfo() {
    try {
      const fileInfo = await fileSystem.getInfo(this.localFilePath);
      if (fileInfo.exists) {
        return {
          exists: true,
          size: fileInfo.size,
          modified: new Date(fileInfo.modificationTime * 1000),
          path: this.localFilePath
        };
      }
      return { exists: false };
    } catch (error) {
      console.error('Error getting local file info:', error);
      return { exists: false };
    }
  }

  /**
   * Delete local Excel file
   */
  async deleteLocalFile() {
    try {
      const fileInfo = await fileSystem.getInfo(this.localFilePath);
      if (fileInfo.exists) {
        await fileSystem.deleteFile(this.localFilePath);
        console.log('Local Excel file deleted');
      }
    } catch (error) {
      console.error('Error deleting local Excel file:', error);
    }
  }
}

export default new ExcelService();
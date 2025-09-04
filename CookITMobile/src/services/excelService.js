import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer'; // Import Buffer
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
      // console.log('📁 Excel file will be stored at:', this.localFilePath);
      // console.log('📁 Document directory:', fileSystem.documentDirectory);

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

      // Hide the 'Pinned' column (it's the 6th column, index 5)
      if (!worksheet['!cols']) worksheet['!cols'] = [];
      worksheet['!cols'][5] = { hidden: true };

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipes');

      // Create pinned recipes worksheet
      const pinnedSheet = XLSX.utils.json_to_sheet(pinnedRecipes.map(name => ({ 'Recipe Name': name })));
      XLSX.utils.book_append_sheet(workbook, pinnedSheet, 'Pinned Recipes');

      // Write workbook directly to a base64 string
      const excelBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

      // Write file
      await fileSystem.writeFile(this.localFilePath, excelBase64);

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

      const workbook = XLSX.read(fileContent, { type: 'base64' });

      // Process recipes
      const recipesSheet = workbook.Sheets['Recipes'];
      const recipesData = XLSX.utils.sheet_to_json(recipesSheet);

      // Process pinned recipes
      const pinnedSheet = workbook.Sheets['Pinned Recipes'];
      const pinnedData = XLSX.utils.sheet_to_json(pinnedSheet);

      const recipes = [];
      const lastCookedDates = {};
      const pinnedRecipes = [];

      for (const row of recipesData) {
        if (row['Recipe Name']) {
          // Create recipe object
          const recipe = {
            name: row['Recipe Name'],
            url: row['URL'] || '',
            comment: row['Comment'] || '',
            createdAt: Date.now(),
            lastModified: Date.now()
          };
          recipes.push(recipe);

          // Process last cooked date
          if (row['Last Cooked Date']) {
            const cookedDate = this.safeParseDate(row['Last Cooked Date'], 'Last Cooked Date');
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

      for (const row of pinnedData) {
        if (row['Recipe Name']) {
          pinnedRecipes.push(row['Recipe Name']);
        }
      }

      // Save imported data (skip modification time update since this is import, not user action)
      await saveRecipes(recipes, true);
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
      if (!remoteFileInfo || remoteFileInfo.trashed) {
        return { hasConflict: false };
      }

      // Compare modification times and sizes with a tolerance
      const localModified = new Date(localFileInfo.modificationTime * 1000);
      const remoteModified = new Date(remoteFileInfo.modifiedTime);
      const timeDifference = Math.abs(remoteModified.getTime() - localModified.getTime());
      
      // Consider it a conflict if the remote file is more than 5 seconds newer, OR if sizes differ.
      const hasConflict = (remoteModified > localModified && timeDifference > 5000) ||
                         localFileInfo.size !== parseInt(remoteFileInfo.size);

      if (hasConflict) {
        console.log(`Conflict detected. Remote is newer: ${remoteModified > localModified}, Time diff: ${timeDifference}ms, Size diff: ${localFileInfo.size !== parseInt(remoteFileInfo.size)}`);
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
   * Get available conflict resolution options
   */
  getConflictResolutionOptions() {
    return ['local', 'remote', 'merge'];
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
      console.log('🔄 Starting merge with detailed timing analysis...');
      
      // Get last sync time for context
      const lastSyncTime = await AsyncStorage.getItem('@cookit_last_sync');
      const lastSync = lastSyncTime ? new Date(lastSyncTime) : new Date(0);
      console.log(`📅 Last sync was: ${lastSync.toISOString()}`);
      
      // Download remote version
      await this.downloadFromDrive();

      // Import remote data
      const remoteData = await this.importFromExcel();

      // Get current local data
      const localRecipes = await loadRecipes();
      const localLastCookedDates = await getLastCookedDates();
      const localPinnedRecipes = await getPinnedRecipes();

      // Get detailed timing information
      const localTimingInfo = this.getDataTimingInfo(localRecipes, 'Local');
      const driveTimingInfo = this.getDataTimingInfo(remoteData.recipes, 'Drive');
      
      console.log(`📱 ${localTimingInfo.summary}`);
      console.log(`☁️  ${driveTimingInfo.summary}`);
      
      // Determine what changed since last sync
      const localChanged = localTimingInfo.latestModified > lastSync;
      const driveChanged = driveTimingInfo.latestModified > lastSync;
      console.log(`🔄 Since last sync: Local changed=${localChanged}, Drive changed=${driveChanged}`);

      // Create a mutable copy of local recipes to serve as the base for the merge.
      const mergedRecipes = [...localRecipes];
      
      // Process each recipe from the remote file.
      for (const remoteRecipe of remoteData.recipes) {
        const localRecipeIndex = mergedRecipes.findIndex(r => r.name === remoteRecipe.name);

        if (localRecipeIndex === -1) {
          // This is a brand new recipe from the Drive file. Add it to our list.
          mergedRecipes.push(remoteRecipe);
          console.log(`Merge: Adding new recipe from Drive: '${remoteRecipe.name}'`);
        } else {
          // The recipe already exists. We must check which version is newer.
          const localRecipe = mergedRecipes[localRecipeIndex];
          
          const localDate = new Date(localRecipe.createdAt || 0);
          const remoteDate = new Date(remoteRecipe.createdAt || 0);

          // If the remote recipe's date is more recent, replace the local one.
          if (remoteDate > localDate) {
            mergedRecipes[localRecipeIndex] = remoteRecipe;
            console.log(`☁️  Using drive version of "${remoteRecipe.name}": local=${localDate.toISOString()}, drive=${remoteDate.toISOString()}`);
          } else {
            console.log(`📱 Keeping local version of "${localRecipe.name}": local=${localDate.toISOString()}, drive=${remoteDate.toISOString()}`);
          }
        }
      }

      // Merge last cooked dates (keep most recent)
      const mergedLastCookedDates = { ...localLastCookedDates };
      for (const [recipeName, cookedDate] of Object.entries(remoteData.lastCookedDates)) {
        const localDate = localLastCookedDates[recipeName];
        if (!localDate || new Date(cookedDate) > new Date(localDate)) {
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

      console.log(`🎯 Merge completed: ${mergedRecipes.length} recipes in final result`);
      return { recipes: mergedRecipes, lastCookedDates: mergedLastCookedDates, pinnedRecipes: mergedPinnedRecipes };
    } catch (error) {
      console.error('Error merging data:', error);
      throw error;
    }
  }

  // Get detailed timing information about a data source
  getDataTimingInfo(recipes, sourceName) {
    if (!recipes || recipes.length === 0) {
      return {
        latestModified: new Date(0),
        summary: `${sourceName}: No recipes (empty dataset)`,
        recipeCount: 0,
        modifiedRecipes: []
      };
    }

    let latestModified = new Date(0);
    let oldestModified = new Date();
    const modifiedRecipes = [];

    recipes.forEach(recipe => {
      const modified = new Date(recipe.createdAt || recipe.lastModified || 0);
      if (modified > latestModified) {
        latestModified = modified;
      }
      if (modified < oldestModified) {
        oldestModified = modified;
      }
      modifiedRecipes.push({
        name: recipe.name,
        modified: modified.toISOString()
      });
    });

    // Sort by modification time (newest first)
    modifiedRecipes.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    const summary = `${sourceName}: ${recipes.length} recipes, latest modified: ${latestModified.toISOString()}, oldest: ${oldestModified.toISOString()}`;
    
    return {
      latestModified,
      oldestModified,
      summary,
      recipeCount: recipes.length,
      modifiedRecipes
    };
  }

  /**
   * Safely parse date values from Excel with error handling (for cooked dates only)
   */
  safeParseDate(dateValue, fieldName) {
    try {
      if (!dateValue) {
        return new Date(0);
      }
      
      const parsed = new Date(dateValue);
      if (isNaN(parsed.getTime())) {
        console.warn(`⚠️  Invalid date in ${fieldName}: "${dateValue}", using epoch`);
        return new Date(0);
      }
      
      // Check if date is within reasonable bounds (1970-2100)
      const minDate = new Date('1970-01-01').getTime();
      const maxDate = new Date('2100-12-31').getTime();
      
      if (parsed.getTime() < minDate || parsed.getTime() > maxDate) {
        console.warn(`⚠️  Date out of bounds in ${fieldName}: "${dateValue}", using epoch`);
        return new Date(0);
      }
      
      return parsed;
    } catch (error) {
      console.error(`❌ Error parsing date in ${fieldName}: "${dateValue}"`, error);
      return new Date(0);
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
      'Last Cooked Date': lastCookedDates[recipe.name] ? new Date(lastCookedDates[recipe.name]).toISOString().split('T')[0] : '',
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
          modificationTime: fileInfo.modificationTime,
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
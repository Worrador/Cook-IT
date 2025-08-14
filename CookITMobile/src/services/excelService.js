import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import googleDriveService from './googleDriveService';
import { loadRecipes, saveRecipes, getCookedRecipes, getPinnedRecipes } from '../utils/storage';

const EXCEL_FILE_NAME = 'CookIT_Recipes.xlsx';
const EXCEL_METADATA_KEY = '@cookit_excel_metadata';
const EXCEL_CONFLICT_KEY = '@cookit_excel_conflict';

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

      // Set up local file path
      this.localFilePath = `${RNFS.DocumentDirectoryPath}/${EXCEL_FILE_NAME}`;

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
      if (await RNFS.exists(this.localFilePath)) {
        const stats = await RNFS.stat(this.localFilePath);
        this.fileSize = stats.size;
        this.lastModified = new Date(stats.mtime);
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

      // Save to local file system
      await RNFS.writeFile(this.localFilePath, fileContent, 'base64');

      // Update metadata
      const stats = await RNFS.stat(this.localFilePath);
      this.fileSize = stats.size;
      this.lastModified = new Date(stats.mtime);
      await this.saveMetadata();

      console.log('Excel file downloaded successfully');
      return { success: true, message: 'Excel file downloaded successfully' };
    } catch (error) {
      console.error('Error downloading Excel file:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Create Excel file from local recipes data
   */
  async createFromLocalData() {
    try {
      console.log('Creating Excel file from local recipes...');

      // Load local recipes data
      const recipes = await loadRecipes();
      const cookedRecipes = await getCookedRecipes();
      const pinnedRecipes = await getPinnedRecipes();

      // Prepare data for Excel
      const excelData = this.prepareExcelData(recipes, cookedRecipes, pinnedRecipes);

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const columnWidths = [
        { wch: 25 }, // Recipe Name
        { wch: 15 }, // Category
        { wch: 20 }, // Ingredients
        { wch: 30 }, // Instructions
        { wch: 15 }, // Cook Time
        { wch: 15 }, // Servings
        { wch: 20 }, // Comment
        { wch: 15 }, // Created Date
        { wch: 10 }, // Cooked
        { wch: 10 }, // Pinned
      ];
      worksheet['!cols'] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipes');

      // Write to file
      const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      await RNFS.writeFile(this.localFilePath, excelBuffer, 'base64');

      // Update metadata
      const stats = await RNFS.stat(this.localFilePath);
      this.fileSize = stats.size;
      this.lastModified = new Date();
      await this.saveMetadata();

      console.log('Excel file created successfully');
      return { success: true, message: 'Excel file created successfully' };
    } catch (error) {
      console.error('Error creating Excel file:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Update Excel file with current local data
   */
  async updateWithLocalData() {
    try {
      console.log('Updating Excel file with local recipes...');

      // Check if local file exists
      if (!(await RNFS.exists(this.localFilePath))) {
        return await this.createFromLocalData();
      }

      // Load current local data
      const recipes = await loadRecipes();
      const cookedRecipes = await getCookedRecipes();
      const pinnedRecipes = await getPinnedRecipes();

      // Prepare data for Excel
      const excelData = this.prepareExcelData(recipes, cookedRecipes, pinnedRecipes);

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const columnWidths = [
        { wch: 25 }, // Recipe Name
        { wch: 15 }, // Category
        { wch: 20 }, // Ingredients
        { wch: 30 }, // Instructions
        { wch: 15 }, // Cook Time
        { wch: 15 }, // Servings
        { wch: 20 }, // Comment
        { wch: 15 }, // Created Date
        { wch: 10 }, // Cooked
        { wch: 10 }, // Pinned
      ];
      worksheet['!cols'] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipes');

      // Write to file
      const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      await RNFS.writeFile(this.localFilePath, excelBuffer, 'base64');

      // Update metadata
      const stats = await RNFS.stat(this.localFilePath);
      this.fileSize = stats.size;
      this.lastModified = new Date();
      await this.saveMetadata();

      console.log('Excel file updated successfully');
      return { success: true, message: 'Excel file updated successfully' };
    } catch (error) {
      console.error('Error updating Excel file:', error);
      return { success: false, message: error.message };
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
      if (!(await RNFS.exists(this.localFilePath))) {
        throw new Error('Local Excel file not found');
      }

      console.log('Uploading Excel file to Google Drive...');

      // Read local file
      const fileContent = await RNFS.readFile(this.localFilePath, 'base64');

      // Get or create file ID
      let fileId = await googleDriveService.getDriveFileId();

      if (fileId) {
        // Update existing file
        await googleDriveService.updateFile(fileId, fileContent, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        // Create new file
        fileId = await googleDriveService.createFile(
          EXCEL_FILE_NAME,
          fileContent,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      }

      // Update metadata
      this.lastModified = new Date();
      await this.saveMetadata();

      console.log('Excel file uploaded successfully');
      return { success: true, message: 'Excel file uploaded successfully', fileId };
    } catch (error) {
      console.error('Error uploading Excel file:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Import recipes from Excel file
   */
  async importFromExcel() {
    try {
      // Check if local file exists
      if (!(await RNFS.exists(this.localFilePath))) {
        throw new Error('Local Excel file not found');
      }

      console.log('Importing recipes from Excel file...');

      // Read file content
      const fileContent = await RNFS.readFile(this.localFilePath, 'base64');

      // Parse Excel file
      const workbook = XLSX.read(fileContent, { type: 'base64' });
      const worksheet = workbook.Sheets['Recipes'];

      if (!worksheet) {
        throw new Error('No "Recipes" worksheet found in Excel file');
      }

      // Convert to JSON
      const excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Skip header row and process data
      const recipes = [];
      const cookedRecipes = {};
      const pinnedRecipes = [];

      for (let i = 1; i < excelData.length; i++) {
        const row = excelData[i];
        if (row.length < 8) continue; // Skip incomplete rows

        const recipe = {
          name: row[0] || '',
          category: row[1] || '',
          ingredients: row[2] || '',
          instructions: row[3] || '',
          cookTime: row[4] || '',
          servings: row[5] || '',
          comment: row[6] || '',
          createdAt: row[7] ? new Date(row[7]).toISOString() : new Date().toISOString(),
        };

        if (recipe.name) {
          recipes.push(recipe);

          // Check if recipe was cooked
          if (row[8] === 'Yes' || row[8] === 'TRUE' || row[8] === true) {
            cookedRecipes[recipe.name] = true;
          }

          // Check if recipe was pinned
          if (row[9] === 'Yes' || row[9] === 'TRUE' || row[9] === true) {
            pinnedRecipes.push(recipe.name);
          }
        }
      }

      // Save imported data
      await saveRecipes(recipes);

      // Save cooked and pinned status
      // Note: This would require updating the storage utility to handle these separately
      // For now, we'll just return the data

      console.log(`Imported ${recipes.length} recipes from Excel`);
      return {
        success: true,
        message: `Imported ${recipes.length} recipes from Excel`,
        recipes,
        cookedRecipes,
        pinnedRecipes
      };
    } catch (error) {
      console.error('Error importing from Excel:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Check for conflicts between local and Drive versions
   */
  async checkForConflicts() {
    try {
      if (!googleDriveService.isAuthenticated()) {
        return { hasConflicts: false, message: 'Not authenticated with Google Drive' };
      }

      // Get Drive file info
      const fileId = await googleDriveService.getDriveFileId();
      if (!fileId) {
        return { hasConflicts: false, message: 'No Drive file found' };
      }

      const driveFileInfo = await googleDriveService.getFileInfo(fileId);
      if (!driveFileInfo) {
        return { hasConflicts: false, message: 'Could not get Drive file info' };
      }

      // Check if local file exists
      if (!(await RNFS.exists(this.localFilePath))) {
        return { hasConflicts: false, message: 'No local file to compare' };
      }

      // Compare timestamps
      const localModified = this.lastModified;
      const driveModified = new Date(driveFileInfo.modifiedTime);

      if (!localModified || !driveModified) {
        return { hasConflicts: false, message: 'Cannot determine modification times' };
      }

      const timeDiff = Math.abs(localModified.getTime() - driveModified.getTime());
      const hasConflicts = timeDiff > 60000; // 1 minute threshold

      if (hasConflicts) {
        // Store conflict data for resolution
        this.conflictData = {
          localModified,
          driveModified,
          localSize: this.fileSize,
          driveSize: parseInt(driveFileInfo.size),
          fileId
        };
        await AsyncStorage.setItem(EXCEL_CONFLICT_KEY, JSON.stringify(this.conflictData));
      }

      return {
        hasConflicts,
        localModified: localModified.toISOString(),
        driveModified: driveModified.toISOString(),
        localSize: this.fileSize,
        driveSize: parseInt(driveFileInfo.size)
      };
    } catch (error) {
      console.error('Error checking for conflicts:', error);
      return { hasConflicts: false, message: error.message };
    }
  }

  /**
   * Resolve conflicts by choosing which version to keep
   */
  async resolveConflict(resolution) {
    try {
      if (!this.conflictData) {
        throw new Error('No conflict data available');
      }

      console.log(`Resolving conflict with resolution: ${resolution}`);

      switch (resolution) {
        case 'local':
          // Upload local version to Drive
          await this.uploadToDrive();
          break;

        case 'drive':
          // Download Drive version and overwrite local
          await this.downloadFromDrive();
          break;

        case 'merge':
          // Download Drive version, merge with local, then upload
          await this.downloadFromDrive();
          await this.mergeWithLocalData();
          await this.uploadToDrive();
          break;

        default:
          throw new Error('Invalid resolution option');
      }

      // Clear conflict data
      this.conflictData = null;
      await AsyncStorage.removeItem(EXCEL_CONFLICT_KEY);

      console.log('Conflict resolved successfully');
      return { success: true, message: 'Conflict resolved successfully' };
    } catch (error) {
      console.error('Error resolving conflict:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Merge Drive data with local data
   */
  async mergeWithLocalData() {
    try {
      console.log('Merging Drive data with local data...');

      // Load current local data
      const localRecipes = await loadRecipes();
      const localCookedRecipes = await getCookedRecipes();
      const localPinnedRecipes = await getPinnedRecipes();

      // Import Drive data
      const driveData = await this.importFromExcel();
      if (!driveData.success) {
        throw new Error('Failed to import Drive data for merging');
      }

      // Merge recipes (local takes precedence for conflicts)
      const mergedRecipes = [...driveData.recipes];
      const localRecipeNames = new Set(localRecipes.map(r => r.name));

      for (const localRecipe of localRecipes) {
        const existingIndex = mergedRecipes.findIndex(r => r.name === localRecipe.name);
        if (existingIndex >= 0) {
          mergedRecipes[existingIndex] = localRecipe; // Local version wins
        } else {
          mergedRecipes.push(localRecipe); // Add new local recipe
        }
      }

      // Merge cooked and pinned status
      const mergedCookedRecipes = { ...driveData.cookedRecipes, ...localCookedRecipes };
      const mergedPinnedRecipes = [...new Set([...driveData.pinnedRecipes, ...localPinnedRecipes])];

      // Save merged data
      await saveRecipes(mergedRecipes);

      // Update Excel file with merged data
      await this.updateWithLocalData();

      console.log('Data merged successfully');
      return { success: true, message: 'Data merged successfully' };
    } catch (error) {
      console.error('Error merging data:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Prepare recipe data for Excel export
   */
  prepareExcelData(recipes, cookedRecipes, pinnedRecipes) {
    return recipes.map(recipe => ({
      'Recipe Name': recipe.name,
      'Category': recipe.category || '',
      'Ingredients': recipe.ingredients || '',
      'Instructions': recipe.instructions || '',
      'Cook Time': recipe.cookTime || '',
      'Servings': recipe.servings || '',
      'Comment': recipe.comment || '',
      'Created Date': recipe.createdAt ? new Date(recipe.createdAt).toLocaleDateString() : '',
      'Cooked': cookedRecipes[recipe.name] ? 'Yes' : 'No',
      'Pinned': pinnedRecipes.includes(recipe.name) ? 'Yes' : 'No'
    }));
  }

  /**
   * Get Excel file info
   */
  async getFileInfo() {
    try {
      if (!(await RNFS.exists(this.localFilePath))) {
        return null;
      }

      const stats = await RNFS.stat(this.localFilePath);
      return {
        path: this.localFilePath,
        size: stats.size,
        lastModified: new Date(stats.mtime),
        exists: true
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      return null;
    }
  }

  /**
   * Delete local Excel file
   */
  async deleteLocalFile() {
    try {
      if (await RNFS.exists(this.localFilePath)) {
        await RNFS.unlink(this.localFilePath);
      }

      this.fileSize = 0;
      this.lastModified = null;
      await this.saveMetadata();

      console.log('Local Excel file deleted');
      return { success: true, message: 'Local Excel file deleted' };
    } catch (error) {
      console.error('Error deleting local file:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get conflict resolution options
   */
  getConflictResolutionOptions() {
    if (!this.conflictData) return null;

    return {
      local: {
        label: 'Keep Local Version',
        description: `Keep your local version (modified ${this.conflictData.localModified.toLocaleString()})`,
        timestamp: this.conflictData.localModified
      },
      drive: {
        label: 'Use Drive Version',
        description: `Use the version from Google Drive (modified ${this.conflictData.driveModified.toLocaleString()})`,
        timestamp: this.conflictData.driveModified
      },
      merge: {
        label: 'Merge Both Versions',
        description: 'Combine local and Drive changes (recommended)',
        timestamp: new Date(Math.max(this.conflictData.localModified.getTime(), this.conflictData.driveModified.getTime()))
      }
    };
  }
}

export default new ExcelService();
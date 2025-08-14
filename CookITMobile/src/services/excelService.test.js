// Test file for Excel Service
// This file demonstrates how to use the Excel service

import excelService from './excelService';

// Example usage functions
export const testExcelService = async () => {
  try {
    console.log('Testing Excel Service...');

    // 1. Initialize the service
    const initialized = await excelService.initialize();
    console.log('Service initialized:', initialized);

    // 2. Create Excel file from local data
    const createResult = await excelService.createFromLocalData();
    console.log('Create result:', createResult);

    // 3. Get file info
    const fileInfo = await excelService.getFileInfo();
    console.log('File info:', fileInfo);

    // 4. Check for conflicts (if authenticated)
    const conflictCheck = await excelService.checkForConflicts();
    console.log('Conflict check:', conflictCheck);

    // 5. Upload to Drive (if authenticated)
    const uploadResult = await excelService.uploadToDrive();
    console.log('Upload result:', uploadResult);

    return { success: true, message: 'Excel service test completed' };
  } catch (error) {
    console.error('Excel service test failed:', error);
    return { success: false, message: error.message };
  }
};

export const exportToExcel = async () => {
  try {
    await excelService.initialize();
    const result = await excelService.createFromLocalData();

    if (result.success) {
      console.log('Excel file created successfully');
      return result;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Export to Excel failed:', error);
    throw error;
  }
};

export const importFromExcel = async () => {
  try {
    await excelService.initialize();
    const result = await excelService.importFromExcel();

    if (result.success) {
      console.log(`Imported ${result.recipes.length} recipes from Excel`);
      return result;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Import from Excel failed:', error);
    throw error;
  }
};

export const syncWithDrive = async () => {
  try {
    await excelService.initialize();

    // Check for conflicts first
    const conflictCheck = await excelService.checkForConflicts();

    if (conflictCheck.hasConflicts) {
      console.log('Conflicts detected:', conflictCheck);

      // Get resolution options
      const options = excelService.getConflictResolutionOptions();
      console.log('Resolution options:', options);

      // For this test, we'll use merge resolution
      const resolutionResult = await excelService.resolveConflict('merge');
      console.log('Conflict resolution result:', resolutionResult);

      return resolutionResult;
    } else {
      // No conflicts, just upload
      const uploadResult = await excelService.uploadToDrive();
      console.log('Upload result:', uploadResult);

      return uploadResult;
    }
  } catch (error) {
    console.error('Sync with Drive failed:', error);
    throw error;
  }
};

// Example of how to handle conflict resolution in a UI component
export const handleConflictResolution = async (resolution) => {
  try {
    await excelService.initialize();

    const result = await excelService.resolveConflict(resolution);

    if (result.success) {
      console.log('Conflict resolved successfully');
      return result;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Conflict resolution failed:', error);
    throw error;
  }
};

// Example of how to get conflict information for UI display
export const getConflictInfo = async () => {
  try {
    await excelService.initialize();

    const conflictCheck = await excelService.checkForConflicts();

    if (conflictCheck.hasConflicts) {
      const options = excelService.getConflictResolutionOptions();
      return {
        hasConflicts: true,
        conflictInfo: conflictCheck,
        resolutionOptions: options
      };
    } else {
      return {
        hasConflicts: false,
        message: 'No conflicts detected'
      };
    }
  } catch (error) {
    console.error('Error getting conflict info:', error);
    throw error;
  }
};
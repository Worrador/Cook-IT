# CookIT Mobile Services

This directory contains the core services for the CookIT Mobile application.

## Excel Service (`excelService.js`)

The Excel Service provides comprehensive Excel file handling capabilities for the CookIT app, including Google Drive integration and conflict resolution.

### Features

- **Excel File Creation**: Generate Excel files from local recipe data
- **Google Drive Integration**: Download, upload, and sync Excel files with Google Drive
- **Conflict Resolution**: Detect and resolve conflicts between local and Drive versions
- **Data Import/Export**: Import recipes from Excel files and export current recipes to Excel
- **Automatic Merging**: Smart merging of local and Drive data

### Key Methods

#### Core Operations

- `initialize()` - Initialize the service and Google Drive connection
- `createFromLocalData()` - Create Excel file from current recipes
- `updateWithLocalData()` - Update existing Excel file with current data
- `downloadFromDrive()` - Download Excel file from Google Drive
- `uploadToDrive()` - Upload Excel file to Google Drive

#### Import/Export

- `importFromExcel()` - Import recipes from Excel file
- `exportToExcel()` - Export current recipes to Excel format

#### Conflict Management

- `checkForConflicts()` - Check for conflicts between local and Drive versions
- `resolveConflict(resolution)` - Resolve conflicts with specified strategy
- `getConflictResolutionOptions()` - Get available conflict resolution options
- `mergeWithLocalData()` - Merge Drive data with local data

#### Utility Methods

- `getFileInfo()` - Get information about the local Excel file
- `deleteLocalFile()` - Remove the local Excel file
- `loadMetadata()` - Load file metadata from storage
- `saveMetadata()` - Save file metadata to storage

### Conflict Resolution Strategies

The service provides three conflict resolution options:

1. **`local`** - Keep the local version and upload it to Drive
2. **`drive`** - Use the Drive version and overwrite local data
3. **`merge`** - Combine both versions (local takes precedence for conflicts)

### Excel File Structure

The generated Excel files include the following columns:

- Recipe Name
- Category
- Ingredients
- Instructions
- Cook Time
- Servings
- Comment
- Created Date
- Cooked (Yes/No)
- Pinned (Yes/No)

## Excel-Based Sync Service (`syncService.js`)

The Sync Service has been updated to work with Excel files instead of JSON, providing seamless Excel-based synchronization with Google Drive.

### Key Changes from JSON to Excel

- **File Format**: Now syncs Excel (.xlsx) files instead of JSON
- **Data Conversion**: Automatically converts between Excel and JSON formats
- **Conflict Resolution**: Excel-specific conflict detection and resolution
- **Backward Compatibility**: Legacy methods redirect to Excel-based implementations

### New Excel-Based Methods

#### Core Sync Operations

- `performExcelSync(forcePush)` - Main Excel-based synchronization method
- `handleExcelConflicts(conflictCheck, forcePush)` - Handle Excel-specific conflicts
- `performExcelMerge(localRecipes, localCookedRecipes, localPinnedRecipes, forcePush)` - Merge Excel data
- `mergeExcelData(localRecipes, localCookedRecipes, localPinnedRecipes, driveRecipes, driveCookedRecipes, drivePinnedRecipes)` - Excel data merging logic

#### Excel Operations

- `exportToExcel()` - Export local data to Excel format
- `importFromExcel()` - Import data from Excel format
- `getExcelFileInfo()` - Get information about Excel files
- `checkExcelConflicts()` - Check for Excel-specific conflicts
- `resolveExcelConflict(resolution)` - Resolve Excel conflicts

#### Legacy Support

- `performSync()` - Redirects to `performExcelSync()`
- `mergeData()` - Redirects to Excel-based merging
- `quickSync()` - Updated to work with Excel files
- `forceDownloadFromDrive()` - Updated to download Excel files

### Sync Process Flow

1. **Initialization**: Initialize Excel service and Google Drive authentication
2. **Conflict Detection**: Check for conflicts between local and Drive Excel files
3. **Conflict Resolution**: If conflicts exist, resolve using chosen strategy
4. **Data Download**: Download Excel from Drive (if no conflicts or after resolution)
5. **Data Import**: Convert Excel to JSON for local processing
6. **Data Merging**: Merge local and Drive data using intelligent algorithms
7. **Data Export**: Convert merged data back to Excel format
8. **File Upload**: Upload updated Excel file to Google Drive
9. **Local Update**: Update local storage with merged data

### Conflict Resolution in Excel Sync

The Excel-based sync service provides enhanced conflict resolution:

- **Automatic Detection**: Detects conflicts based on file timestamps and sizes
- **Multiple Strategies**: Local wins, Drive wins, or merge both
- **Smart Merging**: Intelligent combination of local and Drive changes
- **User Choice**: Presents resolution options for user decision
- **Conflict Metadata**: Stores conflict information for resolution

### Usage Examples

#### Basic Excel Export

```javascript
import syncService from './src/services/syncService';

// Export current recipes to Excel
const result = await syncService.exportToExcel();
if (result.success) {
  console.log('Excel file created successfully');
}
```

#### Excel-Based Sync

```javascript
// Perform full Excel-based sync
const syncResult = await syncService.performExcelSync();
if (syncResult.success) {
  console.log('Excel sync completed:', syncResult.message);
}
```

#### Conflict Resolution

```javascript
// Check for Excel conflicts
const conflictCheck = await syncService.checkExcelConflicts();

if (conflictCheck.hasConflicts) {
  // Resolve using merge strategy
  const resolution = await syncService.resolveExcelConflict('merge');
  console.log('Conflict resolved:', resolution.message);
}
```

#### Quick Excel Sync

```javascript
// Quick sync (update Excel and upload to Drive)
const quickResult = await syncService.quickSync();
if (quickResult.success) {
  console.log('Quick Excel sync completed');
}
```

### Integration with Excel Service

The sync service seamlessly integrates with the Excel service:

- **Initialization**: Sync service initializes Excel service automatically
- **File Operations**: All Excel file operations go through Excel service
- **Conflict Handling**: Excel service provides conflict detection and resolution
- **Data Conversion**: Excel service handles Excel ↔ JSON conversion
- **Metadata Management**: Excel service manages file metadata and timestamps

### Error Handling

All methods return consistent error objects:

```javascript
{
  success: boolean,
  message: string,
  hasChanges?: boolean,
  conflictResolved?: boolean,
  resolutionStrategy?: string,
  data?: object
}
```

### File Management

The Excel-based sync service manages:

- **Local Excel Files**: Stored in app's secure document directory
- **Drive Excel Files**: Synced with Google Drive
- **Conflict Data**: Stored in AsyncStorage for resolution
- **Metadata**: File sizes, modification times, and sync status
- **Backup**: Automatic backup before major operations

### Testing

Use the updated `excelService.test.js` file to test all functionality:

```javascript
import {
  testExcelService,
  testExcelSyncService,
  performExcelSync,
  checkExcelConflicts,
  runComprehensiveTest
} from './excelService.test';

// Test individual services
await testExcelService();
await testExcelSyncService();

// Test Excel-based sync
await performExcelSync();

// Check for conflicts
await checkExcelConflicts();

// Run comprehensive test
await runComprehensiveTest();
```

### Migration from JSON to Excel

The sync service automatically handles migration:

- **Legacy Methods**: All existing JSON-based methods redirect to Excel equivalents
- **Data Preservation**: No data loss during migration
- **Backward Compatibility**: Existing code continues to work
- **Automatic Conversion**: JSON data automatically converted to Excel format

### Performance Considerations

Excel-based sync provides several performance benefits:

- **Efficient Storage**: Excel files are more compact than JSON for large datasets
- **Batch Operations**: Excel operations handle multiple recipes simultaneously
- **Smart Merging**: Intelligent algorithms reduce unnecessary data transfers
- **Conflict Resolution**: Efficient conflict detection and resolution
- **Caching**: Local Excel files reduce repeated downloads

### Security Features

- **Secure Storage**: Excel files stored in app's secure directory
- **Authentication**: Google Drive authentication through existing system
- **Data Validation**: Input validation for Excel import/export
- **Error Handling**: Comprehensive error handling without data exposure
- **Audit Trail**: Sync operations logged for debugging

### Future Enhancements

Potential improvements for future versions:

- **Excel Templates**: Customizable Excel file templates
- **Advanced Merging**: Visual diff tools for conflict resolution
- **Batch Operations**: Bulk import/export operations
- **Format Support**: Additional Excel formats (.xls, .csv)
- **Real-time Sync**: Live synchronization with Google Drive
- **Offline Support**: Enhanced offline Excel operations
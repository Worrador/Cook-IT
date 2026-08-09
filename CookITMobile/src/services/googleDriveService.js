import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer'; // Import Buffer

// Scope sets
const BASE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file', // Only files created/opened by the app
];

const EXTENDED_READ_SCOPES = [
  ...BASE_SCOPES,
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

// Configuration constants
const ACCESS_TOKEN_KEY = '@cookit_access_token';
const REFRESH_TOKEN_KEY = '@cookit_refresh_token';
const TOKEN_EXPIRY_KEY = '@cookit_token_expiry';
const DRIVE_FILE_ID_KEY = '@cookit_drive_file_id';
const DRIVE_SEARCH_ALL_PREF_KEY = '@cookit_drive_search_all_pref';

// Replace with your Web application client ID from Google Cloud Console
const WEB_CLIENT_ID = '609680746236-fuo5qoefnbqilcuj9p2eimebrf2k5eqo.apps.googleusercontent.com';

class GoogleDriveService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.driveFileId = null;
    this.isInitialized = false;
  }

  // User preference: whether to search all drives for an existing file on first auth
  async setSearchAllPreference(enabled) {
    await AsyncStorage.setItem(DRIVE_SEARCH_ALL_PREF_KEY, enabled ? 'true' : 'false');
  }

  async getSearchAllPreference() {
    const val = await AsyncStorage.getItem(DRIVE_SEARCH_ALL_PREF_KEY);
    return val === 'true';
  }

  // Determine scopes to configure based on first-auth and preference
  async getConfiguredScopes() {
    // If we already have an access token, keep current behavior (do not escalate silently)
    const existingAccessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    if (existingAccessToken) {
      // Preserve previously configured scopes; default to extended since code may rely on it
      // but we avoid re-configuring with broader scopes unexpectedly. Use BASE_SCOPES here.
      return BASE_SCOPES;
    }
    // First-time auth: respect preference
    const wantsSearchAll = await this.getSearchAllPreference();
    return wantsSearchAll ? EXTENDED_READ_SCOPES : BASE_SCOPES;
  }

  async initialize() {
    if (this.isInitialized) return true;

    try {
      // Configure Google Sign-In with dynamic scopes
      const scopes = await this.getConfiguredScopes();
      GoogleSignin.configure({
        scopes,
        webClientId: WEB_CLIENT_ID,
        offlineAccess: true, // Enable offline access for refresh tokens
      });

      // Load stored tokens
      const [accessToken, refreshToken, tokenExpiry, driveFileId] = await Promise.all([
        AsyncStorage.getItem(ACCESS_TOKEN_KEY),
        AsyncStorage.getItem(REFRESH_TOKEN_KEY),
        AsyncStorage.getItem(TOKEN_EXPIRY_KEY),
        AsyncStorage.getItem(DRIVE_FILE_ID_KEY),
      ]);

      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.tokenExpiry = tokenExpiry ? new Date(tokenExpiry) : null;
      this.driveFileId = driveFileId;

      // If signed in, try to refresh access token silently
      const isSignedIn = await GoogleSignin.isSignedIn();
      if (isSignedIn) {
        await this.refreshAccessToken();
      }

      this.isInitialized = true;
      return this.isAuthenticated();
    } catch (error) {
      console.error('Error initializing Google Drive service:', error);
      return false;
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  isTokenExpired() {
    if (!this.tokenExpiry) return true;
    return new Date() >= this.tokenExpiry;
  }

  async authenticate() {
    try {
      console.log('🔍 Starting authentication process...');
      console.log('🔍 Web Client ID:', WEB_CLIENT_ID);
      console.log('🔍 Package name: com.worrador.cookitmobile');
      console.log('🔍 SHA-1 fingerprint (local debug): 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25');
      console.log('🔍 SHA-1 fingerprint (EAS release): 66:75:4B:A0:24:AF:D9:1E:19:45:DD:D6:59:D5:02:5A:A2:9D:8C:F5');

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      console.log('✅ Google Play Services check passed');

      // Interactive sign in
      console.log('🔍 Attempting Google Sign-In...');
      await GoogleSignin.signIn();
      console.log('✅ Google Sign-In successful');

      // Get tokens
      console.log('🔍 Getting tokens...');
      const tokens = await GoogleSignin.getTokens();
      console.log('🔍 Tokens received:', tokens ? 'Yes' : 'No');

      if (tokens?.accessToken) {
        console.log('✅ Access token received, storing...');
        await this.storeTokensFromAccessToken(tokens.accessToken);
        return true;
      }
      console.log('❌ No access token received');
      throw new Error('No access token received from Google Sign-In');
    } catch (error) {
      console.error('❌ Authentication error:', error);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);

      // Provide more specific error messages
      if (error.code === 'DEVELOPER_ERROR') {
        console.error('🔧 DEVELOPER_ERROR: Google Sign-In is not properly configured. Please check:');
        console.error('1. Web client ID is configured correctly:', WEB_CLIENT_ID);
        console.error('2. Package name matches Google Cloud Console configuration: com.worrador.cookitmobile');
        console.error('3. SHA-1 fingerprint(s) are added to Google Cloud Console Android OAuth client:');
        console.error('   local debug: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25');
        console.error('   EAS release: 66:75:4B:A0:24:AF:D9:1E:19:45:DD:D6:59:D5:02:5A:A2:9D:8C:F5');
        console.error('4. OAuth consent screen is configured with required scopes');
        console.error('5. Your email is added as a test user (if app is in testing mode)');
      } else if (error.code === 'SIGN_IN_CANCELLED') {
        console.error('User cancelled the sign-in process');
        throw Object.assign(new Error('Sign-in was cancelled'), { code: 'SIGN_IN_CANCELLED' });
      } else if (error.code === 'SIGN_IN_REQUIRED') {
        console.error('Sign-in is required but user is not signed in');
      }

      throw error;
    }
  }

  async refreshAccessToken() {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      let tokens = await GoogleSignin.getTokens();
      if (!tokens?.accessToken) {
        // Try silent sign in then get tokens
        await GoogleSignin.signInSilently();
        tokens = await GoogleSignin.getTokens();
      }
      if (tokens?.accessToken) {
        await this.storeTokensFromAccessToken(tokens.accessToken);
        return true;
      }
      return false;
    } catch (error) {
      console.warn('Silent token refresh failed, clearing tokens', error);
      await this.clearTokens();
      return false;
    }
  }

  async storeTokensFromAccessToken(accessToken) {
    this.accessToken = accessToken;
    // Assume ~55 minutes validity and proactively refresh earlier if needed
    this.tokenExpiry = new Date(Date.now() + (55 * 60 * 1000));

    await Promise.all([
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken),
      AsyncStorage.setItem(TOKEN_EXPIRY_KEY, this.tokenExpiry.toISOString()),
    ]);
    console.log('Access token stored successfully');
  }

  async clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;

    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(TOKEN_EXPIRY_KEY),
    ]);
  }

  async makeAuthenticatedRequest(url, options = {}) {
    // Prevent infinite retry loops
    const maxRetries = 2;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        if (!this.isAuthenticated() || this.isTokenExpired()) {
          const refreshed = await this.refreshAccessToken();
          if (!refreshed) {
            throw new Error('Not authenticated');
          }
        }

        const response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`,
          },
        });

        // If token expired or unauthorized, attempt one refresh and retry
        if (response.status === 401 && retryCount < maxRetries) {
          console.log(`Token expired, attempting refresh (attempt ${retryCount + 1}/${maxRetries})`);
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            retryCount++;
            continue; // Retry the request
          } else {
            throw new Error('Failed to refresh token');
          }
        }

        return response;
      } catch (error) {
        if (retryCount >= maxRetries) {
          console.error(`Max retries (${maxRetries}) reached for request to ${url}:`, error);
          throw error;
        }
        retryCount++;
        console.warn(`Request failed, retrying (${retryCount}/${maxRetries}):`, error);

        // Wait a bit before retrying to avoid hammering the API
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  async getDriveFileId() {
    // Return cached ID if available
    if (this.driveFileId) return this.driveFileId;

    // Attempt to locate an existing file by the expected name in user's Drive
    try {
      const foundId = await this.findFileIdByName('CookIT_Recipes.xlsx');
      if (foundId) {
        await this.setDriveFileId(foundId);
        return foundId;
      }
    } catch (e) {
      // Fall through to return null if search fails
      console.warn('Drive file ID lookup by name failed:', e?.message || e);
    }

    return null;
  }

  async setDriveFileId(fileId) {
    // AsyncStorage.setItem rejects non-string values, so null/undefined (used by
    // deleteFile/signOut to clear the stored file) must route to removeItem instead -
    // otherwise this throws, the stale ID never gets cleared, and (in signOut's case)
    // the caller sees a false failure even though sign-out otherwise succeeded.
    if (fileId === null || fileId === undefined) {
      return this.clearDriveFileId();
    }
    this.driveFileId = fileId;
    await AsyncStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
  }

  async clearDriveFileId() {
    this.driveFileId = null;
    await AsyncStorage.removeItem(DRIVE_FILE_ID_KEY);
  }

  async createFile(fileName, content) {
    try {
      // Step 1: Initiate a resumable upload session
      const metadata = {
        name: fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        parents: ['root']
      };

      const initResponse = await this.makeAuthenticatedRequest(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify(metadata),
        }
      );

      if (!initResponse.ok) {
        throw new Error(`Failed to initiate resumable upload: ${initResponse.statusText}`);
      }

      const location = initResponse.headers.get('Location');
      if (!location) {
        throw new Error('Failed to get resumable upload URL');
      }

      // Step 2: Upload the file content to the session URL
      const buffer = Buffer.from(content, 'base64');
      const uploadResponse = await this.makeAuthenticatedRequest(
        location,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: buffer,
        }
      );

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
      }

      const result = await uploadResponse.json();
      await this.setDriveFileId(result.id);
      return result.id;

    } catch (error) {
      console.error('Error creating file:', error);
      throw error;
    }
  }

  async updateFile(fileId, content) {
    try {
      // For updates, we can use a simpler resumable upload, starting with a PATCH to the file's upload URL
      const initResponse = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`,
        {
          method: 'PATCH',
          // No body needed for initiation, just headers
          headers: {
             'Content-Type': 'application/json; charset=UTF-8',
          }
        }
      );

      if (!initResponse.ok) {
        throw new Error(`Failed to initiate resumable update: ${initResponse.statusText}`);
      }

      const location = initResponse.headers.get('Location');
      if (!location) {
        throw new Error('Failed to get resumable update URL');
      }

      // Step 2: Upload the new file content
      const buffer = Buffer.from(content, 'base64');
      const uploadResponse = await this.makeAuthenticatedRequest(
        location,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: buffer,
        }
      );


      if (!uploadResponse.ok) {
        throw new Error(`Failed to update file: ${uploadResponse.statusText}`);
      }

      return await uploadResponse.json();
    } catch (error) {
      console.error('Error updating file:', error);
      throw error;
    }
  }

  async downloadFile(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`
      );

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // result contains the data as a base64 encoded string, remove data url prefix
          const base64data = reader.result;
          resolve(base64data.substr(base64data.indexOf(',') + 1));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  async getFileInfo(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,modifiedTime,size&supportsAllDrives=true`
      );

      if (!response.ok) {
        throw new Error(`Failed to get file info: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }

  async deleteFile(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.statusText}`);
      }

      // Clear the stored file ID if it was the current one
      if (this.driveFileId === fileId) {
        await this.setDriveFileId(null);
      }

      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  // Search for a file by exact name and expected mime type; returns first match id or null
  async findFileIdByName(fileName) {
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Not authenticated');
      }

      const queryParts = [
        `name = '${fileName.replace(/'/g, "\\'")}'`,
        "trashed = false",
        "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
      ];

      const params = new URLSearchParams({
        q: queryParts.join(' and '),
        fields: 'files(id,name,mimeType,modifiedTime,driveId,parents)',
        spaces: 'drive',
        pageSize: '10',
        orderBy: 'modifiedTime desc',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        corpora: 'allDrives'
      });

      const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

      const response = await this.makeAuthenticatedRequest(url, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Failed to search files: ${response.statusText}`);
      }
      const data = await response.json();
      const files = Array.isArray(data.files) ? data.files : [];
      if (files.length > 0) {
        return files[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error searching file by name:', error);
      throw error;
    }
  }

  async signOut() {
    try {
      await GoogleSignin.signOut();
      await this.clearTokens();
      await this.setDriveFileId(null);
      this.isInitialized = false;
      return true;
    } catch (error) {
      console.error('Error signing out:', error);
      return false;
    }
  }
}

export default new GoogleDriveService();
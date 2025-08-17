import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file'
];

const ACCESS_TOKEN_KEY = '@cookit_access_token';
const REFRESH_TOKEN_KEY = '@cookit_refresh_token';
const TOKEN_EXPIRY_KEY = '@cookit_token_expiry';
const DRIVE_FILE_ID_KEY = '@cookit_drive_file_id';

class GoogleDriveService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.driveFileId = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return true;

    try {
      // Configure Google Sign-In
      GoogleSignin.configure({
        scopes: SCOPES,
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
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Interactive sign in
      await GoogleSignin.signIn();
      // Get tokens
      const tokens = await GoogleSignin.getTokens();
      if (tokens?.accessToken) {
        await this.storeTokensFromAccessToken(tokens.accessToken);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
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
    return this.driveFileId;
  }

  async setDriveFileId(fileId) {
    this.driveFileId = fileId;
    await AsyncStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
  }

  async createFile(fileName, content) {
    try {
      const metadata = {
        name: fileName,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['root']
      };

      const response = await this.makeAuthenticatedRequest(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/related; boundary=foo_bar_baz',
          },
          body: this.createMultipartBody(metadata, content),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create file: ${response.statusText}`);
      }

      const result = await response.json();
      await this.setDriveFileId(result.id);
      return result.id;
    } catch (error) {
      console.error('Error creating file:', error);
      throw error;
    }
  }

  async updateFile(fileId, content) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: content,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update file: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating file:', error);
      throw error;
    }
  }

  async downloadFile(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      );

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  async getFileInfo(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,modifiedTime,size`
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
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
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

  createMultipartBody(metadata, content) {
    const boundary = 'foo_bar_baz';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const close_delim = '\r\n--' + boundary + '--';

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n' +
      content +
      close_delim;

    return multipartRequestBody;
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
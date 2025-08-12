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

  async findOrCreateRecipesFile() {
    try {
      // First, try to find existing file
      const searchResponse = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files?q=name='CookIT_Recipes.json'&trashed=false`
      );

      const searchData = await searchResponse.json();

      if (searchData.files && searchData.files.length > 0) {
        this.driveFileId = searchData.files[0].id;
        await AsyncStorage.setItem(DRIVE_FILE_ID_KEY, this.driveFileId);
        return this.driveFileId;
      }

      // Create new file if not found
      const createResponse = await this.makeAuthenticatedRequest(
        'https://www.googleapis.com/drive/v3/files',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'CookIT_Recipes.json',
            parents: [], // Root folder
          }),
        }
      );

      const createData = await createResponse.json();
      this.driveFileId = createData.id;
      await AsyncStorage.setItem(DRIVE_FILE_ID_KEY, this.driveFileId);

      // Initialize with empty data
      await this.uploadRecipes([]);

      return this.driveFileId;
    } catch (error) {
      console.error('Error finding or creating recipes file:', error);
      throw error;
    }
  }

  async downloadRecipes() {
    try {
      if (!this.driveFileId) {
        await this.findOrCreateRecipesFile();
      }

      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${this.driveFileId}?alt=media`
      );

      if (response.ok) {
        const content = await response.text();
        return content ? JSON.parse(content) : [];
      } else if (response.status === 404) {
        // File doesn't exist, create it
        await this.findOrCreateRecipesFile();
        return [];
      } else {
        throw new Error(`Failed to download recipes: ${response.status}`);
      }
    } catch (error) {
      console.error('Error downloading recipes:', error);
      throw error;
    }
  }

  async uploadRecipes(recipes) {
    try {
      if (!this.driveFileId) {
        await this.findOrCreateRecipesFile();
      }

      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/upload/drive/v3/files/${this.driveFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(recipes),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to upload recipes: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Error uploading recipes:', error);
      throw error;
    }
  }

  async getFileMetadata() {
    try {
      if (!this.driveFileId) {
        await this.findOrCreateRecipesFile();
      }

      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${this.driveFileId}?fields=modifiedTime`
      );

      if (response.ok) {
        const metadata = await response.json();
        return metadata;
      }

      return null;
    } catch (error) {
      console.error('Error getting file metadata:', error);
      return null;
    }
  }
}

// Export singleton instance
export default new GoogleDriveService();
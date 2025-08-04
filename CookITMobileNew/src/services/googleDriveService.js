import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Complete redirect URI setup for Expo
WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = '609680746236-fuo5qoefnbqilcuj9p2eimebrf2k5eqo.apps.googleusercontent.com';
const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file'
];

// Storage keys for tokens
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
    this.promptAsync = null;
  }

  // Set the prompt function from the React component
  setPromptAsync(promptAsync) {
    this.promptAsync = promptAsync;
  }

  async initialize() {
    if (this.isInitialized) return true;

    try {
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

      // Check if token is valid and refresh if needed
      if (this.accessToken && this.isTokenExpired()) {
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
    return this.accessToken && !this.isTokenExpired();
  }

  isTokenExpired() {
    if (!this.tokenExpiry) return true;
    return new Date() >= this.tokenExpiry;
  }

  async authenticate() {
    try {
      if (!this.promptAsync) {
        throw new Error('Authentication not initialized. Please set promptAsync from React component.');
      }

      const result = await this.promptAsync();

      if (result.type === 'success') {
        const { authentication } = result;
        console.log('Google authentication successful!', authentication);

        // Store tokens using the authentication object from the hook
        await this.storeTokensFromAuth(authentication);
        return true;
      } else if (result.type === 'error') {
        console.error('Google authentication failed:', result.error);
        return false;
      } else {
        console.log('Authentication cancelled or dismissed');
        return false;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  async storeTokensFromAuth(authentication) {
    this.accessToken = authentication.accessToken;
    this.refreshToken = authentication.refreshToken;

    // Calculate expiry time
    if (authentication.expiresIn) {
      this.tokenExpiry = new Date(Date.now() + (authentication.expiresIn * 1000));
    } else {
      // Default to 1 hour if not provided
      this.tokenExpiry = new Date(Date.now() + (3600 * 1000));
    }

    const promises = [
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken),
      AsyncStorage.setItem(TOKEN_EXPIRY_KEY, this.tokenExpiry.toISOString()),
    ];

    if (this.refreshToken) {
      promises.push(AsyncStorage.setItem(REFRESH_TOKEN_KEY, this.refreshToken));
    }

    await Promise.all(promises);
    console.log('Tokens stored successfully');
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokenData = await response.json();

      if (response.ok) {
        await this.storeTokens(tokenData, false); // Don't update refresh token
        return true;
      } else {
        throw new Error(tokenData.error || 'Failed to refresh token');
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      await this.clearTokens();
      return false;
    }
  }

  async storeTokens(tokenData, updateRefreshToken = true) {
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000));

    if (updateRefreshToken && tokenData.refresh_token) {
      this.refreshToken = tokenData.refresh_token;
    }

    const promises = [
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken),
      AsyncStorage.setItem(TOKEN_EXPIRY_KEY, this.tokenExpiry.toISOString()),
    ];

    if (updateRefreshToken && tokenData.refresh_token) {
      promises.push(AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokenData.refresh_token));
    }

    await Promise.all(promises);
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
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    // If token expired, try to refresh and retry once
    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`,
          },
        });
      }
    }

    return response;
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
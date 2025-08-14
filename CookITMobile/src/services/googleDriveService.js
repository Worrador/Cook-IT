import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_OAUTH_CONFIG } from '../config/googleAuth';

// Complete the auth session
WebBrowser.maybeCompleteAuthSession();

const SCOPES = GOOGLE_OAUTH_CONFIG.SCOPES;

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
    this.authRequest = null;
    this.authResponse = null;
  }

  async initialize() {
    if (this.isInitialized) return true;

    try {
      // Create auth request
      this.authRequest = new AuthSession.AuthRequest({
        clientId: GOOGLE_OAUTH_CONFIG.CLIENT_ID,
        scopes: SCOPES,
        redirectUri: AuthSession.makeRedirectUri({
          scheme: 'cook-it-mobile',
          path: 'auth'
        }),
        responseType: AuthSession.ResponseType.Code,
        additionalParameters: {
          access_type: 'offline',
          prompt: 'consent'
        }
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

      // Check if we have valid tokens
      if (this.isAuthenticated() && !this.isTokenExpired()) {
        this.isInitialized = true;
        return true;
      }

      // If we have a refresh token, try to refresh
      if (this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          this.isInitialized = true;
          return true;
        }
      }

      this.isInitialized = true;
      return false;
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
      if (!this.authRequest) {
        await this.initialize();
      }

      // Start authentication
      const result = await this.authRequest.promptAsync({
        authUrl: this.authRequest.makeAuthUrlAsync()
      });

      if (result.type === 'success') {
        // Exchange authorization code for tokens
        const tokenResult = await this.exchangeCodeForTokens(result.params.code);
        if (tokenResult) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  async exchangeCodeForTokens(authCode) {
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: authCode,
          client_id: GOOGLE_OAUTH_CONFIG.CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CONFIG.CLIENT_SECRET,
          redirect_uri: this.authRequest.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.access_token) {
        await this.storeTokens(
          tokens.access_token,
          tokens.refresh_token,
          tokens.expires_in
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      return false;
    }
  }

  async refreshAccessToken() {
    try {
      if (!this.refreshToken) {
        return false;
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token: this.refreshToken,
          client_id: GOOGLE_OAUTH_CONFIG.CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CONFIG.CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.access_token) {
        await this.storeTokens(
          tokens.access_token,
          this.refreshToken, // Keep the existing refresh token
          tokens.expires_in
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      return false;
    }
  }

  async storeTokens(accessToken, refreshToken, expiresIn) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = new Date(Date.now() + (expiresIn * 1000));

    await Promise.all([
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
      AsyncStorage.setItem(TOKEN_EXPIRY_KEY, this.tokenExpiry.toISOString()),
    ]);
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
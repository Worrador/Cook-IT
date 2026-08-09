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
const GRANTED_SCOPES_KEY = '@cookit_granted_scopes';

// Google's consent screen lets the user untick individual permissions. Sign-in then
// still succeeds and still returns an access token - it just isn't allowed to touch
// Drive. Without checking what was actually granted, the app reports "connected" and
// every later sync fails with a 403. This is the one scope the app cannot work without.
const REQUIRED_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Replace with your Web application client ID from Google Cloud Console
const WEB_CLIENT_ID = '609680746236-fuo5qoefnbqilcuj9p2eimebrf2k5eqo.apps.googleusercontent.com';

class GoogleDriveService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.driveFileId = null;
    this.isInitialized = false;
    // null = not yet determined (e.g. a session from before scope checking existed).
    // An array = the scopes Google actually granted for the current access token.
    this.grantedScopes = null;
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
      const [accessToken, refreshToken, tokenExpiry, driveFileId, grantedScopes] = await Promise.all([
        AsyncStorage.getItem(ACCESS_TOKEN_KEY),
        AsyncStorage.getItem(REFRESH_TOKEN_KEY),
        AsyncStorage.getItem(TOKEN_EXPIRY_KEY),
        AsyncStorage.getItem(DRIVE_FILE_ID_KEY),
        AsyncStorage.getItem(GRANTED_SCOPES_KEY),
      ]);

      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.tokenExpiry = tokenExpiry ? new Date(tokenExpiry) : null;
      this.driveFileId = driveFileId;
      this.grantedScopes = this.parseStoredScopes(grantedScopes);

      // If signed in, try to refresh access token silently.
      // hasPreviousSignIn() replaces isSignedIn(), which was removed in v13 of
      // @react-native-google-signin/google-signin. It is synchronous, unlike the
      // promise-returning call it replaces.
      if (GoogleSignin.hasPreviousSignIn()) {
        await this.refreshAccessToken();
      }

      this.isInitialized = true;
      return this.isAuthenticated();
    } catch (error) {
      console.error('Error initializing Google Drive service:', error);
      return false;
    }
  }

  parseStoredScopes(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Ask Google which scopes an access token actually carries. Uses the public
   * tokeninfo endpoint rather than the sign-in library so it doesn't depend on the
   * shape of a particular @react-native-google-signin version. Returns null when the
   * answer can't be determined (offline, endpoint error) - callers treat null as
   * "unknown", not as "denied".
   */
  async fetchGrantedScopes(accessToken) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
      );
      if (!response.ok) return null;
      const info = await response.json();
      return typeof info?.scope === 'string' ? info.scope.split(' ').filter(Boolean) : null;
    } catch (error) {
      console.warn('Could not determine granted scopes:', error?.message || error);
      return null;
    }
  }

  /**
   * Whether the current grant actually includes Drive access.
   * An unknown grant (null) is treated as authorized so that sessions predating this
   * check, or a transient tokeninfo failure, don't lock an existing user out - a real
   * permission problem still surfaces as a 403 on the first Drive call.
   */
  hasDriveScope() {
    if (!this.grantedScopes) return true;
    return this.grantedScopes.includes(REQUIRED_DRIVE_SCOPE);
  }

  /**
   * True when the user is signed in to Google but withheld Drive permission. The UI
   * uses this to explain the situation rather than just showing "not connected".
   */
  isSignedInWithoutDriveAccess() {
    return !!this.accessToken && !this.hasDriveScope();
  }

  isAuthenticated() {
    // A token without Drive permission is not a usable connection - reporting it as
    // authenticated is what previously let the app proceed as though sync would work.
    return !!this.accessToken && this.hasDriveScope();
  }

  isTokenExpired() {
    if (!this.tokenExpiry) return true;
    return new Date() >= this.tokenExpiry;
  }

  /**
   * Verify the token actually carries Drive permission, and re-prompt once if it
   * doesn't.
   *
   * This is the recovery path for a user who unticked Drive on the consent screen.
   * A plain signIn() won't help them: they already have a Google session, so it
   * returns the same insufficient grant without showing consent again. addScopes()
   * is what re-opens the permission prompt, which is why "Connect" previously had
   * no way to escape the state once entered.
   *
   * @returns {Promise<{accessToken: string, grantedScopes: string[]|null}>}
   * @throws  {Error & {code: 'DRIVE_PERMISSION_DENIED'}} if Drive is still withheld
   */
  async ensureDriveScope(accessToken) {
    let token = accessToken;
    let grantedScopes = await this.fetchGrantedScopes(token);

    // null = couldn't determine (offline / endpoint hiccup). Don't block sign-in on
    // that; a genuine permission problem will still surface as a 403 later.
    if (!grantedScopes || grantedScopes.includes(REQUIRED_DRIVE_SCOPE)) {
      return { accessToken: token, grantedScopes };
    }

    console.warn('⚠️  Drive permission was not granted - re-requesting it');
    try {
      await GoogleSignin.addScopes({ scopes: [REQUIRED_DRIVE_SCOPE] });
      const retryTokens = await GoogleSignin.getTokens();
      if (retryTokens?.accessToken) {
        token = retryTokens.accessToken;
        grantedScopes = await this.fetchGrantedScopes(token);
      }
    } catch (error) {
      console.warn('Re-requesting Drive permission failed:', error?.message || error);
    }

    if (grantedScopes && !grantedScopes.includes(REQUIRED_DRIVE_SCOPE)) {
      // Drop the token so the app doesn't sit in a "connected but useless" state.
      await this.clearTokens();
      throw Object.assign(
        new Error(
          'Cook-IT needs permission to manage its recipe file in your Google Drive. ' +
          'You signed in, but Drive access was declined. Tap Connect again and leave ' +
          'the Google Drive permission ticked.'
        ),
        { code: 'DRIVE_PERMISSION_DENIED' }
      );
    }

    return { accessToken: token, grantedScopes };
  }

  /**
   * Re-open Google's permission prompt for Drive access on demand, for a user who is
   * already signed in but declined Drive. Safe to call from a UI retry button.
   */
  async requestDrivePermissions() {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.addScopes({ scopes: [REQUIRED_DRIVE_SCOPE] });
      const tokens = await GoogleSignin.getTokens();
      if (!tokens?.accessToken) {
        return { success: false, message: 'Could not obtain an access token from Google.' };
      }

      const grantedScopes = await this.fetchGrantedScopes(tokens.accessToken);
      await this.storeTokensFromAccessToken(tokens.accessToken, grantedScopes);

      if (grantedScopes && !grantedScopes.includes(REQUIRED_DRIVE_SCOPE)) {
        return { success: false, message: 'Drive permission is still not granted.' };
      }
      return { success: true, message: 'Google Drive permission granted.' };
    } catch (error) {
      console.error('Error requesting Drive permissions:', error);
      return { success: false, message: error?.message || 'Could not request Drive permission.' };
    }
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
        console.log('✅ Access token received, verifying granted permissions...');
        const { accessToken, grantedScopes } = await this.ensureDriveScope(tokens.accessToken);
        await this.storeTokensFromAccessToken(accessToken, grantedScopes);
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

  /**
   * @param {string} accessToken
   * @param {string[]|null|undefined} grantedScopes  Scopes Google reported for this
   *   token. `undefined` means "not looked up" and leaves any previously known set
   *   in place; `null` means "looked up but indeterminate".
   */
  async storeTokensFromAccessToken(accessToken, grantedScopes = undefined) {
    this.accessToken = accessToken;
    // Assume ~55 minutes validity and proactively refresh earlier if needed
    this.tokenExpiry = new Date(Date.now() + (55 * 60 * 1000));

    const writes = [
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken),
      AsyncStorage.setItem(TOKEN_EXPIRY_KEY, this.tokenExpiry.toISOString()),
    ];

    if (grantedScopes !== undefined) {
      this.grantedScopes = grantedScopes;
      writes.push(
        grantedScopes
          ? AsyncStorage.setItem(GRANTED_SCOPES_KEY, JSON.stringify(grantedScopes))
          : AsyncStorage.removeItem(GRANTED_SCOPES_KEY)
      );
    }

    await Promise.all(writes);
    console.log('Access token stored successfully');
  }

  async clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.grantedScopes = null;

    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(TOKEN_EXPIRY_KEY),
      AsyncStorage.removeItem(GRANTED_SCOPES_KEY),
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

  /**
   * Disconnect the app from Google Drive.
   *
   * The Google session is revoked first, but the locally stored session is cleared
   * whichever way that goes. Bailing out when GoogleSignin.signOut() throws (no Play
   * Services, an unconfigured build, no network) would leave the access token behind,
   * so the app would keep reporting itself as connected right after the user tapped
   * "Log out" - the one outcome a log-out button must never produce.
   *
   * Recipes in AsyncStorage are deliberately untouched: only the Drive link goes away.
   *
   * @returns {Promise<{success: boolean, signedOutFromGoogle?: boolean, message?: string}>}
   */
  async signOut() {
    let signedOutFromGoogle = true;
    try {
      await GoogleSignin.signOut();
    } catch (error) {
      signedOutFromGoogle = false;
      console.warn('Google sign-out failed, clearing the local session anyway:', error?.message || error);
    }

    try {
      await this.clearTokens();
      await this.setDriveFileId(null);
      this.isInitialized = false;
      return { success: true, signedOutFromGoogle };
    } catch (error) {
      console.error('Error clearing the local session on sign-out:', error);
      return { success: false, message: error?.message || 'Could not clear the stored Google session.' };
    }
  }
}

export default new GoogleDriveService();
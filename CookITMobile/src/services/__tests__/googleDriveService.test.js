// Tests for the Drive permission gating added to googleDriveService.
//
// Google's consent screen lets a user untick individual permissions. Sign-in then
// still succeeds and still returns an access token, so the app used to report
// "connected" while every Drive call would 403. These tests pin the behaviour that
// a token without the Drive scope is NOT a usable connection, and that the app can
// re-open the permission prompt afterwards.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn()
  }
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signInSilently: jest.fn(),
    // Mirrors the real v16 surface. The mock previously declared isSignedIn(), which
    // was removed from the library in v13 - so the mock was more permissive than the
    // module and hid a crash on every initialize() call.
    hasPreviousSignIn: jest.fn(() => false),
    getTokens: jest.fn(),
    addScopes: jest.fn(),
    signOut: jest.fn()
  }
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import googleDriveService from '../googleDriveService';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES_WITHOUT_DRIVE = ['openid', 'profile', 'email'];
const SCOPES_WITH_DRIVE = [...SCOPES_WITHOUT_DRIVE, DRIVE_SCOPE];

/** Make the tokeninfo endpoint report a given scope set (or fail outright). */
const mockTokenInfo = (scopes) => {
  global.fetch = jest.fn().mockResolvedValue(
    scopes
      ? { ok: true, json: async () => ({ scope: scopes.join(' ') }) }
      : { ok: false, json: async () => ({}) }
  );
};

beforeEach(() => {
  AsyncStorage.getItem.mockResolvedValue(null);
  AsyncStorage.setItem.mockResolvedValue(undefined);
  AsyncStorage.removeItem.mockResolvedValue(undefined);

  GoogleSignin.hasPlayServices.mockResolvedValue(true);
  GoogleSignin.signIn.mockResolvedValue({});
  GoogleSignin.addScopes.mockResolvedValue({});
  GoogleSignin.getTokens.mockResolvedValue({ accessToken: 'token-1' });

  // Reset the singleton's in-memory state between tests.
  googleDriveService.accessToken = null;
  googleDriveService.tokenExpiry = null;
  googleDriveService.grantedScopes = null;
});

afterEach(() => {
  delete global.fetch;
});

describe('Drive scope gating', () => {
  test('a token WITHOUT the Drive scope does not count as authenticated', () => {
    googleDriveService.accessToken = 'token-1';
    googleDriveService.grantedScopes = SCOPES_WITHOUT_DRIVE;

    expect(googleDriveService.hasDriveScope()).toBe(false);
    expect(googleDriveService.isAuthenticated()).toBe(false);
    expect(googleDriveService.isSignedInWithoutDriveAccess()).toBe(true);
  });

  test('a token WITH the Drive scope counts as authenticated', () => {
    googleDriveService.accessToken = 'token-1';
    googleDriveService.grantedScopes = SCOPES_WITH_DRIVE;

    expect(googleDriveService.isAuthenticated()).toBe(true);
    expect(googleDriveService.isSignedInWithoutDriveAccess()).toBe(false);
  });

  test('an unknown scope set stays authenticated so existing sessions are not locked out', () => {
    googleDriveService.accessToken = 'token-1';
    googleDriveService.grantedScopes = null; // e.g. session predating scope checking

    expect(googleDriveService.isAuthenticated()).toBe(true);
  });

  test('no token is never authenticated, whatever the scopes say', () => {
    googleDriveService.accessToken = null;
    googleDriveService.grantedScopes = SCOPES_WITH_DRIVE;

    expect(googleDriveService.isAuthenticated()).toBe(false);
    expect(googleDriveService.isSignedInWithoutDriveAccess()).toBe(false);
  });
});

describe('ensureDriveScope', () => {
  test('re-requests permission when Drive was declined, and succeeds if then granted', async () => {
    // First lookup: Drive missing. After addScopes, the new token has it.
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ scope: SCOPES_WITHOUT_DRIVE.join(' ') }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ scope: SCOPES_WITH_DRIVE.join(' ') }) });
    GoogleSignin.getTokens.mockResolvedValue({ accessToken: 'token-2' });

    const result = await googleDriveService.ensureDriveScope('token-1');

    expect(GoogleSignin.addScopes).toHaveBeenCalledWith({ scopes: [DRIVE_SCOPE] });
    expect(result.accessToken).toBe('token-2');
    expect(result.grantedScopes).toContain(DRIVE_SCOPE);
  });

  test('throws DRIVE_PERMISSION_DENIED and drops the token when Drive is declined twice', async () => {
    mockTokenInfo(SCOPES_WITHOUT_DRIVE); // still missing after the retry
    googleDriveService.accessToken = 'token-1';

    await expect(googleDriveService.ensureDriveScope('token-1')).rejects.toMatchObject({
      code: 'DRIVE_PERMISSION_DENIED'
    });

    // The token must not be left behind, or the app sits in a "connected but
    // useless" state with no way out.
    expect(googleDriveService.accessToken).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@cookit_access_token');
  });

  test('does not block sign-in when the granted scopes cannot be determined', async () => {
    mockTokenInfo(null); // tokeninfo unreachable

    const result = await googleDriveService.ensureDriveScope('token-1');

    expect(result.grantedScopes).toBeNull();
    expect(GoogleSignin.addScopes).not.toHaveBeenCalled();
  });
});

describe('authenticate', () => {
  test('rejects rather than reporting success when Drive permission is withheld', async () => {
    mockTokenInfo(SCOPES_WITHOUT_DRIVE);

    await expect(googleDriveService.authenticate()).rejects.toMatchObject({
      code: 'DRIVE_PERMISSION_DENIED'
    });
    expect(googleDriveService.isAuthenticated()).toBe(false);
  });

  test('stores the granted scopes alongside the token on success', async () => {
    mockTokenInfo(SCOPES_WITH_DRIVE);

    await expect(googleDriveService.authenticate()).resolves.toBe(true);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@cookit_granted_scopes',
      JSON.stringify(SCOPES_WITH_DRIVE)
    );
    expect(googleDriveService.isAuthenticated()).toBe(true);
  });
});

describe('requestDrivePermissions', () => {
  test('reports success once the user grants Drive on the re-prompt', async () => {
    mockTokenInfo(SCOPES_WITH_DRIVE);

    const result = await googleDriveService.requestDrivePermissions();

    expect(GoogleSignin.addScopes).toHaveBeenCalledWith({ scopes: [DRIVE_SCOPE] });
    expect(result.success).toBe(true);
    expect(googleDriveService.isAuthenticated()).toBe(true);
  });

  test('reports failure when the user declines again', async () => {
    mockTokenInfo(SCOPES_WITHOUT_DRIVE);

    const result = await googleDriveService.requestDrivePermissions();

    expect(result.success).toBe(false);
    expect(googleDriveService.isAuthenticated()).toBe(false);
  });
});

describe('signOut', () => {
  test('clears the stored session so the app stops reporting a connection', async () => {
    googleDriveService.accessToken = 'token-1';
    googleDriveService.grantedScopes = SCOPES_WITH_DRIVE;
    googleDriveService.driveFileId = 'file-1';
    googleDriveService.isInitialized = true;

    const result = await googleDriveService.signOut();

    expect(GoogleSignin.signOut).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(googleDriveService.isAuthenticated()).toBe(false);
    expect(googleDriveService.driveFileId).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@cookit_access_token');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@cookit_granted_scopes');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@cookit_drive_file_id');
  });

  test('still clears the local session when Google sign-out itself fails', async () => {
    // Play Services missing, no network, unconfigured build... If a failure here
    // skipped the local cleanup, the token would survive and the app would report
    // itself connected immediately after the user tapped "Log out".
    GoogleSignin.signOut.mockRejectedValueOnce(new Error('Play Services unavailable'));
    googleDriveService.accessToken = 'token-1';
    googleDriveService.grantedScopes = SCOPES_WITH_DRIVE;

    const result = await googleDriveService.signOut();

    expect(result.success).toBe(true);
    expect(result.signedOutFromGoogle).toBe(false);
    expect(googleDriveService.accessToken).toBeNull();
    expect(googleDriveService.isAuthenticated()).toBe(false);
  });

  test('reports failure when the stored session cannot be cleared', async () => {
    AsyncStorage.removeItem.mockRejectedValue(new Error('storage unavailable'));

    const result = await googleDriveService.signOut();

    expect(result.success).toBe(false);
    expect(result.message).toBe('storage unavailable');
  });
});

describe('setDriveFileId', () => {
  test('clearing the file id removes the key instead of writing null', async () => {
    await googleDriveService.setDriveFileId(null);

    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('@cookit_drive_file_id', null);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@cookit_drive_file_id');
    expect(googleDriveService.driveFileId).toBeNull();
  });
});

// Reloading the page must not sign the user out.
//
// A stored token is good for ~55 minutes and survives a reload, but boot used to
// renew unconditionally and clear everything if that renewal failed. On web the
// renewal is asked of Google Identity Services during page load, with no user
// gesture behind it - precisely the request a popup blocker refuses - so a
// working session was being thrown away by something that says nothing about
// whether the grant is still valid.
describe('surviving a page reload', () => {
  const storedSession = (expiry) => {
    AsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === '@cookit_access_token') return 'stored-token';
      if (key === '@cookit_token_expiry') return expiry;
      if (key === '@cookit_granted_scopes') return JSON.stringify(SCOPES_WITH_DRIVE);
      return null;
    });
  };

  // Built from `new Date()`, not `Date.now()`: setup.js freezes only Date.now(),
  // and isTokenExpired() compares against `new Date()` - the real clock. Mixing
  // the two makes an expiry an hour into the fake past look years expired.
  const inAnHour = () => new Date(new Date().getTime() + 60 * 60 * 1000).toISOString();
  const anHourAgo = () => new Date(new Date().getTime() - 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    googleDriveService.isInitialized = false;
    GoogleSignin.hasPreviousSignIn.mockReturnValue(true);
    mockTokenInfo(SCOPES_WITH_DRIVE);
  });

  test('a still-valid stored token is used as-is, without asking for a new one', async () => {
    storedSession(inAnHour());

    await googleDriveService.initialize();

    expect(GoogleSignin.getTokens).not.toHaveBeenCalled();
    expect(googleDriveService.isAuthenticated()).toBe(true);
  });

  test('a blocked silent renewal does not discard a token that still has time left', async () => {
    storedSession(inAnHour());
    // Force the renewal path, then have it fail the way a blocked popup does.
    googleDriveService.isInitialized = false;
    GoogleSignin.getTokens.mockRejectedValue(new Error('Popup window closed'));
    GoogleSignin.signInSilently.mockRejectedValue(new Error('Popup window closed'));

    await googleDriveService.initialize();
    const kept = await googleDriveService.refreshAccessToken();

    expect(kept).toBe(true);
    expect(googleDriveService.accessToken).toBe('stored-token');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('@cookit_access_token');
  });

  test('an expired token that cannot be renewed is cleared, so the UI stops claiming a connection', async () => {
    storedSession(anHourAgo());
    GoogleSignin.getTokens.mockRejectedValue(new Error('No live session'));
    GoogleSignin.signInSilently.mockRejectedValue(new Error('No live session'));

    await googleDriveService.initialize();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@cookit_access_token');
    expect(googleDriveService.isAuthenticated()).toBe(false);
  });

  test('an expired token is renewed on boot', async () => {
    storedSession(anHourAgo());
    GoogleSignin.getTokens.mockResolvedValue({ accessToken: 'fresh-token' });

    await googleDriveService.initialize();

    expect(GoogleSignin.getTokens).toHaveBeenCalled();
    expect(googleDriveService.accessToken).toBe('fresh-token');
  });
});

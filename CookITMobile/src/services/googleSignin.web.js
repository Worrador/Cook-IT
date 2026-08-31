// Web implementation of the Google Sign-In surface that googleDriveService.js
// depends on. Metro picks this file over googleSignin.js when bundling for web.
//
// '@react-native-google-signin/google-signin' is a native module. It bundles for
// web without erroring, but its methods don't do anything useful there, which is
// why sign-in fails with "Sync service failed to initialize" in a browser. This
// module reimplements the eight methods googleDriveService.js actually calls on
// top of Google Identity Services (GIS).
//
// IMPORTANT DIFFERENCE FROM NATIVE - no refresh tokens.
// The native library supports `offlineAccess: true`, which yields a refresh token
// and therefore an indefinitely resumable session. GIS's browser token flow
// deliberately does not: it issues short-lived access tokens (~1h) and nothing
// else. There is no way to get a refresh token from client-side JavaScript, by
// design - a refresh token in a browser can't be kept secret.
//
// What that means in practice:
//   - `configure({ offlineAccess: true })` is accepted and ignored on web.
//   - Sessions are renewed by asking GIS for a fresh token with `prompt: ''`,
//     which succeeds silently as long as the user still has a live Google session
//     in this browser and has already granted the scopes. That covers the common
//     case, so users are not re-prompted every hour.
//   - When the silent path fails (signed out of Google, consent revoked, cookies
//     cleared), the user has to press sign-in again. This is the accepted tradeoff
//     for keeping the web app fully static-hostable with no backend. Adding a
//     server-side token exchange is the alternative, and is a separate decision.
//
// SETUP REQUIRED - this will not work until the origin is registered.
// GIS refuses to issue tokens to an origin that isn't on the OAuth client's
// "Authorized JavaScript origins" list. The client ID below is the same one the
// mobile app uses (WEB_CLIENT_ID in googleDriveService.js). Whoever owns the
// Google Cloud project must add every origin the web app is served from, e.g.
// http://localhost:8081 for local dev plus the real deployed origin. Until then,
// signIn() rejects and the UI reports a failure - which is correct behaviour, not
// a bug in this file.

// Same client ID as googleDriveService.js's WEB_CLIENT_ID. Duplicated rather than
// imported because googleDriveService.js imports *this* module - importing back
// the other way would be a cycle.
const WEB_CLIENT_ID = '609680746236-fuo5qoefnbqilcuj9p2eimebrf2k5eqo.apps.googleusercontent.com';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

// hasPreviousSignIn() is called synchronously by googleDriveService.initialize(),
// so this flag has to be readable without awaiting. localStorage is synchronous;
// AsyncStorage (used everywhere else in the app) is not, hence the direct use here.
const HAS_SIGNED_IN_KEY = '@cookit_web_has_signed_in';

let scriptPromise = null;
let config = { scopes: [], clientId: WEB_CLIENT_ID };
// The token GIS last handed us. Mirrors what the native library keeps internally;
// googleDriveService.js persists its own copy to AsyncStorage separately.
let currentToken = null;
let currentTokenExpiry = 0;
let currentScopes = [];

// Treat a token as expired slightly early so a request that's about to be made
// with it doesn't land just after the real expiry.
const EXPIRY_SKEW_MS = 60 * 1000;

function loadGisScript() {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Google Identity Services requires a browser environment'));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

function setSignedInFlag(value) {
  try {
    if (value) {
      window.localStorage.setItem(HAS_SIGNED_IN_KEY, 'true');
    } else {
      window.localStorage.removeItem(HAS_SIGNED_IN_KEY);
    }
  } catch (_error) {
    // Private browsing with storage disabled - the flag is only an optimisation
    // (it decides whether to attempt a silent refresh on boot), so losing it is
    // not fatal.
  }
}

function isTokenUsable() {
  return !!currentToken && Date.now() < currentTokenExpiry - EXPIRY_SKEW_MS;
}

// Wraps GIS's callback/error_callback pair into a promise. `prompt: ''` asks for a
// silent grant; `prompt: 'consent'` forces the visible consent popup.
async function requestToken(scopes, prompt) {
  await loadGisScript();

  const scopeList = scopes && scopes.length ? scopes : config.scopes;
  const scopeString = scopeList.join(' ');

  return new Promise((resolve, reject) => {
    let settled = false;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: scopeString,
      prompt,
      callback: (response) => {
        if (settled) return;
        settled = true;
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        currentToken = response.access_token;
        // GIS reports lifetime in seconds relative to now.
        currentTokenExpiry = Date.now() + Number(response.expires_in || 3600) * 1000;
        // Google returns the scopes it actually granted, which may be narrower
        // than what was asked for if the user unticked permissions on the consent
        // screen. googleDriveService.js checks for that case separately via its
        // tokeninfo lookup, but keeping the accurate list here means addScopes()
        // requests the right union.
        currentScopes = typeof response.scope === 'string'
          ? response.scope.split(' ').filter(Boolean)
          : scopeList;
        setSignedInFlag(true);
        resolve({ accessToken: currentToken, idToken: null });
      },
      error_callback: (error) => {
        if (settled) return;
        settled = true;
        reject(new Error(error?.message || error?.type || 'Google sign-in failed'));
      },
    });

    try {
      client.requestAccessToken();
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
}

export const GoogleSignin = {
  // Native signature is configure({ scopes, webClientId, offlineAccess }).
  // `offlineAccess` is intentionally ignored - see the header comment.
  configure({ scopes, webClientId } = {}) {
    if (Array.isArray(scopes) && scopes.length) config.scopes = scopes;
    if (webClientId) config.clientId = webClientId;
  },

  // No Play Services in a browser. Resolving keeps googleDriveService.js's
  // existing `await GoogleSignin.hasPlayServices()` calls working unchanged.
  async hasPlayServices() {
    return true;
  },

  // Must stay synchronous: googleDriveService.initialize() calls it without await.
  hasPreviousSignIn() {
    try {
      return window.localStorage.getItem(HAS_SIGNED_IN_KEY) === 'true';
    } catch (_error) {
      return false;
    }
  },

  async signIn() {
    return requestToken(config.scopes, 'consent');
  },

  // Silent renewal. Throws when the user has no live Google session or has not
  // previously consented, which is what callers already expect from the native
  // signInSilently().
  async signInSilently() {
    return requestToken(currentScopes.length ? currentScopes : config.scopes, '');
  },

  async getTokens() {
    if (isTokenUsable()) {
      return { accessToken: currentToken, idToken: null };
    }
    // Cached token is missing or stale - try to renew without bothering the user.
    return requestToken(currentScopes.length ? currentScopes : config.scopes, '');
  },

  // Re-requests a token covering the union of what's already granted and what's
  // being asked for. GIS has no incremental-grant call of its own; asking for the
  // union is the documented equivalent.
  async addScopes({ scopes } = {}) {
    const requested = Array.isArray(scopes) ? scopes : [];
    const union = Array.from(new Set([...currentScopes, ...config.scopes, ...requested]));
    return requestToken(union, 'consent');
  },

  async signOut() {
    const token = currentToken;
    currentToken = null;
    currentTokenExpiry = 0;
    currentScopes = [];
    setSignedInFlag(false);

    if (!token) return;
    try {
      await loadGisScript();
      await new Promise((resolve) => {
        window.google.accounts.oauth2.revoke(token, () => resolve());
      });
    } catch (_error) {
      // Local session is already cleared above. googleDriveService.signOut()
      // deliberately clears local state even when the remote revoke fails (see
      // its comment), so swallowing this matches the native behaviour.
    }
  },
};

export default { GoogleSignin };

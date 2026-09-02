// Browser-only configuration for the web build.
//
// The Google Picker needs a "developer key" (an API key) in addition to the
// OAuth access token. Unlike the OAuth *client secret*, an API key of this kind
// is designed to be shipped in client-side code - it identifies the project, it
// does not authorise anything on its own. It should still be locked down in the
// Cloud Console with an HTTP-referrer restriction (e.g. http://localhost:8081/*
// plus the deployed origin) and an API restriction limiting it to the Picker
// API, so it can't be reused from another site.
//
// To fill this in:
//   1. Cloud Console -> APIs & Services -> Library -> enable "Google Picker API"
//   2. Credentials -> Create credentials -> API key
//   3. Restrict it: HTTP referrers + API restriction (Google Picker API only)
//
// Left empty deliberately. The "Choose Drive file" button stays disabled and
// explains why until this is set, rather than failing with an opaque Picker error.
export const GOOGLE_PICKER_API_KEY = '';

// Cloud project number, taken from the numeric prefix of the OAuth client ID
// (609680746236-... in googleDriveService.js). The Picker uses this as its appId
// so that a file the user picks is granted to THIS app under the drive.file
// scope - which is the whole reason the picker solves the "app can't see files
// it didn't create" problem.
export const GOOGLE_APP_ID = '609680746236';

export const isPickerConfigured = () => Boolean(GOOGLE_PICKER_API_KEY);

// Master switch for the "Ask Cook-IT" suggestion assistant - both the free
// on-device advisor (src/services/localAdvisor.js) and the optional Claude-backed
// one (src/services/cookAdvisor.js + the /advice endpoint on the preview proxy).
//
// Turned off for now. The code and its tests are left in place rather than
// deleted, so switching this back to true is the only change needed to bring it
// back. Nothing else references the advisor when this is false.
export const ADVISOR_ENABLED = false;

// Endpoint that fetches a recipe page and returns its image, ingredients and
// method. A browser cannot do this itself - reading another site's HTML needs
// that site to send Access-Control-Allow-Origin, and recipe sites don't.
//
// In production this is a RELATIVE path: the Cloudflare Pages Function in
// functions/api/preview.js is served from the same origin as the app, so there
// is one deployment and one URL rather than a site plus a separate proxy.
//
// In local development the app runs on :8081 where no such function exists, so
// it falls back to the standalone dev proxy (tools/preview-proxy.js) on :8791.
//
// Native builds never use any of this - React Native's fetch has no CORS, so
// the app fetches and parses recipe pages directly.
const IS_LOCAL_DEV =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location?.hostname || '') &&
  window.location?.port === '8081';

export const PREVIEW_PROXY_URL = IS_LOCAL_DEV
  ? 'http://localhost:8791'
  : '/api/preview';

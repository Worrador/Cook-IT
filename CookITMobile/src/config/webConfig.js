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

// Optional endpoint used to fetch a link's og:image for recipes that have a URL
// but no photo. See linkPreview.js for why a browser cannot do this by itself.
//
// Expected contract: GET <this>?url=<encoded page url> returning JSON with either
// { data: { image: { url } } } (microlink's shape) or { image }.
//
// Empty by default, deliberately. Whatever you point this at will receive the URL
// of every recipe your users open, which is a privacy decision worth making
// consciously. Without it, recipes fall back to a favicon-and-domain card, which
// needs no third party at all.
//
// Points at the local dev proxy (tools/preview-proxy.js). Start it with:
//   node tools/preview-proxy.js
//
// Hosted services were tried first and rejected: microlink's free tier refuses
// allrecipes.com outright ("uses antibot protection, upgrade to PRO"), and
// allrecipes is the main site these recipes use. Fetching the page directly with
// a browser User-Agent works fine, so a self-hosted proxy is both cheaper and
// more reliable here.
//
// For production, deploy tools/preview-worker.js to Cloudflare Workers and point
// this at that URL. Leaving it empty is also fine - recipes then fall back to the
// favicon-and-domain card, which needs no third party at all.
export const PREVIEW_PROXY_URL = 'http://localhost:8791';

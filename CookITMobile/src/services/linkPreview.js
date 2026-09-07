// Fallback artwork for recipes that have a link but no photo.
//
// WHAT IS AND ISN'T POSSIBLE IN A BROWSER
// Reading a page's og:image means fetching that page's HTML and parsing it. A
// browser can't do that for a third-party site: the request is blocked by CORS
// unless the site opts in, which recipe sites do not. So a pure client-side app
// physically cannot scrape og:image itself. Getting real preview artwork needs
// something server-side to do the fetch.
//
// This module therefore works in two tiers:
//
//   1. Favicon + domain (always available, no network permission needed, no data
//      shared beyond what the browser already requests). Icons are loaded from
//      Google's public favicon endpoint as a plain <img>, which needs no fetch()
//      and so isn't subject to CORS.
//
//   2. Real og:image, but only if PREVIEW_PROXY_URL is configured. That is left
//      empty by default on purpose: any such proxy - whether a hosted service
//      like microlink.io or your own worker - receives the URL of every recipe a
//      user opens. That is a real privacy decision and should be opted into, not
//      switched on silently. Hosted free tiers are also heavily rate-limited
//      (microlink is ~50 requests/day), so tier 1 remains the dependable path.
import { Platform } from 'react-native';
import { PREVIEW_PROXY_URL } from '../config/webConfig';
import { parseRecipeHtml, BROWSER_UA } from './recipeParser';

// On native there is no CORS, so the app fetches and parses the page itself and
// no server is involved. The proxy exists only for the browser build.
const IS_WEB = Platform.OS === 'web';

const ogCache = new Map();

// url -> in-flight promise. A library page renders one card per recipe and every
// card asks for its own preview, so without this the same URL is fetched once
// per component that wants it.
const inFlight = new Map();

// Each lookup makes the proxy fetch and parse a whole recipe page. Eighty cards
// firing at once queues behind the browser's per-host connection limit and
// leaves the page unresponsive, so lookups run a few at a time.
const MAX_PARALLEL = 4;
let active = 0;
const waiting = [];

function acquireSlot() {
  if (active < MAX_PARALLEL) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => { waiting.push(resolve); });
}

function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

export function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_error) {
    return null;
  }
}

/**
 * A favicon URL for the site. Rendered directly as an image source - no fetch,
 * so no CORS involvement.
 */
export function getFaviconUrl(url, size = 128) {
  const domain = getDomain(url);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Try to resolve a real og:image via the configured proxy. Resolves to null when
 * no proxy is configured, or on any failure - callers fall back to the favicon
 * treatment, so a preview never being available is a normal outcome, not an error.
 *
 * The proxy is expected to accept `?url=<encoded>` and return JSON containing an
 * image URL. Both the microlink shape ({ data: { image: { url } } }) and a flat
 * { image } shape are accepted so a self-hosted worker can stay trivial.
 */
/**
 * Fetch everything the proxy knows about a URL: og:image plus, when the page
 * publishes schema.org/Recipe JSON-LD, its ingredients and steps.
 *
 * Resolves to null when no proxy is configured or the lookup fails - callers
 * treat "no preview" as an ordinary outcome.
 *
 * @returns {Promise<{image: string|null, title: string|null, ingredients: string[],
 *                    steps: string[], totalTime: string|null, servings: string|null} | null>}
 */
export async function getPreview(url) {
  if (!url) return null;
  if (ogCache.has(url)) return ogCache.get(url);
  if (inFlight.has(url)) return inFlight.get(url);

  const request = runPreview(url).finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}

async function runPreview(url) {
  await acquireSlot();
  try {
    return await fetchPreview(url);
  } finally {
    releaseSlot();
  }
}

async function fetchPreview(url) {
  // --- native: fetch and parse in-app, no server ---------------------------
  if (!IS_WEB) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      });
      if (!response.ok) throw new Error(`Recipe page returned ${response.status}`);
      const result = parseRecipeHtml(await response.text());
      ogCache.set(url, result);
      return result;
    } catch (error) {
      ogCache.set(url, null);
      console.warn('Could not read recipe page', url, error?.message || error);
      return null;
    }
  }

  // --- web: must go through the proxy, because CORS blocks the direct fetch --
  if (!PREVIEW_PROXY_URL) return null;

  try {
    const endpoint = `${PREVIEW_PROXY_URL}${PREVIEW_PROXY_URL.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Preview lookup failed: ${response.status}`);
    const json = await response.json();

    // Accept microlink's nested shape as well as the flat shape our own proxy
    // returns, so either can be swapped in without touching callers.
    const result = {
      image: json?.data?.image?.url || json?.image || null,
      title: json?.data?.title || json?.title || null,
      ingredients: json?.ingredients || [],
      steps: json?.steps || [],
      totalTime: json?.totalTime || null,
      servings: json?.servings || null,
    };
    ogCache.set(url, result);
    return result;
  } catch (error) {
    // Cached as null so a failing URL isn't retried on every render.
    ogCache.set(url, null);
    console.warn('Link preview unavailable for', url, error?.message || error);
    return null;
  }
}

export async function getOgImage(url) {
  const preview = await getPreview(url);
  return preview?.image || null;
}

// "PT1H30M" -> "1 h 30 min". Returns null for anything unparseable so callers
// can just omit the field.
export function formatDuration(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) return null;
  const [, hours, minutes] = match;
  if (!hours && !minutes) return null;
  return [hours ? `${hours} h` : null, minutes ? `${minutes} min` : null].filter(Boolean).join(' ');
}

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
import { PREVIEW_PROXY_URL } from '../config/webConfig';

const ogCache = new Map();

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
export async function getOgImage(url) {
  if (!PREVIEW_PROXY_URL || !url) return null;
  if (ogCache.has(url)) return ogCache.get(url);

  try {
    const endpoint = `${PREVIEW_PROXY_URL}${PREVIEW_PROXY_URL.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Preview lookup failed: ${response.status}`);
    const json = await response.json();
    const image = json?.data?.image?.url || json?.image || null;
    ogCache.set(url, image);
    return image;
  } catch (error) {
    // Cached as null so a failing URL isn't retried on every render.
    ogCache.set(url, null);
    console.warn('Link preview unavailable for', url, error?.message || error);
    return null;
  }
}

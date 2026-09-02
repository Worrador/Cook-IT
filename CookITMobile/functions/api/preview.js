// Cloudflare Pages Function: GET /api/preview?url=<recipe page>
//
// This is the one piece of the web app that cannot run in the browser. Reading
// another site's HTML from JavaScript requires that site to send an
// Access-Control-Allow-Origin header; recipe sites don't, and the browser
// enforces it - no library or setting works around it. So the fetch happens
// here, server-side, and the HTML is handed to exactly the same parser the
// phone app uses.
//
// Because this is a Pages *Function*, it is deployed with the site and served
// from the same origin: the app calls a relative "/api/preview", so there is one
// deployment and one URL, not a site plus a separate proxy.
//
// On iOS/Android none of this is involved - React Native's fetch is not a
// browser and has no CORS, so the app fetches the page directly.
import { parseRecipeHtml, BROWSER_UA } from '../../src/services/recipeParser.js';

// Recipe sites serve different (or no) markup to obvious bots, so identify as a
// normal browser. This is the same UA the local dev proxy uses.
const HEADERS = {
  'Content-Type': 'application/json',
  // Same-origin in production, but keep this permissive so the local dev server
  // on :8081 can call a deployed preview endpoint while testing.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // Previews change rarely; let the browser and Cloudflare's edge hold them.
  'Cache-Control': 'public, max-age=86400',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: HEADERS });
}

export async function onRequestGet({ request }) {
  const target = new URL(request.url).searchParams.get('url');

  if (!target || !/^https?:\/\//i.test(target)) {
    return new Response(
      JSON.stringify({ error: 'A http(s) ?url= parameter is required' }),
      { status: 400, headers: HEADERS }
    );
  }

  // Edge cache, keyed by the full request URL.
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let payload;
  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
    payload = parseRecipeHtml(await upstream.text());
  } catch (error) {
    // A missing preview is an ordinary outcome, not a failure the client should
    // treat as an error - it falls back to the favicon card. Returning 200 with
    // a null image keeps that path simple.
    payload = { image: null, title: null, ingredients: [], steps: [], error: error.message };
  }

  const response = new Response(JSON.stringify(payload), { headers: HEADERS });
  if (payload.image || payload.ingredients?.length) {
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

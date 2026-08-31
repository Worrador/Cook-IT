// Production version of tools/preview-proxy.js, as a Cloudflare Worker.
//
// Same job: fetch a recipe page server-side and return its og:image, because a
// browser can't do that itself (CORS). See linkPreview.js for the full reasoning.
//
// Deploy:
//   npx wrangler deploy tools/preview-worker.js --name cookit-preview
// Then set PREVIEW_PROXY_URL in src/config/webConfig.js to the worker URL.
//
// Differences from the dev proxy:
//   - Uses the Cloudflare cache API instead of an in-memory Map, so results
//     survive across requests and isolates.
//   - Restricts which origins may call it. An open proxy that fetches arbitrary
//     URLs on request is worth locking down before it is public.
//
// UNVERIFIED: this has not been deployed or tested. The dev proxy is what was
// actually confirmed working. Worth checking in particular that recipe sites
// don't block Cloudflare's egress IPs the way they block microlink's - if they
// do, the worker returns no image and the app falls back to the favicon card.
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  // Add the deployed web app origin here.
];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    // Previews change rarely; let the browser and the edge hold onto them.
    'Cache-Control': 'public, max-age=86400',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response(JSON.stringify({ error: 'A http(s) ?url= parameter is required' }), {
        status: 400, headers,
      });
    }

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
      const html = (await upstream.text()).slice(0, 300000);
      payload = {
        image: extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image'),
        title: extractMeta(html, 'og:title'),
      };
    } catch (error) {
      // A missing preview is a normal outcome, not an error the client should
      // treat as a failure - it falls back to the favicon card.
      payload = { image: null, error: error.message };
    }

    const response = new Response(JSON.stringify(payload), { headers });
    if (payload.image) await cache.put(cacheKey, response.clone());
    return response;
  },
};

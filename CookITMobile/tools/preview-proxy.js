// Minimal link-preview proxy for local development.
//
// A browser can't read another site's og:image: fetching third-party HTML is
// blocked by CORS and recipe sites don't opt in. So something server-side has to
// do the fetch. This is that something, in its smallest useful form.
//
// Hosted services are not a good fit here - microlink's free tier refuses
// allrecipes.com outright ("uses antibot protection, upgrade to PRO"), which is
// exactly the site these recipes use. Fetching the page directly with a normal
// browser User-Agent returns 200 and the og:image tag is present in the initial
// HTML, so a proxy of our own works where the hosted service doesn't.
//
// Run:  node tools/preview-proxy.js
// Then set PREVIEW_PROXY_URL in src/config/webConfig.js to http://localhost:8787
//
// For production use tools/preview-worker.js (same logic, Cloudflare Worker).
//
// NOTE: this is a dev tool. It has no auth and no rate limiting, and it will
// fetch any URL it is handed - do not expose it to the internet as-is.
const http = require('http');

// 8787 is a common default for other local dev tools, so this uses a less
// contested port. Override with PREVIEW_PROXY_PORT if it clashes.
const PORT = process.env.PREVIEW_PROXY_PORT || 8791;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Successful lookups are cached in memory so repeated renders of the same recipe
// card don't refetch the page. Cleared on restart, which is fine for a dev tool.
const cache = new Map();

function extractMeta(html, property) {
  // Attribute order varies between sites, so try property-first and content-first.
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

async function lookup(target) {
  if (cache.has(target)) return cache.get(target);

  const response = await fetch(target, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);

  // og:image lives in <head>; no need to parse megabytes of body markup.
  const html = (await response.text()).slice(0, 300000);

  const result = {
    image: extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image'),
    title: extractMeta(html, 'og:title'),
  };
  cache.set(target, result);
  return result;
}

http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const target = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('url');
  if (!target || !/^https?:\/\//i.test(target)) {
    res.writeHead(400, cors);
    res.end(JSON.stringify({ error: 'A http(s) ?url= parameter is required' }));
    return;
  }

  // Resolve BEFORE touching the response: writing headers first and then
  // awaiting means a failed lookup hits the catch with headers already sent,
  // which throws ERR_HTTP_HEADERS_SENT and takes the whole process down.
  let payload;
  try {
    payload = await lookup(target);
  } catch (error) {
    // A null image is a normal outcome, not an error status - the client falls
    // back to the favicon card when no preview is available.
    payload = { image: null, error: error.message };
  }

  res.writeHead(200, cors);
  res.end(JSON.stringify(payload));
}).listen(PORT, () => {
  console.log(`Link preview proxy listening on http://localhost:${PORT}`);
});

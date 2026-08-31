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

// Kept identical to tools/preview-proxy.js - see the commentary there. Sites put
// HTML inside schema.org text fields, and sometimes several paragraphs in one
// step, so tags are stripped and block boundaries become step breaks.
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&rsquo;|&#0?39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/gi, '&');
}

function stripHtml(value) {
  return decodeEntities(
    String(value ?? '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(p|div|li|ol|ul|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function toSteps(value) {
  return stripHtml(value).split('\n').map(s => s.trim()).filter(Boolean);
}

function normaliseInstructions(instructions) {
  if (!instructions) return [];
  if (typeof instructions === 'string') return toSteps(instructions);
  if (!Array.isArray(instructions)) return [];

  const steps = [];
  for (const entry of instructions) {
    if (typeof entry === 'string') {
      steps.push(...toSteps(entry));
    } else if (entry?.['@type'] === 'HowToSection' && Array.isArray(entry.itemListElement)) {
      for (const child of entry.itemListElement) {
        const text = typeof child === 'string' ? child : child?.text;
        if (text) steps.push(...toSteps(text));
      }
    } else if (entry?.text) {
      steps.push(...toSteps(entry.text));
    }
  }
  return steps.filter(Boolean);
}

function extractRecipeLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch (_error) {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
    for (const node of nodes) {
      const types = [].concat(node?.['@type'] || []);
      if (!types.includes('Recipe')) continue;
      return {
        ingredients: (node.recipeIngredient || node.ingredients || []).map(stripHtml).filter(Boolean),
        steps: normaliseInstructions(node.recipeInstructions),
        totalTime: node.totalTime || null,
        servings: Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield || null,
      };
    }
  }
  return null;
}

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
      const recipe = extractRecipeLd(html);
      payload = {
        image: extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image'),
        title: extractMeta(html, 'og:title'),
        ingredients: recipe?.ingredients || [],
        steps: recipe?.steps || [],
        totalTime: recipe?.totalTime || null,
        servings: recipe?.servings || null,
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

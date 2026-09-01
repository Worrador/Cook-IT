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

// The Anthropic SDK is loaded lazily and optionally: the preview proxy must keep
// working for people who never set up an API key. A missing key is a normal
// configuration state, not an error.
let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (_error) {
  Anthropic = null;
}

// The API key lives here, server-side, and never reaches the browser. That is
// the whole reason the advice endpoint is on the proxy rather than in the app:
// a key shipped in client JavaScript is a published key.
const anthropic = (Anthropic && process.env.ANTHROPIC_API_KEY)
  ? new (Anthropic.default || Anthropic)()
  : null;

const ADVISOR_SYSTEM = `You are a friendly, practical cook helping someone decide what to make next from their own recipe book.

You will be given their recipes with, for each one, how long ago they last cooked it and how many times they have made it.

Guidance:
- Recommend from the list you are given. Never invent recipes they do not have.
- Favour things they have neglected, but say why in terms a person would find useful ("you have not made this since the spring") rather than quoting statistics back at them.
- Notice patterns worth mentioning: a rut, a favourite that has slipped, something never tried.
- Be brief and warm. Two or three sentences of overall advice, then your picks.
- Do not moralise about diet, health, or variety unless they ask.

Reply with JSON only, no markdown fence, in exactly this shape:
{"advice": "<2-3 sentences>", "picks": [{"name": "<exact recipe name>", "reason": "<one short sentence>"}]}

Give between one and three picks.`;

function summariseForModel(recipes, lastCooked, cookCounts) {
  return recipes.map(recipe => {
    const last = lastCooked?.[recipe.name];
    const days = last
      ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
      : null;
    return {
      name: recipe.name,
      note: recipe.comment || undefined,
      lastCookedDaysAgo: days,
      timesCooked: cookCounts?.[recipe.name] || 0,
    };
  });
}

async function getAdvice({ recipes, lastCooked, cookCounts, mood }) {
  if (!anthropic) {
    const reason = !Anthropic
      ? 'The @anthropic-ai/sdk package is not installed.'
      : 'ANTHROPIC_API_KEY is not set on the proxy.';
    const error = new Error(`Cook-IT's advisor is not configured. ${reason}`);
    error.code = 'NOT_CONFIGURED';
    throw error;
  }

  const summary = summariseForModel(recipes, lastCooked, cookCounts);
  const userText = [
    mood ? `What they said they feel like: ${mood}` : null,
    `Their recipe book (${summary.length} recipes):`,
    JSON.stringify(summary),
  ].filter(Boolean).join('\n\n');

  const response = await anthropic.messages.create({
    // Haiku 4.5 ($1/$5 per MTok) rather than Opus 5 ($5/$25), chosen because the
    // user asked for the cheapest workable option. This task is small and
    // well-specified - pick from a supplied list and explain briefly - which is
    // exactly the shape a small model handles well.
    //
    // No `thinking` and no `output_config.effort` here, for two reasons: this
    // task doesn't need deliberation, and Haiku 4.5 rejects `effort` outright
    // (it predates the adaptive-thinking/effort API). Thinking tokens are billed
    // as output, so omitting them is most of the saving.
    model: 'claude-haiku-4-5',
    // Deliberately small: the reply is 2-3 sentences plus up to three picks.
    // Enough headroom that it never truncates mid-JSON.
    max_tokens: 1024,
    system: ADVISOR_SYSTEM,
    messages: [{ role: 'user', content: userText }],
  });

  if (response.stop_reason === 'refusal') {
    const error = new Error('The advisor declined to answer that.');
    error.code = 'REFUSED';
    throw error;
  }

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();

  // Asked for bare JSON, but tolerate a stray markdown fence rather than failing
  // the whole request over formatting.
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // Reported back so the cost of the feature is visible rather than guessed at.
  // Haiku 4.5: $1 per MTok input, $5 per MTok output.
  const usage = response.usage || {};
  const cost =
    ((usage.input_tokens || 0) / 1e6) * 1 +
    ((usage.output_tokens || 0) / 1e6) * 5;

  try {
    const parsed = JSON.parse(jsonText);
    return {
      advice: parsed.advice || '',
      picks: Array.isArray(parsed.picks) ? parsed.picks : [],
      usage: { ...usage, estimatedCostUsd: cost },
    };
  } catch (_error) {
    // Prose is still useful even if the JSON contract slipped.
    return { advice: text, picks: [], usage: { ...usage, estimatedCostUsd: cost } };
  }
}

function readJsonBody(req, limitBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

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

// Parsing lives in src/services/recipeParser.js and is shared with the app, so
// there is one implementation rather than a copy here and another in the worker.
// Loaded via dynamic import because that module is ESM and this file is CommonJS.
let parserPromise = null;
function getParser() {
  if (!parserPromise) parserPromise = import('../src/services/recipeParser.js');
  return parserPromise;
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

  const { parseRecipeHtml } = await getParser();
  const result = parseRecipeHtml(html);
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

  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Tells the client whether the advisor is usable, so the UI can hide the
  // feature rather than offering a button that always fails.
  if (requestUrl.pathname === '/advice/status') {
    res.writeHead(200, cors);
    res.end(JSON.stringify({ configured: Boolean(anthropic) }));
    return;
  }

  if (requestUrl.pathname === '/advice' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      res.writeHead(400, cors);
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    try {
      const result = await getAdvice(payload);
      res.writeHead(200, cors);
      res.end(JSON.stringify(result));
    } catch (error) {
      // 503 for "not configured" so the client can distinguish setup from failure.
      const status = error.code === 'NOT_CONFIGURED' ? 503 : 502;
      res.writeHead(status, cors);
      res.end(JSON.stringify({ error: error.message, code: error.code || null }));
    }
    return;
  }

  const target = requestUrl.searchParams.get('url');
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

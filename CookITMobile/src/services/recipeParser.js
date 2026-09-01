// Recipe page parsing - shared by every caller, so there is exactly one
// implementation of it in the project.
//
// WHY THIS IS SHARED RATHER THAN SERVER-ONLY
// Fetching a recipe page needs different plumbing per platform, but *parsing* it
// does not:
//
//   - On native (iOS/Android), React Native's fetch is not a browser and is not
//     subject to CORS, so the app fetches the page itself and parses it right
//     here. No server involved at all.
//   - In a browser, fetching another site's HTML is blocked by CORS - the site
//     would have to opt in with Access-Control-Allow-Origin, and recipe sites
//     don't. So the web build routes the fetch through a small proxy, which then
//     calls these same functions.
//
// The proxy therefore exists solely to work around a browser restriction, not
// because parsing needs a server. Both tools/preview-proxy.js and
// tools/preview-worker.js import this module rather than reimplementing it -
// previously the logic was copy-pasted into both and had to be kept in step by
// hand.

// Sites embed HTML inside schema.org text fields even though the spec says plain
// text, and some pack several paragraphs into one step.
const ENTITIES = [
  [/&nbsp;/gi, ' '],
  [/&quot;/gi, '"'],
  [/&apos;|&rsquo;|&#0?39;/gi, "'"],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
];

export function decodeEntities(text) {
  let out = String(text ?? '');
  for (const [pattern, replacement] of ENTITIES) out = out.replace(pattern, replacement);
  out = out.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  // Ampersand last: doing it first would turn "&amp;lt;" into a real "<".
  return out.replace(/&amp;/gi, '&');
}

// Block-level closers become newlines first so paragraph boundaries survive as
// step breaks; every other tag is dropped.
export function stripHtml(value) {
  return decodeEntities(
    String(value ?? '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(p|div|li|ol|ul|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function toSteps(value) {
  return stripHtml(value).split('\n').map(s => s.trim()).filter(Boolean);
}

export function extractMeta(html, property) {
  // Attribute order varies between sites, so try property-first and content-first.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]);
  }
  return null;
}

// recipeInstructions is the least consistent field in the schema: a plain string,
// an array of strings, an array of HowToStep objects, or HowToSection objects
// wrapping nested steps. Flatten all four to an array of strings.
export function normaliseInstructions(instructions) {
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

// Most recipe sites publish schema.org/Recipe as JSON-LD because it drives
// Google's recipe cards, which is what makes parsing arbitrary sites viable.
export function extractRecipeLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];

  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch (_error) {
      continue; // Malformed JSON-LD is common; skip rather than fail the page.
    }

    // A page may ship a bare object, an array, or an @graph wrapper.
    const nodes = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
    for (const node of nodes) {
      const types = [].concat(node?.['@type'] || []);
      if (!types.includes('Recipe')) continue;

      return {
        ingredients: (node.recipeIngredient || node.ingredients || [])
          .map(stripHtml)
          .filter(Boolean),
        steps: normaliseInstructions(node.recipeInstructions),
        totalTime: node.totalTime || null,
        servings: Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield || null,
      };
    }
  }
  return null;
}

/**
 * Turn a page's HTML into everything the app wants from it.
 * Pure - takes HTML, returns data. The caller decides how the HTML was obtained.
 */
export function parseRecipeHtml(html) {
  // og:image lives in <head>; no need to scan megabytes of body markup.
  const head = String(html ?? '').slice(0, 300000);
  const recipe = extractRecipeLd(head);
  return {
    image: extractMeta(head, 'og:image') || extractMeta(head, 'twitter:image'),
    title: extractMeta(head, 'og:title'),
    ingredients: recipe?.ingredients || [],
    steps: recipe?.steps || [],
    totalTime: recipe?.totalTime || null,
    servings: recipe?.servings || null,
  };
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

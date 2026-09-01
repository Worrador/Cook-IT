// Client for the LLM-backed "what should I cook?" advisor.
//
// The model call happens on the proxy (tools/preview-proxy.js), never here.
// That is not an architectural preference - an API key shipped in client-side
// JavaScript is a published API key. Anyone who opens devtools has it, and it
// bills to your account. So the browser talks to the proxy, and only the proxy
// holds the credential.
//
// The advisor is optional. When the proxy has no key configured, isAdvisorAvailable()
// returns false and the UI hides the feature rather than offering a button that
// always fails.
//
// PRIVACY: asking for advice sends recipe names, notes, and cooking dates to
// Anthropic's API. That is a real disclosure and the reason this is an explicit
// user action rather than something that runs on load.
import { PREVIEW_PROXY_URL } from '../config/webConfig';

function endpoint(path) {
  return `${PREVIEW_PROXY_URL.replace(/\/+$/, '')}${path}`;
}

export async function isAdvisorAvailable() {
  if (!PREVIEW_PROXY_URL) return false;
  try {
    const response = await fetch(endpoint('/advice/status'));
    if (!response.ok) return false;
    const json = await response.json();
    return Boolean(json.configured);
  } catch (_error) {
    // Proxy not running, or an older build without the endpoint.
    return false;
  }
}

/**
 * Ask for a recommendation.
 *
 * @param {object[]} recipes
 * @param {Object<string,string>} lastCooked  name -> ISO date
 * @param {Object<string,number>} cookCounts  name -> times cooked
 * @param {string} [mood] optional free text, e.g. "something quick" / "we have guests"
 * @returns {Promise<{advice: string, picks: {name: string, reason: string}[]}>}
 */
export async function askForAdvice(recipes, lastCooked, cookCounts, mood) {
  const response = await fetch(endpoint('/advice'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Only what the advice needs: names, notes, and timing. No images, no URLs.
    body: JSON.stringify({
      recipes: recipes.map(r => ({ name: r.name, comment: r.comment })),
      lastCooked,
      cookCounts,
      mood: mood || undefined,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || `The advisor failed (${response.status}).`);
  }
  return { advice: json.advice || '', picks: json.picks || [] };
}

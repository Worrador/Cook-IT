// A free, offline "what should I cook?" advisor.
//
// Produces the same shape as the LLM advisor ({ advice, picks }) from the data
// the app already has, using rules rather than a model. No API key, no network
// call, no cost, and - the part that actually matters - no sending your recipe
// history to a third party.
//
// It is not as good as the model at reading a free-text mood, and it will never
// surprise you. But for the common case ("what have I been neglecting?") the
// answer is essentially deterministic, and paying a per-request fee to compute
// it would be silly. The LLM advisor stays available as an opt-in upgrade for
// when you want something more conversational.
import { weightFor } from './suggestion';

const DAY = 86400000;

function daysSince(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return Number.isFinite(days) ? days : null;
}

function phraseAge(days) {
  if (days === null) return 'never cooked';
  if (days <= 0) return 'cooked today';
  if (days === 1) return 'cooked yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return 'over a year ago';
}

// Very rough intent matching on the free-text hint. Deliberately shallow - this
// is the one place the model is genuinely better, and pretending otherwise with
// a pile of regexes would be worse than admitting the limit.
const MOOD_HINTS = [
  { test: /quick|fast|easy|simple|weeknight|30|hurry/i, match: /quick|fast|easy|simple|weeknight|one.?pot|30/i },
  { test: /guest|party|friends|impress|special|dinner party/i, match: /roast|slow|showstopper|impress|special|fancy/i },
  { test: /veg|vegetarian|meat.?free|vegan/i, match: /veg|tofu|lentil|bean|mushroom|paneer|chickpea/i },
  { test: /health|light|fresh|salad/i, match: /salad|fish|light|fresh|grill/i },
  { test: /comfort|cosy|cozy|warm|stew|winter/i, match: /stew|pie|roast|soup|curry|bake|casserole/i },
];

function moodFilter(recipes, mood) {
  if (!mood?.trim()) return { matched: recipes, usedMood: false };

  for (const hint of MOOD_HINTS) {
    if (!hint.test.test(mood)) continue;
    const matched = recipes.filter(r =>
      hint.match.test(`${r.name} ${r.comment || ''}`)
    );
    if (matched.length) return { matched, usedMood: true };
  }
  return { matched: recipes, usedMood: false };
}

/**
 * @returns {{advice: string, picks: {name: string, reason: string}[], source: 'local'}}
 */
export function adviseLocally(recipes, lastCooked = {}, cookCounts = {}, mood = '') {
  if (!recipes?.length) {
    return {
      advice: 'Your recipe book is empty — add a few recipes and I can start making suggestions.',
      picks: [],
      source: 'local',
    };
  }

  const { matched, usedMood } = moodFilter(recipes, mood);
  const pool = matched.length ? matched : recipes;

  const ranked = [...pool]
    .map(recipe => ({
      recipe,
      weight: weightFor(recipe, lastCooked),
      days: daysSince(lastCooked[recipe.name]),
      count: cookCounts[recipe.name] || 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  const neverCooked = ranked.filter(entry => entry.days === null);
  // A recipe cooked several times but not recently - a favourite that slipped.
  const lapsedFavourite = ranked.find(entry => entry.count >= 3 && entry.days !== null && entry.days > 45);

  const picks = [];
  const seen = new Set();
  const add = (entry, reason) => {
    if (!entry || seen.has(entry.recipe.name) || picks.length >= 3) return;
    seen.add(entry.recipe.name);
    picks.push({ name: entry.recipe.name, reason });
  };

  if (neverCooked.length) {
    add(neverCooked[0], "you've never actually made this one");
  }
  if (lapsedFavourite) {
    add(lapsedFavourite, `an old favourite — ${entry_count(lapsedFavourite)}, but last made ${phraseAge(lapsedFavourite.days)}`);
  }
  for (const entry of ranked) {
    if (picks.length >= 3) break;
    add(entry, entry.days === null ? 'still untried' : `last cooked ${phraseAge(entry.days)}`);
  }

  // Headline: lead with whatever is most notable about the current state.
  const cookedRecently = Object.values(lastCooked)
    .filter(date => daysSince(date) !== null && daysSince(date) <= 14).length;

  let advice;
  if (usedMood) {
    advice = `Going by what you asked for, here's what fits from your book — leaning towards things you haven't made in a while.`;
  } else if (neverCooked.length >= 3) {
    advice = `You've got ${neverCooked.length} recipes you've never actually cooked. Might be worth clearing a couple off the list.`;
  } else if (lapsedFavourite) {
    advice = `Nothing urgent, but a couple of old favourites have quietly dropped off the rotation.`;
  } else if (cookedRecently >= 5) {
    advice = `You've been cooking plenty lately. Here's what's been sitting untouched the longest.`;
  } else {
    advice = `Here's what you're most overdue to cook, based on how long it's been.`;
  }

  return { advice, picks, source: 'local' };
}

function entry_count(entry) {
  return entry.count === 1 ? 'cooked once' : `cooked ${entry.count} times`;
}

// Recipe suggestion weighting, shared by every surface that picks a recipe:
// the phone screen (App.js), the web screen (WebHome.js), and the vote deck
// (VoteSession.js). Keeping it in one place matters - if two clients weighted
// differently they would recommend different things from identical data.
//
// The idea is the one the original desktop app had and the React Native rewrite
// lost: a recipe's chance of being suggested grows with how long it has been
// since it was last cooked. Cook_IT.py did this with recency scores decayed by 5
// per cook; this expresses it directly in days, which needs no stored state
// beyond the last-cooked dates the app already keeps.

// Never-cooked recipes outrank everything. They're what a user most plausibly
// wants reminding of, and they have no history to age.
export const NEVER_COOKED_WEIGHT = 120;

// Past roughly three months, extra staleness stops meaning anything - a recipe
// untouched for a year isn't four times more urgent than one untouched for three
// months, and without a cap a single ancient recipe would dominate every draw.
export const MAX_DAYS = 90;

/**
 * @param {{name: string}} recipe
 * @param {Object<string, string>} lastCookedDates name -> ISO date
 * @returns {number} Relative likelihood of being suggested. Always > 0.
 */
export function weightFor(recipe, lastCookedDates = {}) {
  const last = lastCookedDates[recipe?.name];
  if (!last) return NEVER_COOKED_WEIGHT;

  const days = (Date.now() - new Date(last).getTime()) / 86400000;
  // An unparseable date is treated as "no history" rather than crashing the draw.
  if (!Number.isFinite(days)) return NEVER_COOKED_WEIGHT;

  // The +1 floor keeps something cooked today unlikely rather than impossible.
  return Math.min(Math.max(days, 0), MAX_DAYS) + 1;
}

/**
 * Weighted random draw from a pool.
 * @returns {object|null} null only when the pool is empty.
 */
export function pickWeighted(pool, lastCookedDates = {}) {
  if (!pool || pool.length === 0) return null;

  const weights = pool.map(recipe => weightFor(recipe, lastCookedDates));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let ticket = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return pool[i];
  }
  // Only reachable through floating-point drift on the final subtraction.
  return pool[pool.length - 1];
}

/**
 * The N most "overdue" recipes, highest weight first.
 *
 * Used to build a vote deck: voting works better over a short, genuinely
 * relevant shortlist than over an entire recipe book, and a deterministic
 * ordering means everyone in a vote sees the same cards in the same order.
 */
export function topByWeight(recipes, lastCookedDates = {}, limit = 20) {
  return [...(recipes || [])]
    .map(recipe => ({ recipe, weight: weightFor(recipe, lastCookedDates) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(entry => entry.recipe);
}

/**
 * Tally a completed vote.
 *
 * Rules:
 *  - Unanimous yes wins outright. With two people that's the "it's a match!" case.
 *  - Otherwise the most yes-votes wins - democracy, as asked for.
 *  - Ties break toward the more overdue recipe, reusing the same weighting.
 *
 * @param {Object<string, string[]>} votesByVoter voter name -> array of recipe names they approved
 * @param {object[]} deck the recipes that were voted on
 * @returns {{winner: object|null, unanimous: boolean, ranked: {recipe: object, yes: number}[]}}
 */
export function tallyVotes(votesByVoter, deck, lastCookedDates = {}) {
  const voters = Object.keys(votesByVoter);
  const voterCount = voters.length;

  const ranked = deck
    .map(recipe => ({
      recipe,
      yes: voters.filter(voter => votesByVoter[voter].includes(recipe.name)).length,
    }))
    .filter(entry => entry.yes > 0)
    .sort((a, b) =>
      b.yes - a.yes ||
      weightFor(b.recipe, lastCookedDates) - weightFor(a.recipe, lastCookedDates)
    );

  const winner = ranked.length ? ranked[0].recipe : null;

  // A "match" requires at least two people to agree. With a single voter,
  // `yes === voterCount` is trivially true - which would announce "It's a match!
  // All 1 said yes", i.e. congratulate someone for agreeing with themselves.
  const unanimous = Boolean(ranked.length && voterCount >= 2 && ranked[0].yes === voterCount);

  return { winner, unanimous, ranked, voterCount };
}

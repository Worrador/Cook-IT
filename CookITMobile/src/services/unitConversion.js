// Convert US cooking units to metric.
//
// Recipe sites are overwhelmingly American, so ingredient lines arrive full of
// cups, ounces and Fahrenheit. This rewrites them in place, keeping the rest of
// the line intact.
//
// Deliberate limits, because silent wrongness in a recipe is worse than no
// conversion at all:
//
//  - Volume-to-weight is NOT attempted. A cup of flour and a cup of honey weigh
//    wildly different amounts, and guessing would produce confidently wrong
//    quantities. Cups become millilitres, never grams.
//  - Only units with an unambiguous match are touched. "1 large onion" and
//    "a pinch of salt" pass through untouched.
//  - Results are rounded the way a cook would: to 5 ml / 5 g steps at small
//    sizes, coarser as amounts grow. 236.588 ml of stock helps nobody.

const ML_PER = {
  cup: 236.588,
  tablespoon: 14.787,
  teaspoon: 4.929,
  'fluid ounce': 29.574,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

const G_PER = {
  ounce: 28.3495,
  pound: 453.592,
};

// Longest-first so "fluid ounce" wins over "ounce", and plurals/abbreviations
// resolve to one canonical key.
const UNIT_ALIASES = [
  ['fluid ounces', 'fluid ounce'], ['fluid ounce', 'fluid ounce'],
  ['fl. oz.', 'fluid ounce'], ['fl oz', 'fluid ounce'], ['floz', 'fluid ounce'],
  ['tablespoons', 'tablespoon'], ['tablespoon', 'tablespoon'],
  ['tbsps', 'tablespoon'], ['tbsp', 'tablespoon'], ['tbs', 'tablespoon'],
  ['teaspoons', 'teaspoon'], ['teaspoon', 'teaspoon'],
  ['tsps', 'teaspoon'], ['tsp', 'teaspoon'],
  ['cups', 'cup'], ['cup', 'cup'],
  ['pints', 'pint'], ['pint', 'pint'],
  ['quarts', 'quart'], ['quart', 'quart'],
  ['gallons', 'gallon'], ['gallon', 'gallon'],
  ['pounds', 'pound'], ['pound', 'pound'], ['lbs', 'pound'], ['lb', 'pound'],
  ['ounces', 'ounce'], ['ounce', 'ounce'], ['oz', 'ounce'],
];

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

/** Round to something a cook would actually measure. */
export function roundSensibly(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 10) return Math.round(value);
  if (value < 100) return Math.round(value / 5) * 5;
  if (value < 1000) return Math.round(value / 10) * 10;
  return Math.round(value / 50) * 50;
}

function parseAmount(text) {
  if (!text) return null;
  let total = 0;
  let matched = false;

  // "1 1/2", "1½", "1.5", "½"
  //
  // The (?!\s*\/) lookahead is load-bearing: without it the whole-number group
  // swallows the "1" of "1/2", the fraction group then finds only "/2" and
  // matches nothing, and half a cup silently becomes a full cup. "1 1/2" still
  // works - after the leading 1 comes a space then a digit, not a slash.
  const mixed = text.match(
    /^\s*(\d+(?:[.,]\d+)?(?!\s*\/))?\s*(\d+\/\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?/
  );
  if (!mixed) return null;

  if (mixed[1]) { total += parseFloat(mixed[1].replace(',', '.')); matched = true; }
  if (mixed[2]) {
    const [n, d] = mixed[2].split('/').map(Number);
    if (d) { total += n / d; matched = true; }
  }
  if (mixed[3]) { total += UNICODE_FRACTIONS[mixed[3]] || 0; matched = true; }

  return matched && Number.isFinite(total) && total > 0 ? total : null;
}

/**
 * Rewrite one ingredient line in metric.
 * Returns the line unchanged when there is nothing unambiguous to convert.
 */
export function convertIngredientToMetric(line) {
  if (typeof line !== 'string' || !line.trim()) return line;

  for (const [alias, canonical] of UNIT_ALIASES) {
    // Amount, then the unit as a whole word. \b doesn't work after a "." in
    // "fl. oz.", so the trailing boundary is handled by the alias list ordering
    // plus an explicit lookahead for a non-letter.
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `^(\\s*)((?:\\d+(?:[.,]\\d+)?\\s*)?(?:\\d+\\/\\d+)?\\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]?)\\s*${escaped}(?![a-z])`,
      'i'
    );

    const match = line.match(pattern);
    if (!match) continue;

    const amount = parseAmount(match[2]);
    if (amount === null) continue;

    const rest = line.slice(match[0].length).replace(/^[\s.]+/, '');

    if (ML_PER[canonical]) {
      const ml = roundSensibly(amount * ML_PER[canonical]);
      // Past a litre, litres read better than four digits of millilitres.
      const measure = ml >= 1000 && ml % 100 === 0
        ? `${(ml / 1000).toFixed(1).replace(/\.0$/, '')} l`
        : `${ml} ml`;
      return `${match[1]}${measure}${rest ? ' ' + rest : ''}`;
    }

    if (G_PER[canonical]) {
      const grams = roundSensibly(amount * G_PER[canonical]);
      const measure = grams >= 1000 && grams % 100 === 0
        ? `${(grams / 1000).toFixed(1).replace(/\.0$/, '')} kg`
        : `${grams} g`;
      return `${match[1]}${measure}${rest ? ' ' + rest : ''}`;
    }
  }

  return line;
}

/**
 * Rewrite Fahrenheit temperatures and inch measurements inside a method step.
 * Both forms are kept where the original showed both, so "425 degrees F (220
 * degrees C)" doesn't end up saying 220 C twice.
 */
export function convertStepToMetric(step) {
  if (typeof step !== 'string') return step;

  return step
    // "425 degrees F (220 degrees C)" -> keep only the Celsius the site gave.
    .replace(/(\d+)\s*(?:degrees?\s*F|°\s*F)\b\s*\((\d+)\s*(?:degrees?\s*C|°\s*C)\)/gi,
      (_, __, c) => `${c}°C`)
    // A bare Fahrenheit value -> convert, rounded to 5°C like an oven dial.
    .replace(/(\d+)\s*(?:degrees?\s*F\b|°\s*F\b)/gi, (_, f) => {
      const c = Math.round(((Number(f) - 32) * 5 / 9) / 5) * 5;
      return `${c}°C`;
    })
    .replace(/(\d+(?:\.\d+)?)\s*(?:inches|inch|")\b/gi, (_, inches) => {
      const cm = Math.round(Number(inches) * 2.54);
      return `${cm} cm`;
    });
}

/** True when a line contains something this module would change. */
export function hasImperialUnits(lines = []) {
  return lines.some(line => convertIngredientToMetric(line) !== line);
}

// Rescales recipe ingredient lines for a different number of servings.
//
// Ingredients arrive as free text from schema.org JSON-LD ("0.5 cup unsalted
// butter", "1 (9 inch) double-crust pie pastry", "2-3 cloves garlic"), so this
// works by finding the leading quantity, scaling it, and leaving the rest of the
// line untouched. Anything without a leading quantity - "Salt to taste" - passes
// through unchanged, which is the correct behaviour rather than a limitation.
//
// Deliberately conservative: it only touches a number at the START of the line.
// Scaling every number found would corrupt things like "1 (9 inch) pie pastry"
// into a 4.5-inch tin, or turn "heat to 180 C" into nonsense.

// Unicode fractions appear in plenty of recipe sites' markup.
const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅐': 1 / 7, '⅛': 0.125,
  '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Values worth rendering as fractions rather than decimals - "½ cup" reads far
// better than "0.5 cup" on a recipe card.
const NICE_FRACTIONS = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

const FRACTION_TOLERANCE = 0.02;

/**
 * Read a leading quantity. Handles "2", "0.5", "1/2", "1 1/2", "½", "1½",
 * and ranges like "2-3" (in which case both ends are returned).
 *
 * @returns {{value: number, endValue: number|null, rest: string}|null}
 */
export function parseLeadingQuantity(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trimStart();

  // Number (optionally with a following fraction), or a bare unicode fraction.
  // The (?!\s*\/) lookahead is essential: without it the whole-number group
  // greedily takes the "1" of "1/2", the fraction alternative then fails to
  // match the leftover "/2", and the line parses as 1 rather than a half.
  // "1 1/2" still works - after the leading 1 comes a space and a digit, not a
  // slash, so the lookahead passes and the fraction group takes "1/2".
  const pattern = new RegExp(
    '^(\\d+(?:[.,]\\d+)?(?!\\s*\\/))?\\s*' +  // whole/decimal part
    '(\\d+\\/\\d+|[' + Object.keys(UNICODE_FRACTIONS).join('') + '])?' +
    '(?:\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?))?'   // optional range end
  );

  const match = trimmed.match(pattern);
  if (!match || (!match[1] && !match[2])) return null;

  const toNumber = (whole, fraction) => {
    let total = 0;
    if (whole) total += parseFloat(whole.replace(',', '.'));
    if (fraction) {
      if (UNICODE_FRACTIONS[fraction] !== undefined) {
        total += UNICODE_FRACTIONS[fraction];
      } else {
        const [num, den] = fraction.split('/').map(Number);
        if (den) total += num / den;
      }
    }
    return total;
  };

  const value = toNumber(match[1], match[2]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const endValue = match[3] ? parseFloat(match[3].replace(',', '.')) : null;

  return {
    value,
    endValue: Number.isFinite(endValue) ? endValue : null,
    rest: trimmed.slice(match[0].length).trimStart(),
  };
}

/**
 * Render a number the way a recipe would: whole numbers plain, common fractions
 * as glyphs, everything else rounded to at most two decimals.
 */
export function formatQuantity(value) {
  if (!Number.isFinite(value) || value <= 0) return '';

  const whole = Math.floor(value + 1e-9);
  const remainder = value - whole;

  if (remainder < FRACTION_TOLERANCE) return String(whole);

  for (const [fractionValue, glyph] of NICE_FRACTIONS) {
    if (Math.abs(remainder - fractionValue) < FRACTION_TOLERANCE) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }

  // Not a tidy fraction: two decimals, trailing zeros stripped.
  const rounded = value < 10 ? value.toFixed(2) : value.toFixed(1);
  return rounded.replace(/\.?0+$/, '');
}

/**
 * Scale a single ingredient line.
 * Lines with no leading quantity are returned untouched.
 */
export function scaleIngredient(line, factor) {
  if (!Number.isFinite(factor) || factor <= 0) return line;
  if (Math.abs(factor - 1) < 1e-9) return line;

  const parsed = parseLeadingQuantity(line);
  if (!parsed) return line;

  const scaled = formatQuantity(parsed.value * factor);
  const scaledEnd = parsed.endValue ? formatQuantity(parsed.endValue * factor) : null;
  const quantity = scaledEnd ? `${scaled}-${scaledEnd}` : scaled;

  return parsed.rest ? `${quantity} ${parsed.rest}` : quantity;
}

/**
 * Pull a serving count out of schema.org's recipeYield, which is inconsistent:
 * "8", "Serves 4", "4 servings", "1 (9-inch) pie".
 *
 * @returns {number|null} null when no sensible count is present, in which case
 *          callers should not offer scaling at all rather than guess.
 */
export function parseServings(recipeYield) {
  if (typeof recipeYield === 'number') {
    return Number.isFinite(recipeYield) && recipeYield > 0 ? recipeYield : null;
  }
  if (typeof recipeYield !== 'string') return null;

  const match = recipeYield.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;

  const value = parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

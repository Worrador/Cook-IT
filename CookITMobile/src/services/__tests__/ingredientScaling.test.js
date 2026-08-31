import {
  parseLeadingQuantity, formatQuantity, scaleIngredient, parseServings,
} from '../ingredientScaling';

describe('parseLeadingQuantity', () => {
  test('reads whole numbers and decimals', () => {
    expect(parseLeadingQuantity('8 small apples')).toMatchObject({ value: 8, rest: 'small apples' });
    expect(parseLeadingQuantity('0.5 cup butter')).toMatchObject({ value: 0.5, rest: 'cup butter' });
  });

  test('reads written and unicode fractions', () => {
    expect(parseLeadingQuantity('1/2 cup milk').value).toBeCloseTo(0.5);
    expect(parseLeadingQuantity('½ cup milk').value).toBeCloseTo(0.5);
    expect(parseLeadingQuantity('1 1/2 cups flour').value).toBeCloseTo(1.5);
  });

  test('reads ranges', () => {
    const parsed = parseLeadingQuantity('2-3 cloves garlic');
    expect(parsed.value).toBe(2);
    expect(parsed.endValue).toBe(3);
    expect(parsed.rest).toBe('cloves garlic');
  });

  test('returns null when there is no leading quantity', () => {
    expect(parseLeadingQuantity('Salt to taste')).toBeNull();
    expect(parseLeadingQuantity('')).toBeNull();
    expect(parseLeadingQuantity(undefined)).toBeNull();
  });
});

describe('formatQuantity', () => {
  test('whole numbers stay plain', () => {
    expect(formatQuantity(4)).toBe('4');
  });

  test('common fractions render as glyphs rather than decimals', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(1.5)).toBe('1½');
  });

  test('awkward values fall back to decimals without trailing zeros', () => {
    expect(formatQuantity(2.4)).toBe('2.4');
  });
});

describe('scaleIngredient', () => {
  test('doubles a quantity', () => {
    expect(scaleIngredient('0.5 cup unsalted butter', 2)).toBe('1 cup unsalted butter');
    expect(scaleIngredient('8 small Granny Smith apples, or as needed', 2))
      .toBe('16 small Granny Smith apples, or as needed');
  });

  test('halves into a readable fraction', () => {
    expect(scaleIngredient('3 tablespoons all-purpose flour', 0.5)).toBe('1½ tablespoons all-purpose flour');
  });

  test('leaves lines without a quantity alone', () => {
    expect(scaleIngredient('Salt and pepper to taste', 3)).toBe('Salt and pepper to taste');
  });

  test('scales both ends of a range', () => {
    expect(scaleIngredient('2-3 cloves garlic', 2)).toBe('4-6 cloves garlic');
  });

  test('only touches the leading number, never sizes in the description', () => {
    // The classic failure: scaling every number turns a 9 inch tin into a 4.5
    // inch one. The tin size must survive untouched.
    expect(scaleIngredient('1 (9 inch) double-crust pie pastry, thawed', 0.5))
      .toBe('½ (9 inch) double-crust pie pastry, thawed');
  });

  test('a factor of 1 is a no-op that preserves the original text exactly', () => {
    const line = '0.5 cup white sugar';
    expect(scaleIngredient(line, 1)).toBe(line);
  });

  test('invalid factors leave the line untouched', () => {
    expect(scaleIngredient('2 eggs', 0)).toBe('2 eggs');
    expect(scaleIngredient('2 eggs', NaN)).toBe('2 eggs');
  });
});

describe('parseServings', () => {
  test('reads plain and prefixed counts', () => {
    expect(parseServings('8')).toBe(8);
    expect(parseServings(4)).toBe(4);
    expect(parseServings('Serves 6')).toBe(6);
    expect(parseServings('4 servings')).toBe(4);
  });

  test('returns null when there is no count to scale against', () => {
    expect(parseServings('a loaf')).toBeNull();
    expect(parseServings(null)).toBeNull();
    expect(parseServings(undefined)).toBeNull();
  });
});

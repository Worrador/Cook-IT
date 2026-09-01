import {
  convertIngredientToMetric, convertStepToMetric, roundSensibly, hasImperialUnits,
} from '../unitConversion';

describe('convertIngredientToMetric', () => {
  test('converts cups to millilitres', () => {
    expect(convertIngredientToMetric('1 cup water')).toBe('240 ml water');
  });

  test('handles decimals, written fractions and unicode fractions alike', () => {
    expect(convertIngredientToMetric('0.5 cup white sugar')).toBe('120 ml white sugar');
    expect(convertIngredientToMetric('1/2 cup milk')).toBe('120 ml milk');
    expect(convertIngredientToMetric('½ cup milk')).toBe('120 ml milk');
    expect(convertIngredientToMetric('1 1/2 cups flour')).toBe('350 ml flour');
  });

  test('converts spoons', () => {
    expect(convertIngredientToMetric('3 tablespoons all-purpose flour')).toBe('45 ml all-purpose flour');
    expect(convertIngredientToMetric('1 tsp salt')).toBe('5 ml salt');
  });

  test('weight ounces become grams', () => {
    expect(convertIngredientToMetric('12 ounce salmon fillet')).toBe('340 g salmon fillet');
    expect(convertIngredientToMetric('1 lb beef')).toBe('450 g beef');
  });

  test('fluid ounces become millilitres, not grams', () => {
    // "fluid ounce" must beat the shorter "ounce" alias, or a volume turns into
    // a weight - the kind of error that ruins a recipe silently.
    expect(convertIngredientToMetric('8 fluid ounces stock')).toBe('240 ml stock');
    expect(convertIngredientToMetric('8 fl oz stock')).toBe('240 ml stock');
  });

  test('large volumes render as litres', () => {
    expect(convertIngredientToMetric('1 gallon water')).toBe('3.8 l water');
  });

  test('lines with no convertible unit are untouched', () => {
    expect(convertIngredientToMetric('1 large onion, diced')).toBe('1 large onion, diced');
    expect(convertIngredientToMetric('Salt and pepper to taste')).toBe('Salt and pepper to taste');
    expect(convertIngredientToMetric('2 cloves garlic')).toBe('2 cloves garlic');
  });

  test('does not fire on words that merely start with a unit name', () => {
    // "cupcake" is not "cup".
    expect(convertIngredientToMetric('2 cupcakes')).toBe('2 cupcakes');
  });

  test('never invents a weight from a volume', () => {
    // A cup of flour and a cup of honey weigh very different amounts, so cups
    // must always become millilitres.
    const result = convertIngredientToMetric('2 cups flour');
    expect(result).toMatch(/ml/);
    expect(result).not.toMatch(/\bg\b/);
  });

  test('handles a missing amount gracefully', () => {
    expect(convertIngredientToMetric('cup of tea')).toBe('cup of tea');
    expect(convertIngredientToMetric('')).toBe('');
  });
});

describe('convertStepToMetric', () => {
  test('keeps the site-supplied Celsius when both are given', () => {
    expect(convertStepToMetric('Preheat the oven to 425 degrees F (220 degrees C).'))
      .toBe('Preheat the oven to 220°C.');
  });

  test('converts a bare Fahrenheit value, rounded like an oven dial', () => {
    expect(convertStepToMetric('Bake at 350 degrees F until golden.'))
      .toBe('Bake at 175°C until golden.');
    expect(convertStepToMetric('Heat to 400°F.')).toBe('Heat to 205°C.');
  });

  test('converts inches to centimetres', () => {
    expect(convertStepToMetric('Use a 9 inch tin.')).toBe('Use a 23 cm tin.');
    expect(convertStepToMetric('Cut into 2 inches pieces.')).toBe('Cut into 5 cm pieces.');
  });

  test('leaves a step with nothing to convert alone', () => {
    const step = 'Mince the shallot and add to a small bowl.';
    expect(convertStepToMetric(step)).toBe(step);
  });
});

describe('roundSensibly', () => {
  test('rounds to amounts a cook can measure', () => {
    expect(roundSensibly(4.9)).toBe(5);
    expect(roundSensibly(47)).toBe(45);
    expect(roundSensibly(236.588)).toBe(240);
    expect(roundSensibly(3785.41)).toBe(3800);
  });
});

describe('hasImperialUnits', () => {
  test('detects whether offering the toggle is worthwhile', () => {
    expect(hasImperialUnits(['1 cup water', '2 eggs'])).toBe(true);
    expect(hasImperialUnits(['2 eggs', 'Salt to taste'])).toBe(false);
    expect(hasImperialUnits([])).toBe(false);
  });
});

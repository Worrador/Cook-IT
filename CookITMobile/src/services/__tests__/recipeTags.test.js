import { deriveTags, collectTags, filterRecipes } from '../recipeTags';

const recipe = (name, comment = '', url = '') => ({ name, comment, url });

describe('deriveTags', () => {
  test('tags cuisine from the recipe name', () => {
    expect(deriveTags(recipe('Spaghetti Carbonara'))).toContain('Italian');
    expect(deriveTags(recipe('Chicken Tikka Masala'))).toContain('Indian');
    expect(deriveTags(recipe('Beef Tacos'))).toContain('Mexican');
  });

  test('a recipe can carry several tags', () => {
    const tags = deriveTags(recipe('Chicken Tikka Masala'));
    expect(tags).toEqual(expect.arrayContaining(['Indian', 'Chicken']));
  });

  test('reads the note as well as the name', () => {
    expect(deriveTags(recipe('Mum&apos;s Sunday Thing', 'A slow roast lamb, needs 3 hours')))
      .toEqual(expect.arrayContaining(['Roast', 'Lamb']));
  });

  test('uses the URL path, which often names the dish', () => {
    const tags = deriveTags(recipe('Weeknight Dinner', '', 'https://www.bbcgoodfood.com/recipes/thai-green-curry'));
    expect(tags).toEqual(expect.arrayContaining(['Thai']));
  });

  test('ignores the host, so one site does not tag every recipe alike', () => {
    // "allrecipes.com" contains "rice"-ish noise and a shared host must not
    // become a category.
    const a = deriveTags(recipe('Plain Thing', '', 'https://www.allrecipes.com/recipe/1/plain-thing/'));
    expect(a).toEqual([]);
  });

  test('returns nothing for an unrecognisable recipe rather than guessing', () => {
    expect(deriveTags(recipe('Nan&apos;s Special'))).toEqual([]);
    expect(deriveTags(null)).toEqual([]);
  });

  test('survives a malformed URL', () => {
    expect(() => deriveTags(recipe('Soup', '', 'not a url'))).not.toThrow();
    expect(deriveTags(recipe('Soup', '', 'not a url'))).toContain('Soup');
  });
});

describe('collectTags', () => {
  const book = [
    recipe('Spaghetti Carbonara'),
    recipe('Lasagne'),
    recipe('Chicken Curry'),
    recipe('Chicken Soup'),
    recipe('Beef Tacos'),
  ];

  test('counts tags across the book, most common first', () => {
    const tags = collectTags(book);
    const chicken = tags.find(t => t.tag === 'Chicken');
    expect(chicken.count).toBe(2);
    // Sorted descending by count.
    expect(tags[0].count).toBeGreaterThanOrEqual(tags[tags.length - 1].count);
  });

  test('drops tags matching a single recipe', () => {
    // A chip that narrows to one item is a search, not a filter.
    const tags = collectTags(book).map(t => t.tag);
    expect(tags).not.toContain('Mexican'); // only Beef Tacos
    expect(tags).toContain('Chicken');     // two recipes
  });

  test('an empty book yields no tags', () => {
    expect(collectTags([])).toEqual([]);
    expect(collectTags(undefined)).toEqual([]);
  });
});

describe('filterRecipes', () => {
  const book = [
    recipe('Chicken Curry', 'mild'),
    recipe('Chicken Soup', 'for colds'),
    recipe('Spaghetti Carbonara', 'needs guanciale'),
  ];

  test('text search matches name and note', () => {
    expect(filterRecipes(book, { query: 'chicken' })).toHaveLength(2);
    expect(filterRecipes(book, { query: 'guanciale' })).toHaveLength(1);
  });

  test('text search is case-insensitive', () => {
    expect(filterRecipes(book, { query: 'CHICKEN' })).toHaveLength(2);
  });

  test('multiple tags are ANDed, not ORed', () => {
    // Stacking filters should narrow, which is what people expect.
    const both = filterRecipes(book, { tags: ['Chicken', 'Indian'] });
    expect(both.map(r => r.name)).toEqual(['Chicken Curry']);
  });

  test('text and tags combine', () => {
    const result = filterRecipes(book, { query: 'soup', tags: ['Chicken'] });
    expect(result.map(r => r.name)).toEqual(['Chicken Soup']);
  });

  test('no filters returns everything', () => {
    expect(filterRecipes(book, {})).toHaveLength(3);
    expect(filterRecipes(book)).toHaveLength(3);
  });
});

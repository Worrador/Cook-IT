import { adviseLocally } from '../localAdvisor';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const recipe = (name, comment) => ({ name, comment });

describe('adviseLocally', () => {
  test('handles an empty recipe book without pretending to advise', () => {
    const result = adviseLocally([], {}, {});
    expect(result.picks).toHaveLength(0);
    expect(result.advice).toMatch(/empty/i);
  });

  test('leads with something never cooked', () => {
    const recipes = [recipe('Old Faithful'), recipe('Untried Thing')];
    const result = adviseLocally(recipes, { 'Old Faithful': daysAgo(3) }, {});
    expect(result.picks[0].name).toBe('Untried Thing');
    expect(result.picks[0].reason).toMatch(/never/i);
  });

  test('surfaces a lapsed favourite', () => {
    const recipes = [recipe('Weekly Curry'), recipe('Recent Thing')];
    const result = adviseLocally(
      recipes,
      { 'Weekly Curry': daysAgo(120), 'Recent Thing': daysAgo(1) },
      { 'Weekly Curry': 8, 'Recent Thing': 1 }
    );
    const curry = result.picks.find(p => p.name === 'Weekly Curry');
    expect(curry).toBeDefined();
    expect(curry.reason).toMatch(/favourite/i);
    expect(curry.reason).toMatch(/8 times/);
  });

  test('never returns more than three picks', () => {
    const recipes = Array.from({ length: 10 }, (_, i) => recipe(`Recipe ${i}`));
    const result = adviseLocally(recipes, {}, {});
    expect(result.picks.length).toBeLessThanOrEqual(3);
  });

  test('does not repeat a recipe across picks', () => {
    const recipes = [recipe('A'), recipe('B'), recipe('C')];
    const result = adviseLocally(recipes, { A: daysAgo(300) }, { A: 5 });
    const names = result.picks.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('a mood hint narrows the pool when something matches', () => {
    const recipes = [recipe('Slow Roast Lamb'), recipe('Quick Weeknight Pasta')];
    const result = adviseLocally(recipes, {}, {}, 'something quick please');
    expect(result.picks[0].name).toBe('Quick Weeknight Pasta');
  });

  test('an unmatchable mood falls back to the whole book rather than returning nothing', () => {
    const recipes = [recipe('Lamb'), recipe('Pasta')];
    const result = adviseLocally(recipes, {}, {}, 'something involving unicorns');
    expect(result.picks.length).toBeGreaterThan(0);
  });

  test('picks only ever name recipes that exist', () => {
    const recipes = [recipe('Real One'), recipe('Also Real')];
    const result = adviseLocally(recipes, {}, {}, 'quick');
    const names = new Set(recipes.map(r => r.name));
    for (const pick of result.picks) {
      expect(names.has(pick.name)).toBe(true);
    }
  });
});

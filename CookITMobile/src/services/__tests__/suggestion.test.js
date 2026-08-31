import { weightFor, topByWeight, tallyVotes, NEVER_COOKED_WEIGHT, MAX_DAYS } from '../suggestion';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const recipe = (name) => ({ name });

describe('weightFor', () => {
  test('never-cooked recipes outrank everything else', () => {
    expect(weightFor(recipe('new'), {})).toBe(NEVER_COOKED_WEIGHT);
    // Even a recipe at the staleness cap stays below a never-cooked one.
    expect(weightFor(recipe('old'), { old: daysAgo(365) })).toBeLessThan(NEVER_COOKED_WEIGHT);
  });

  test('weight grows with time since last cooked', () => {
    const fresh = weightFor(recipe('a'), { a: daysAgo(1) });
    const stale = weightFor(recipe('a'), { a: daysAgo(30) });
    expect(stale).toBeGreaterThan(fresh);
  });

  test('staleness is capped so one ancient recipe cannot dominate', () => {
    const threeMonths = weightFor(recipe('a'), { a: daysAgo(MAX_DAYS) });
    const threeYears = weightFor(recipe('a'), { a: daysAgo(MAX_DAYS * 12) });
    expect(threeYears).toBe(threeMonths);
  });

  test('something cooked today is unlikely but not impossible', () => {
    expect(weightFor(recipe('a'), { a: daysAgo(0) })).toBeGreaterThan(0);
  });

  test('an unparseable date is treated as no history rather than throwing', () => {
    expect(weightFor(recipe('a'), { a: 'not-a-date' })).toBe(NEVER_COOKED_WEIGHT);
  });
});

describe('topByWeight', () => {
  test('returns the most overdue recipes first, limited to the deck size', () => {
    const recipes = [recipe('fresh'), recipe('ancient'), recipe('never')];
    const dates = { fresh: daysAgo(1), ancient: daysAgo(200) };

    const deck = topByWeight(recipes, dates, 2);
    expect(deck.map(r => r.name)).toEqual(['never', 'ancient']);
  });

  test('does not mutate the caller array', () => {
    const recipes = [recipe('b'), recipe('a')];
    const before = recipes.map(r => r.name);
    topByWeight(recipes, {}, 10);
    expect(recipes.map(r => r.name)).toEqual(before);
  });
});

describe('tallyVotes', () => {
  const deck = [recipe('pasta'), recipe('curry'), recipe('soup')];

  test('unanimous agreement is a match', () => {
    const result = tallyVotes(
      { '0:Ann': ['pasta'], '1:Bo': ['pasta'] },
      deck
    );
    expect(result.winner.name).toBe('pasta');
    expect(result.unanimous).toBe(true);
  });

  test('a single voter is never a match', () => {
    // Agreeing with yourself is not a match. Without the >= 2 guard this
    // reported "It's a match! All 1 said yes."
    const result = tallyVotes({ '0:Ann': ['pasta'] }, deck);
    expect(result.winner.name).toBe('pasta');
    expect(result.unanimous).toBe(false);
    expect(result.voterCount).toBe(1);
  });

  test('majority wins when there is no clean sweep', () => {
    const result = tallyVotes(
      { '0:Ann': ['curry'], '1:Bo': ['curry'], '2:Cy': ['soup'] },
      deck
    );
    expect(result.winner.name).toBe('curry');
    expect(result.unanimous).toBe(false);
  });

  test('ties break toward the more overdue recipe', () => {
    const result = tallyVotes(
      { '0:Ann': ['pasta'], '1:Bo': ['curry'] },
      deck,
      { pasta: daysAgo(2), curry: daysAgo(60) }
    );
    // One vote each; curry has been waiting far longer.
    expect(result.winner.name).toBe('curry');
  });

  test('no winner when nobody approves anything', () => {
    const result = tallyVotes({ '0:Ann': [], '1:Bo': [] }, deck);
    expect(result.winner).toBeNull();
    expect(result.unanimous).toBe(false);
  });

  test('recipes nobody voted for are excluded from the ranking', () => {
    const result = tallyVotes({ '0:Ann': ['soup'], '1:Bo': [] }, deck);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].recipe.name).toBe('soup');
  });

  test('two voters who share a name still count separately', () => {
    // Index-prefixed keys are what make this work; without them the second
    // blank-named voter would overwrite the first and a 1-1 split would
    // register as unanimous.
    const result = tallyVotes(
      { '0:Cook 1': ['pasta'], '1:Cook 1': [] },
      deck
    );
    expect(result.unanimous).toBe(false);
    expect(result.ranked[0].yes).toBe(1);
  });
});

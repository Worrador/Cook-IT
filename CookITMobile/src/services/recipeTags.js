// Derive filter tags from the recipes you already have.
//
// There is no tagging UI and no per-recipe category field, and adding one would
// mean asking people to re-file a recipe book they've already built. Instead
// tags are inferred from what's already there: the recipe name, your note, and
// the site it came from.
//
// This is keyword matching, not understanding. It will miss things and will
// occasionally mislabel one - "Turkey Chilli" is not Turkish. So tags are only
// ever used to *filter* a list you can still search by text; nothing is stored
// on the recipe and nothing is shown as authoritative.

// Ordered roughly specific -> general. A recipe can carry several tags.
const RULES = [
  // --- cuisines ---
  ['Italian', /pasta|spaghetti|carbonara|lasagn|risotto|pizza|bolognese|pesto|parmigian|gnocchi|tiramisu|focaccia|ravioli|linguine|penne|marinara/i],
  ['Asian', /stir.?fry|noodle|ramen|teriyaki|soy sauce|sesame|dumpling|bao|katsu|udon|miso|wok|szechuan|sichuan|kung pao|satay|pho|banh|sushi|tempura/i],
  ['Indian', /curry|tikka|masala|biryani|dahl|dhal|daal|paneer|naan|tandoori|korma|vindaloo|samosa|chana|saag/i],
  ['Thai', /thai|pad thai|green curry|red curry|lemongrass|coconut milk/i],
  ['Mexican', /taco|burrito|enchilada|quesadilla|fajita|salsa|guacamole|chilli con|chili con|nachos|tortilla/i],
  ['French', /ratatouille|bourguignon|coq au vin|cassoulet|quiche|crepe|croissant|gratin|confit|béarnaise|hollandaise/i],
  ['Greek', /greek|moussaka|souvlaki|tzatziki|feta|gyros|halloumi/i],
  ['Spanish', /paella|tapas|chorizo|tortilla espanola|gazpacho|patatas/i],
  ['Middle Eastern', /hummus|falafel|shawarma|tagine|harissa|za'?atar|tahini|couscous|halloumi|baba ganoush/i],

  // --- dish types ---
  ['Soup', /soup|broth|chowder|bisque|ramen|pho/i],
  ['Salad', /salad|slaw|tabbouleh/i],
  ['Dessert', /cake|pie|tart|brownie|cookie|biscuit|pudding|ice cream|cheesecake|crumble|mousse|dessert|sweet|chocolate|custard/i],
  ['Baking', /bread|dough|sourdough|focaccia|scone|muffin|pastry|bun|roll|bake/i],
  ['Breakfast', /breakfast|pancake|waffle|omelette|omelet|granola|porridge|oats|brunch|egg/i],
  ['Roast', /roast|slow.?cook|braise|casserole|stew|hotpot|pot roast/i],
  ['Grill', /grill|barbecue|bbq|skewer|kebab|griddle/i],

  // --- main ingredient ---
  ['Chicken', /chicken|poultry|turkey/i],
  ['Beef', /beef|steak|mince|brisket|bourguignon/i],
  ['Pork', /pork|bacon|sausage|ham|chorizo|gammon/i],
  ['Lamb', /lamb|mutton/i],
  ['Fish', /fish|salmon|tuna|cod|haddock|mackerel|trout|seafood|prawn|shrimp|scallop|mussel|crab|lobster/i],
  ['Vegetarian', /vegetarian|veggie|vegan|tofu|lentil|chickpea|aubergine|eggplant|mushroom|halloumi|paneer|bean/i],
];

/**
 * Tags for one recipe, derived from its name, note, and source domain.
 * @returns {string[]}
 */
export function deriveTags(recipe) {
  if (!recipe) return [];

  // The URL is included because a domain often names the cuisine
  // ("bbcgoodfood.com/recipes/thai-green-curry"), but only the path - the host
  // alone would tag every recipe from one site identically.
  let urlPart = '';
  try {
    if (recipe.url) urlPart = new URL(recipe.url).pathname.replace(/[-_/]/g, ' ');
  } catch (_error) {
    urlPart = '';
  }

  const haystack = `${recipe.name || ''} ${recipe.comment || ''} ${urlPart}`;

  const tags = [];
  for (const [tag, pattern] of RULES) {
    if (pattern.test(haystack)) tags.push(tag);
  }
  return tags;
}

/**
 * Every tag present across a recipe book, with counts, most common first.
 * Tags matching only one recipe are dropped - a filter that narrows to a single
 * item is a search, not a filter, and a wall of one-use chips is noise.
 *
 * @returns {{tag: string, count: number}[]}
 */
export function collectTags(recipes, { minCount = 2 } = {}) {
  const counts = new Map();
  for (const recipe of recipes || []) {
    for (const tag of deriveTags(recipe)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Filter by free text and/or selected tags.
 *
 * Multiple tags are AND-ed: picking "Chicken" and "Asian" means both, which is
 * how people expect stacked filters to behave when narrowing a list.
 */
export function filterRecipes(recipes, { query = '', tags = [] } = {}) {
  const needle = query.trim().toLowerCase();

  return (recipes || []).filter(recipe => {
    if (needle) {
      const haystack = `${recipe.name || ''} ${recipe.comment || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (tags.length) {
      const recipeTags = deriveTags(recipe);
      if (!tags.every(tag => recipeTags.includes(tag))) return false;
    }
    return true;
  });
}

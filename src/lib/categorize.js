// Automatic categories, so lists organize themselves.
// Rules are checked in order and the first match wins, which is how
// "Canned chicken" lands in Pantry and "Avocado oil spray" isn't produce.

export const AISLES = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen',
  'Snacks', 'Drinks', 'Spices & Sauces', 'Health', 'Household', 'Pet', 'Other',
];

const AISLE_RULES = [
  ['Pet', ['dog ', 'dog', 'cat food', 'cat litter', 'pet ']],
  ['Household', ['paper towel', 'toilet paper', 'paper plate', 'paper bowl', 'parchment', 'foil', 'trash bag', 'detergent', 'soap', 'napkin', 'ziploc', 'sponge', 'tissue', 'cleaner']],
  ['Health', ['preworkout', 'pre-workout', 'protein powder', 'creatine', 'vitamin', 'supplement', 'electrolyte']],
  ['Frozen', ['frozen', 'ice cream']],
  ['Snacks', ['chips', 'fritos', 'popcorn', 'cookie', 'biscoff', 'pretzel', 'oreo', 'protein bar', ' bars', 'rice cake', 'jello', 'cracker', 'candy', 'chocolate', 'gummies']],
  ['Spices & Sauces', ['seasoning', 'salt', 'cinnamon', 'mustard', 'ketchup', 'mayo', 'ranch', 'sauce', 'syrup', 'honey', 'sweetener', 'monk fruit', 'dressing', 'bachan', 'the blend', 'garlic', 'paprika', 'oregano', 'cumin', 'salsa', 'hot sauce', 'vinegar']],
  ['Pantry', ['canned', 'oil', 'spray', 'rice', 'pasta', 'pancake', 'pb2', 'peanut butter', 'pie filling', 'flour', 'oats', 'oatmeal', 'cereal', 'pickle', 'beans', 'soup', 'noodle', 'granola']],
  ['Drinks', ['water', 'juice', 'soda', 'coffee', ' tea', 'enhancer', 'mio', 'sparkling', 'gatorade', 'kombucha', 'energy drink']],
  ['Dairy & Eggs', ['yogurt', 'oikos', 'cottage', 'cheese', 'milk', 'egg', 'butter', 'cream', 'kefir']],
  ['Meat & Seafood', ['chicken', 'turkey', 'beef', 'steak', 'sirloin', 'pork', 'salmon', 'fish', 'tuna', 'shrimp', 'sausage', 'bacon', 'ground', 'jerky', 'ham']],
  ['Bakery', ['bread', 'tortilla', 'bun', 'bagel', 'sourdough', 'english muffin', 'wrap', 'roll']],
  ['Produce', ['fruit', 'banana', 'strawberr', 'kiwi', 'cuties', 'potato', 'vegetable', 'veggie', 'avocado', 'lettuce', 'spinach', 'onion', 'tomato', 'berr', 'apple', 'orange', 'grape', 'lemon', 'lime', 'broccoli', 'carrot', 'cucumber', 'salad', 'mushroom', 'pepper']],
];

export function aisleFor(name) {
  const n = ' ' + String(name || '').toLowerCase() + ' ';
  for (const [aisle, words] of AISLE_RULES) if (words.some((w) => n.includes(w))) return aisle;
  return 'Other';
}

export const WANT_CATEGORIES = ['Clothing', 'Kitchen', 'Home', 'Tech', 'Other'];

// Section headings that are really categories, not brands.
const GROUP_CATEGORY = {
  cooking: 'Kitchen', kitchen: 'Kitchen', bed: 'Home', bedding: 'Home', bath: 'Home', home: 'Home', furniture: 'Home',
  tvs: 'Tech', tv: 'Tech', electronics: 'Tech', tech: 'Tech', gaming: 'Tech', clothes: 'Clothing', clothing: 'Clothing',
};
const BRAND_CATEGORY = [
  ['Clothing', ['barbour', 'bonobos', 'charles tyrwhitt', 'charles trywhitt', 'j.crew', 'jcrew', 'jiffy', 'mack weldon', 'quince', 'suit supply', 'suitsupply', 'thursday', 'true classic', 'wiesmade', 'vuori', 'lululemon', 'patagonia', 'uniqlo', 'tailoring', 'l.l.bean', 'll bean']],
  ['Tech', ['apple', 'lg', 'samsung', 'sony', 'raspberry']],
];
const NAME_CATEGORY = [
  ['Tech', [' tv', 'oled', 'raspberry pi', 'monitor', 'laptop', 'headphone', 'airpods', 'iphone', 'ipad', 'console', 'speaker', 'camera']],
  ['Kitchen', ['blender', 'rice cooker', 'kitchen aid', 'kitchenaid', 'cutting board', 'knife', ' pan ', ' pot ', 'skillet', 'air fryer', 'mixer']],
  ['Home', ['sheets', 'pillow', 'duvet', 'towel', 'lamp', 'rug', 'chair', 'desk', 'mattress']],
  ['Clothing', ['jacket', 'chino', 'jeans', 'tee', 'shirt', 'sweater', 'pant', 'jogger', 'short', 'boxer', 'hoodie', 'crewneck', 'crew neck', 'sweatpants', 'gloves', 'boot', 'flannel', 'linen', 'pullover', 'fleece', 'sock', 'shoe']],
];

/** Split a Notes heading like "Charles Trywhitt (wait for $40 deals)" into name + note. */
export function splitHeading(h) {
  const m = String(h || '').trim().match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m && m[1] ? { name: m[1].trim(), note: m[2].trim() } : { name: String(h || '').trim(), note: '' };
}

/**
 * From a wishlist heading (brand or category) and item name, work out { brand, category, note }.
 */
export function classifyWant(heading, itemName) {
  const { name, note } = splitHeading(heading);
  const key = name.toLowerCase();
  let brand = name, category = GROUP_CATEGORY[key];
  if (category) brand = '';
  if (!category && key) {
    for (const [cat, words] of BRAND_CATEGORY) if (words.some((w) => key.includes(w))) { category = cat; break; }
  }
  if (!category) {
    const n = ' ' + String(itemName || '').toLowerCase() + ' ';
    for (const [cat, words] of NAME_CATEGORY) if (words.some((w) => n.includes(w))) { category = cat; break; }
  }
  return { brand, category: category || 'Other', note };
}

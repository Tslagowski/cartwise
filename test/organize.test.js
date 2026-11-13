import test from 'node:test';
import assert from 'node:assert/strict';
import { aisleFor, classifyWant, splitHeading } from '../src/lib/categorize.js';
import { migrateGrocery, migrateWant, migrateAll } from '../src/lib/migrate.js';

test('aisles from real grocery names', () => {
  const cases = {
    'Canned chicken': 'Pantry',
    'Chicken tenderloin': 'Meat & Seafood',
    'Chicken salt - kinder': 'Spices & Sauces',
    'Avocado oil spray': 'Pantry',
    'Peppermint pretzel crisps': 'Snacks',
    'Greek Yogurt (tub)': 'Dairy & Eggs',
    'Egg whites': 'Dairy & Eggs',
    'Rice cakes': 'Snacks',
    'Rice (Bibigo)': 'Pantry',
    'Fruit (strawberries, banana, cuties, kiwi)': 'Produce',
    'Potatoes (gold/russet/sweet)': 'Produce',
    'Sourdough Bread (keto)': 'Bakery',
    'Dog treats': 'Pet',
    'Paper towels': 'Household',
    'Parchment Paper': 'Household',
    'Preworkout': 'Health',
    'Water Enhancers - (Mios)': 'Drinks',
    'Fairlife milk': 'Dairy & Eggs',
    'Barebell protein bars': 'Snacks',
    'Montreal steak seasoning': 'Spices & Sauces',
    'Ground turkey (97/3)': 'Meat & Seafood',
    'Mystery thing': 'Other',
  };
  for (const [name, aisle] of Object.entries(cases)) assert.equal(aisleFor(name), aisle, name);
});

test('headings split into name and note', () => {
  assert.deepEqual(splitHeading('Charles Trywhitt (wait for $40 deals)'), { name: 'Charles Trywhitt', note: 'wait for $40 deals' });
  assert.deepEqual(splitHeading('Barbour'), { name: 'Barbour', note: '' });
});

test('wishlist headings become brand or category', () => {
  assert.deepEqual(classifyWant('Barbour', 'Powell Quilted Jacket'), { brand: 'Barbour', category: 'Clothing', note: '' });
  assert.deepEqual(classifyWant('Cooking', 'Blender'), { brand: '', category: 'Kitchen', note: '' });
  assert.deepEqual(classifyWant('TVs', 'LG C6H 77"'), { brand: '', category: 'Tech', note: '' });
  assert.deepEqual(classifyWant('Charles Trywhitt (wait for $40 deals)', 'Linen'), { brand: 'Charles Trywhitt', category: 'Clothing', note: 'wait for $40 deals' });
  assert.equal(classifyWant('Bed', 'Premium Egyptian Cotton Percale sheets - LL Bean').category, 'Home');
  assert.equal(classifyWant('Electronics', 'Raspberry Pi').category, 'Tech');
  assert.equal(classifyWant('', 'Air fryer').category, 'Kitchen');
});

test('old grocery records upgrade', () => {
  assert.equal(migrateGrocery({ id: '1', name: 'Eggs', checked: false }).status, 'need');
  assert.equal(migrateGrocery({ id: '1', name: 'Eggs', checked: true, logged: false }).status, 'cart');
  const m = migrateGrocery({ id: '1', name: 'Eggs', checked: true, logged: true, category: 'Protein' });
  assert.equal(m.status, 'stocked');
  assert.equal(m.aisle, 'Dairy & Eggs');
  assert.equal('category' in m, false);
  assert.equal(migrateGrocery(m), null);
});

test('old want records upgrade and keep notes', () => {
  const m = migrateWant({ id: 'w', name: 'Linen', group: 'Charles Trywhitt (wait for $40 deals)', notes: '' });
  assert.equal(m.brand, 'Charles Trywhitt');
  assert.equal(m.category, 'Clothing');
  assert.equal(m.notes, 'wait for $40 deals');
  assert.equal('group' in m, false);
});

test('migrateAll only touches old records', () => {
  const ops = migrateAll({ groceries: [{ id: 'a', name: 'Eggs', v: 2, status: 'need' }, { id: 'b', name: 'Milk' }], wants: [] });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].put.id, 'b');
});

test('sugar-free drinks stay drinks, pants stay clothing', () => {
  assert.equal(aisleFor('Juice - zero sugar'), 'Drinks');
  assert.equal(classifyWant('', 'Meta pant athletic slim fit').category, 'Clothing');
  assert.equal(classifyWant('', 'Cast iron pan').category, 'Kitchen');
});

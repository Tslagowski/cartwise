import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUrl, hostOf, cleanTitle, cleanPublisher, guessBrand } from '../src/lib/linkfill.js';

test('extractUrl pulls the link out of share text', () => {
  assert.equal(extractUrl('Check this out https://vuoriclothing.com/products/kore-short?color=charcoal.'), 'https://vuoriclothing.com/products/kore-short?color=charcoal');
  assert.equal(extractUrl('https://www.barbour.com/us/powell'), 'https://www.barbour.com/us/powell');
  assert.equal(extractUrl('no link here'), '');
});

test('hostOf drops www and shop prefixes', () => {
  assert.equal(hostOf('https://www.thursdayboots.com/products/x'), 'thursdayboots.com');
  assert.equal(hostOf('https://shop.lululemon.com/p/x'), 'lululemon.com');
  assert.equal(hostOf('not a url'), '');
});

test('cleanTitle drops site suffixes and a leading brand', () => {
  assert.equal(cleanTitle('Powell Quilted Jacket | Barbour', { brand: 'Barbour' }), 'Powell Quilted Jacket');
  assert.equal(cleanTitle("Men's Kore Short | Vuori Clothing", { publisher: 'Vuori Clothing' }), "Men's Kore Short");
  assert.equal(cleanTitle('Vuori Meta Jogger – Vuori', { brand: 'Vuori' }), 'Meta Jogger');
  assert.equal(cleanTitle('LG 77" C6 OLED evo 4K Smart TV - LG Electronics', { publisher: 'LG Electronics' }), 'LG 77" C6 OLED evo 4K Smart TV');
  assert.equal(cleanTitle('Plain title'), 'Plain title');
});

test('cleanPublisher keeps the brand-ish part', () => {
  assert.equal(cleanPublisher('Vuori Clothing | Official Site'), 'Vuori Clothing');
  assert.equal(cleanPublisher('Bonobos – Official Online Store'), 'Bonobos');
});

test('guessBrand: remembered site, then vendor, then another wish, then publisher', () => {
  assert.equal(guessBrand({ host: 'vuoriclothing.com', domainBrands: { 'vuoriclothing.com': 'Vuori' }, publisher: 'Vuori Clothing' }), 'Vuori');
  assert.equal(guessBrand({ host: 'thursdayboots.com', vendor: 'Thursday Boot Company' }), 'Thursday Boot Company');
  assert.equal(guessBrand({ host: 'bonobos.com', wants: [{ brand: 'Bonobos', url: 'https://bonobos.com/products/chino' }] }), 'Bonobos');
  assert.equal(guessBrand({ host: 'x.com', publisher: 'Barbour | Official Site' }), 'Barbour');
});

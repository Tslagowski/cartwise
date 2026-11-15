import test from 'node:test';
import assert from 'node:assert/strict';
import { metaTags, jsonLd, findProduct, extractProduct, fromShopify } from '../src/parse.js';

const LD_PAGE = `<html><head><title>Powell Quilted Jacket | Barbour</title>
<meta property="og:site_name" content="Barbour">
<meta property="og:image" content="/img/powell.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},
 {"@type":"Product","name":"Powell Quilted Jacket","brand":{"@type":"Brand","name":"Barbour"},
  "image":["https://cdn.barbour.com/powell-1.jpg","https://cdn.barbour.com/powell-2.jpg"],
  "offers":{"@type":"Offer","price":"449.00","priceCurrency":"USD"}}]}</script>
</head><body></body></html>`;

test('JSON-LD Product inside @graph wins', () => {
  const p = extractProduct(LD_PAGE, 'https://www.barbour.com/us/powell');
  assert.deepEqual(p, { name: 'Powell Quilted Jacket', brand: 'Barbour', image: 'https://cdn.barbour.com/powell-1.jpg', price: 449, currency: 'USD', site: 'Barbour', source: 'json-ld' });
});

test('ProductGroup with prices on variants, AggregateOffer lowPrice', () => {
  const html = `<script type="application/ld+json">[{"@type":"ProductGroup","name":"Meta Jogger","brand":"Vuori","image":{"url":"https://img/x.jpg"},
    "hasVariant":[{"@type":"Product","offers":{"price":"98","priceCurrency":"USD"}}]}]</script>`;
  const p = extractProduct(html, 'https://vuoriclothing.com/p');
  assert.equal(p.name, 'Meta Jogger');
  assert.equal(p.brand, 'Vuori');
  assert.equal(p.price, 98);
  assert.equal(p.image, 'https://img/x.jpg');
  const agg = extractProduct(`<script type="application/ld+json">{"@type":"Product","name":"TV","offers":{"@type":"AggregateOffer","lowPrice":"2799.99"}}</script>`, 'https://x.com');
  assert.equal(agg.price, 2799.99);
});

test('falls back to OpenGraph + product meta, resolving relative images and entities', () => {
  const html = `<title>ignored</title><meta property="og:title" content="Kore Short &amp; Liner">
    <meta content="/media/kore.png" property="og:image"><meta property="product:price:amount" content="$68.00">
    <meta property="product:brand" content="Vuori"><meta property="og:site_name" content="Vuori Clothing">`;
  const p = extractProduct(html, 'https://vuoriclothing.com/products/kore');
  assert.equal(p.name, 'Kore Short & Liner');
  assert.equal(p.image, 'https://vuoriclothing.com/media/kore.png');
  assert.equal(p.price, 68);
  assert.equal(p.brand, 'Vuori');
  assert.equal(p.source, 'opengraph');
});

test('broken JSON-LD is skipped; title is the last resort', () => {
  const html = `<script type="application/ld+json">{not json}</script><title>Just A Page</title>`;
  assert.deepEqual(jsonLd(html), []);
  const p = extractProduct(html, 'https://x.com');
  assert.equal(p.name, 'Just A Page');
  assert.equal(p.source, 'title');
});

test('meta tags: first value wins, any attribute order', () => {
  const m = metaTags(`<meta name="og:title" content="A"><meta property="og:title" content="B"><meta content='C' itemprop="price">`);
  assert.equal(m['og:title'], 'A');
  assert.equal(m.price, 'C');
});

test('findProduct digs through nesting', () => {
  assert.equal(findProduct([{ mainEntity: { '@type': ['Thing', 'Product'], name: 'X' } }]).name, 'X');
  assert.equal(findProduct([{ '@type': 'WebPage' }]), null);
});

test('Shopify JSON with a variant in the URL', () => {
  const p = fromShopify({ product: { title: 'Premier High Top', vendor: 'Thursday Boot Company', images: [{ id: 1, src: 'a.png' }, { id: 2, src: 'b.png' }],
    variants: [{ id: 11, title: 'Brown / 10', price: '199.00', image_id: 1 }, { id: 22, title: 'Black / 10.5', price: '179.00', image_id: 2 }] } }, 'https://thursdayboots.com/products/x?variant=22');
  assert.deepEqual(p, { name: 'Premier High Top', brand: 'Thursday Boot Company', image: 'b.png', price: 179, currency: '', variant: 'Black / 10.5', site: '', source: 'shopify' });
});

test('Shopify link without a variant does not claim a size/color', () => {
  const p = fromShopify({ product: { title: 'Tee', vendor: 'True Classic', images: [{ id: 1, src: 'a.png' }], variants: [{ id: 11, title: 'S', price: '29.99', image_id: 1 }] } }, 'https://x.com/products/tee');
  assert.equal(p.variant, '');
  assert.equal(p.price, 29.99);
});

test('generic share/placeholder images are ignored, real ones kept', () => {
  const lg = extractProduct('<script type="application/ld+json">{"@type":"Product","name":"TV"}</script><meta property="og:image" content="https://www.lg.com/lg5-common/images/common/share/share-default.jpg">', 'https://lg.com');
  assert.equal(lg.image, '');
  const ss = extractProduct('<meta property="og:title" content="Pants"><meta property="og:image" content="https://cdn.suitsupply.com/products/trousers/default/b5788_28">', 'https://suitsupply.com');
  assert.equal(ss.image, 'https://cdn.suitsupply.com/products/trousers/default/b5788_28');
});

// Pull product details out of a product page's HTML. Pure functions so they can be tested in Node.
// Sources, best first: schema.org Product JSON-LD (what stores publish for Google), then
// OpenGraph / product meta tags, then the <title>.

const decode = (s) =>
  String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

/** All <meta property|name|itemprop="…" content="…"> as a lowercase-keyed map (first value wins). */
export function metaTags(html) {
  const out = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in out)) out[key.toLowerCase()] = decode(val);
  }
  return out;
}

/** Parsed JSON-LD blocks (bad JSON is skipped). */
export function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim().replace(/^<!--|-->$/g, '')));
    } catch {
      /* some sites ship broken JSON-LD */
    }
  }
  return out;
}

/** Find the first schema.org Product (or ProductGroup) anywhere inside JSON-LD (arrays, @graph, nesting). */
export function findProduct(nodes) {
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.shift();
    if (!n || typeof n !== 'object') continue;
    if (Array.isArray(n)) { stack.push(...n); continue; }
    const t = [].concat(n['@type'] || []).map(String);
    if (t.some((x) => /^(Product|ProductGroup|IndividualProduct)$/i.test(x))) return n;
    for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const imageUrl = (v) => {
  v = first(v);
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.url || v.contentUrl || v['@id'] || '';
};
const brandName = (v) => {
  v = first(v);
  if (!v) return '';
  return typeof v === 'string' ? v : v.name || '';
};
function offerPrice(p) {
  // ProductGroup: price lives on its variants.
  const offers = [].concat(p.offers || [], ...([].concat(p.hasVariant || []).map((v) => v?.offers || [])));
  for (const o of offers) {
    if (!o || typeof o !== 'object') continue;
    const price = o.price ?? o.lowPrice ?? o.priceSpecification?.price ?? first(o.priceSpecification)?.price;
    const n = Number(String(price ?? '').replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n > 0) return { price: n, currency: o.priceCurrency || o.priceSpecification?.priceCurrency || '' };
  }
  return { price: null, currency: '' };
}

// Generic share/placeholder images aren't product photos.
const PLACEHOLDER = /(share[-_]?default|default[-_]?share|placeholder|no[-_]?image|\/logo[^/]*\.(png|svg|jpe?g|webp)(\?|$))/i;
const realImage = (u) => (u && !PLACEHOLDER.test(u) ? u : '');

const abs = (u, base) => {
  if (!u) return '';
  try {
    return new URL(u, base).toString();
  } catch {
    return '';
  }
};

/** Everything we can learn about the product on a page. */
export function extractProduct(html, pageUrl) {
  const meta = metaTags(html);
  const product = findProduct(jsonLd(html));
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const fromLd = product ? offerPrice(product) : { price: null, currency: '' };
  const metaPrice = Number(String(meta['product:price:amount'] || meta['og:price:amount'] || meta['price'] || '').replace(/[^0-9.]/g, ''));
  const out = {
    name: decode(product?.name || meta['og:title'] || meta['twitter:title'] || title),
    brand: decode(brandName(product?.brand) || meta['product:brand'] || meta['og:brand'] || ''),
    image: realImage(abs(imageUrl(product?.image) || meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'], pageUrl)),
    price: fromLd.price ?? (Number.isFinite(metaPrice) && metaPrice > 0 ? metaPrice : null),
    currency: fromLd.currency || meta['product:price:currency'] || meta['og:price:currency'] || '',
    site: decode(meta['og:site_name'] || meta['application-name'] || ''),
    source: product ? 'json-ld' : meta['og:title'] || meta['og:image'] ? 'opengraph' : title ? 'title' : 'none',
  };
  return out;
}

/** Shopify's public product JSON -> the same shape. */
export function fromShopify(json, pageUrl) {
  const p = json?.product;
  if (!p) return null;
  const vid = new URL(pageUrl).searchParams.get('variant');
  const variant = (vid && p.variants?.find((v) => String(v.id) === vid)) || p.variants?.[0];
  const img = (variant?.image_id && p.images?.find((i) => i.id === variant.image_id)) || p.images?.[0] || p.image;
  return {
    name: p.title || '', brand: p.vendor || '', image: img?.src || '',
    price: variant?.price != null ? Number(variant.price) : null, currency: '',
    // Only name a size/color when the link points at one; otherwise it's just the store's first option.
    variant: vid && variant?.title && variant.title !== 'Default Title' ? variant.title : '',
    site: '', source: 'shopify',
  };
}

// Helpers for filling in a wish from a product link.

/** First http(s) URL in a string (share text often wraps the link in other words). */
export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return '';
  return m[0].replace(/[).,;!?]+$/, '');
}

/** Hostname without "www." / "shop." / "m." etc. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|shop|store|m|us|en)\./, '');
  } catch {
    return '';
  }
}

const SITE_JUNK = /\b(official( site| store| website)?|online( store| shop)?|shop now|free shipping.*|clothing co\.?|inc\.?)\b/gi;

/** Tidy a page title: drop the " | Site" / " – Brand" suffix and a leading brand name. */
export function cleanTitle(title, { brand = '', publisher = '' } = {}) {
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const parts = t.split(/\s+[|–—•·]\s+|\s+-\s+/);
  if (parts.length > 1) {
    const site = [brand, publisher].filter(Boolean).map((x) => x.toLowerCase());
    // Keep the longest part that isn't just the site/brand name.
    const keep = parts.filter((p) => !site.some((s) => p.toLowerCase().includes(s) && p.length <= s.length + 14));
    t = (keep.length ? keep : parts).sort((a, b) => b.length - a.length)[0];
  }
  if (brand && t.toLowerCase().startsWith(brand.toLowerCase() + ' ')) t = t.slice(brand.length + 1);
  return t.replace(/^[\s:–-]+/, '').trim();
}

/** Tidy a site/publisher name into something brand-like ("Vuori Clothing | Official Site" -> "Vuori Clothing"). */
export function cleanPublisher(p) {
  return String(p || '').split(/\s+[|–—]\s+/)[0].replace(SITE_JUNK, '').replace(/\s+/g, ' ').trim();
}

/**
 * Best guess at the brand for a link: what you've used for this site before,
 * then the store's own vendor field, then another wish from the same site, then the site name.
 */
export function guessBrand({ host, vendor = '', publisher = '', domainBrands = {}, wants = [] }) {
  if (host && domainBrands[host]) return domainBrands[host];
  if (vendor) return vendor.trim();
  const same = wants.find((w) => w.brand && w.url && hostOf(w.url) === host);
  if (same) return same.brand;
  return cleanPublisher(publisher);
}

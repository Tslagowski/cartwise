// Cartwise lookup service (Cloudflare Worker).
//   GET /lookup?url=<product page>  -> { name, brand, image, price, currency, variant, site, source }
//   GET /img?url=<image url>        -> the image, with CORS so the app can save a copy
// Only the Cartwise app's own origins may call it.

import { extractProduct, fromShopify } from './parse.js';

const ALLOWED = ['https://tslagowski.github.io', 'http://localhost:8765', 'http://localhost:8080'];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAX_HTML = 3_000_000;
const MAX_IMG = 6_000_000;

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Vary': 'Origin',
});
const json = (data, status, origin) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600', ...cors(origin) } });

function targetUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    // Don't let the service be pointed at private/internal addresses.
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(url.hostname) || url.hostname.endsWith('.local')) return null;
    return url;
  } catch {
    return null;
  }
}

async function getText(res) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_HTML) throw new Error('page too large');
  const text = await res.text();
  return text.length > MAX_HTML ? text.slice(0, MAX_HTML) : text;
}

async function lookup(url) {
  // Shopify stores: the public product JSON is the most complete source.
  const m = url.pathname.match(/\/products\/([^/?#.]+)/);
  if (m) {
    try {
      const r = await fetch(`${url.origin}/products/${m[1]}.json`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        const p = fromShopify(await r.json(), url.toString());
        if (p?.name) return p;
      }
    } catch { /* not Shopify */ }
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) {
    const err = new Error(res.status === 403 || res.status === 429 ? 'blocked' : `http ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (!(res.headers.get('content-type') || '').includes('html')) throw new Error('not a web page');
  return extractProduct(await getText(res), res.url || url.toString());
}

async function proxyImage(url) {
  const res = await fetch(url.toString(), { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) throw new Error('not an image');
  if (Number(res.headers.get('content-length') || 0) > MAX_IMG) throw new Error('image too large');
  return new Response(res.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const ok = ALLOWED.includes(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: ok ? cors(origin) : {} });
    if (!ok) return new Response('Forbidden', { status: 403 });
    if (request.method !== 'GET') return json({ error: 'method' }, 405, origin);

    const req = new URL(request.url);
    const target = targetUrl(req.searchParams.get('url') || '');
    if (!target) return json({ error: 'bad url' }, 400, origin);

    // Cache results for a few hours so repeat lookups are instant and gentle on stores.
    const cache = caches.default;
    const key = new Request(`https://cache.cartwise${req.pathname}?url=${encodeURIComponent(target.toString())}`);
    const hit = await cache.match(key);
    if (hit) {
      const r = new Response(hit.body, hit);
      r.headers.set('Access-Control-Allow-Origin', origin);
      return r;
    }

    try {
      let res;
      if (req.pathname === '/img') {
        res = await proxyImage(target);
        Object.entries(cors(origin)).forEach(([k, v]) => res.headers.set(k, v));
      } else if (req.pathname === '/lookup') {
        res = json(await lookup(target), 200, origin);
      } else {
        return json({ error: 'not found' }, 404, origin);
      }
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      return json({ error: e.message || 'failed', status: e.status || 0 }, 502, origin);
    }
  },
};

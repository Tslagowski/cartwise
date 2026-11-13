import { loadAll, write, replaceAll, newId } from './db.js';
import { UNITS, unitPrice, lineTotal, formatMoney, formatUnitPrice } from './lib/units.js';
import { priceHistory, productStats, rate, lastRating, trendValues } from './lib/stats.js';
import { makeExport, parseImport } from './lib/backup.js';
import { parseChecklist } from './lib/notes.js';
import { sparkPath, sparkEnd } from './lib/spark.js';
import { scanBarcode } from './scanner.js';

// ---------- state ----------
let S = { stores: [], products: [], trips: [], lines: [], wants: [], groceries: [] };
let tab = 'want';
let shopping = false; // grocery shopping mode
let wakeLock = null;
const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const lc = (s) => (s || '').trim().toLowerCase();
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fmtDate = (iso) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtShort = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch {
    return null;
  }
}

async function reload() {
  S = await loadAll();
  render();
}

// ---------- haptics ----------
// iOS Safari has no vibrate API, but toggling a native switch checkbox gives a light tap (iOS 18+).
let hapticLabel;
function haptic() {
  try {
    if (navigator.vibrate) return navigator.vibrate(10);
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.className = 'haptic';
      hapticLabel.innerHTML = '<input type="checkbox" switch>';
      document.body.append(hapticLabel);
    }
    hapticLabel.click();
  } catch {}
}

// ---------- derived lookups ----------
function findProduct(name, brand) {
  const n = lc(name), b = lc(brand);
  return S.products.find((p) => lc(p.name) === n && lc(p.brand) === b);
}
function productsNamed(name) {
  const n = lc(name);
  return S.products.filter((p) => lc(p.name) === n);
}
function historyFor(productIds) {
  const ids = new Set(productIds);
  return priceHistory(S.lines.filter((l) => ids.has(l.productId)), byId(S.trips), byId(S.stores));
}
function statsForName(name) {
  const ps = productsNamed(name);
  if (!ps.length) return null;
  return productStats(historyFor(ps.map((p) => p.id)));
}

// ---------- small visual helpers ----------
function sparkline(values, w = 64, h = 22, cls = '') {
  const d = sparkPath(values, w, h, 3);
  if (!d) return `<svg class="spark ${cls}" width="${w}" height="${h}"></svg>`;
  const end = sparkEnd(values, w, h, 3);
  return `<svg class="spark ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><circle cx="${end.x}" cy="${end.y}" r="2.5"/></svg>`;
}
const dot = (r) => (r ? `<span class="dot ${r}" title="${{ good: 'Good price', ok: 'Typical', high: 'Higher than usual' }[r]}"></span>` : '');
function thumb(w, size = 56) {
  if (w.image) return `<img class="thumb" src="${esc(w.image)}" alt="" width="${size}" height="${size}" loading="lazy">`;
  const hue = [...(w.group || w.name || '?')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `<div class="thumb ph" style="--h:${hue}">${esc((w.name || '?').trim()[0]?.toUpperCase() || '?')}</div>`;
}

// ---------- sheet (one reusable dialog) ----------
const sheet = () => $('#sheet');
function openSheet(title, body, wire, { full = false } = {}) {
  const d = sheet();
  d.classList.toggle('full', full);
  d.innerHTML = `<form method="dialog" class="sheet-inner">
    <div class="grabber"></div>
    <header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="sheet-body">${body}</div></form>`;
  $('[data-close]', d).onclick = () => d.close();
  d.querySelector('form').onsubmit = (e) => e.preventDefault();
  if (!d.open) d.showModal();
  wire?.(d);
}
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.run(); };
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), action ? 4000 : 2200);
}

// ---------- swipe rows ----------
// <li class="swipe" data-right="Got" data-left="Delete"> with a .swipe-content child.
function enableSwipe(root) {
  let row, content, startX, startY, dx, locked;
  const reset = () => {
    if (content) {
      content.style.transition = 'transform .2s';
      content.style.transform = '';
    }
    row?.classList.remove('arm-left', 'arm-right');
    row = content = null;
  };
  root.addEventListener('touchstart', (e) => {
    const r = e.target.closest('.swipe');
    if (!r || e.target.closest('input,button,a,select')) return;
    row = r;
    content = r.querySelector('.swipe-content');
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    locked = null;
    content.style.transition = 'none';
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!row) return;
    const x = e.touches[0].clientX - startX, y = e.touches[0].clientY - startY;
    if (locked === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) locked = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
    if (locked !== 'x') return;
    if ((x > 0 && !row.dataset.right) || (x < 0 && !row.dataset.left)) return;
    e.preventDefault();
    dx = x;
    content.style.transform = `translateX(${dx}px)`;
    const armR = dx > 80, armL = dx < -80;
    if (armR !== row.classList.contains('arm-right') || armL !== row.classList.contains('arm-left')) {
      if (armR || armL) haptic();
      row.classList.toggle('arm-right', armR);
      row.classList.toggle('arm-left', armL);
    }
  }, { passive: false });
  root.addEventListener('touchend', () => {
    if (!row) return;
    const r = row, d = dx;
    reset();
    if (d > 80) r.dispatchEvent(new CustomEvent('swipe', { bubbles: true, detail: 'right' }));
    else if (d < -80) r.dispatchEvent(new CustomEvent('swipe', { bubbles: true, detail: 'left' }));
    if (Math.abs(d) > 8) r.dataset.justSwiped = '1', setTimeout(() => delete r.dataset.justSwiped, 300);
  });
  root.addEventListener('touchcancel', reset);
}
const swipeRow = (inner, { left, right, attrs = '' } = {}) =>
  `<li class="swipe" ${right ? `data-right="${esc(right)}"` : ''} ${left ? `data-left="${esc(left)}"` : ''} ${attrs}>
    ${right ? `<div class="swipe-bg right">${esc(right)}</div>` : ''}${left ? `<div class="swipe-bg left">${esc(left)}</div>` : ''}
    <div class="swipe-content">${inner}</div></li>`;

// ---------- datalists ----------
const GROCERY_CATS = ['Protein', 'Carbs', 'Fats', 'Produce', 'Other'];
function renderDatalists() {
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const fill = (id, xs) => ($(id).innerHTML = uniq(xs).map((n) => `<option value="${esc(n)}">`).join(''));
  fill('#dl-products', S.products.map((p) => p.name));
  fill('#dl-brands', S.products.map((p) => p.brand));
  fill('#dl-stores', S.stores.map((s) => s.name));
  fill('#dl-categories', S.products.map((p) => p.category));
  fill('#dl-want-groups', S.wants.map((w) => w.group));
  fill('#dl-gcats', [...GROCERY_CATS, ...S.groceries.map((g) => g.category)]);
}

// ---------- purchase form ----------
const unitOptions = (sel) =>
  Object.entries(UNITS)
    .map(([k, u]) => `<option value="${k}" ${k === (sel || 'ea') ? 'selected' : ''}>${u.label}</option>`)
    .join('');

function lineRow(l = {}) {
  const st = l.name ? statsForName(l.name) : null;
  const ph = st ? st.last.price.toFixed(2) : '0.00';
  return `<div class="line">
    <div class="line-main">
      <input name="name" list="dl-products" placeholder="Item" value="${esc(l.name)}" autocomplete="off" enterkeyhint="next">
      <div class="price-field"><span>$</span><input name="price" inputmode="decimal" placeholder="${esc(ph)}" value="${esc(l.price)}" enterkeyhint="done"></div>
      <button type="button" class="icon-btn sm" data-more aria-label="More details" aria-expanded="false">⋯</button>
      <button type="button" class="icon-btn sm" data-remove aria-label="Remove item">✕</button>
    </div>
    <div class="line-meta"><span class="summary"></span><span class="hint"></span></div>
    <div class="line-more" hidden>
      <div class="grid2">
        <label>Brand<input name="brand" list="dl-brands" value="${esc(l.brand)}" autocomplete="off"></label>
        <label>Qty<input name="qty" inputmode="decimal" value="${esc(l.qty ?? 1)}"></label>
      </div>
      <div class="grid3">
        <label>Size<input name="size" inputmode="decimal" placeholder="—" value="${esc(l.size ?? '')}"></label>
        <label>Unit<select name="unit">${unitOptions(l.unit)}</select></label>
        <label class="check"><input type="checkbox" name="onSale" ${l.onSale ? 'checked' : ''}> Sale</label>
      </div>
      <div class="barcode-row"><label class="grow">Barcode<input name="barcode" inputmode="numeric" value="${esc(l.barcode)}" placeholder="optional"></label>
        <button type="button" class="btn" data-scan-line aria-label="Scan barcode">Scan</button></div>
    </div>
  </div>`;
}

function readLine(el) {
  const v = (n) => el.querySelector(`[name=${n}]`);
  return {
    name: v('name').value.trim(),
    brand: v('brand').value.trim(),
    price: v('price').value.replace(/[$,\s]/g, ''),
    qty: v('qty').value.trim() || '1',
    size: v('size').value.trim(),
    unit: v('unit').value,
    onSale: v('onSale').checked,
    barcode: v('barcode').value.trim(),
  };
}

function updateLineMeta(el) {
  const l = readLine(el);
  const bits = [l.brand, l.size && `${l.size} ${UNITS[l.unit]?.label || ''}`, Number(l.qty) > 1 && `×${l.qty}`, l.onSale && 'sale'].filter(Boolean);
  el.querySelector('.summary').textContent = bits.join(' · ');
  const hint = el.querySelector('.hint');
  const up = l.price ? unitPrice(l) : null;
  if (!up) return (hint.innerHTML = '');
  const p = findProduct(l.name, l.brand);
  const st = p ? productStats(historyFor([p.id])) : statsForName(l.name);
  let txt = formatUnitPrice(up);
  if (st && st.last.unit.family === up.family) {
    const r = rate(up.value, st);
    txt = `${dot(r)}${txt} · <span class="rate ${r}">${{ good: 'Good price', ok: 'Typical', high: 'High' }[r]}</span>`;
  }
  hint.innerHTML = txt;
}

function fillFromProduct(el, p, { force = false } = {}) {
  const set = (n, val) => {
    const i = el.querySelector(`[name=${n}]`);
    if ((force || !i.value) && val != null && val !== '') i.value = val;
  };
  set('name', p.name);
  set('brand', p.brand);
  set('size', p.defaultSize);
  set('barcode', p.barcode);
  const unit = el.querySelector('[name=unit]');
  if (p.defaultUnit && (force || unit.value === 'ea')) unit.value = p.defaultUnit;
  const st = productStats(historyFor([p.id]));
  if (st) el.querySelector('[name=price]').placeholder = st.last.price.toFixed(2);
}

function wireLine(el) {
  el.querySelector('[data-remove]').onclick = () => {
    el.remove();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const more = el.querySelector('[data-more]');
  more.onclick = () => {
    const box = el.querySelector('.line-more');
    box.hidden = !box.hidden;
    more.setAttribute('aria-expanded', String(!box.hidden));
  };
  const name = el.querySelector('[name=name]');
  name.addEventListener('change', () => {
    const ps = productsNamed(name.value);
    if (ps.length) fillFromProduct(el, ps[0]);
    updateLineMeta(el);
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[name=price]').focus(); }
  });
  el.querySelector('[data-scan-line]').onclick = async () => {
    const code = await scanBarcode();
    if (!code) return;
    el.querySelector('[name=barcode]').value = code;
    const p = S.products.find((x) => x.barcode === code);
    if (p) fillFromProduct(el, p);
    updateLineMeta(el);
  };
  el.addEventListener('input', () => updateLineMeta(el));
  updateLineMeta(el);
}

function openPurchase({ trip, prefill = [], storeName, onSaved } = {}) {
  const storesById = byId(S.stores), productsById = byId(S.products);
  let lines = prefill;
  if (trip) {
    lines = S.lines
      .filter((l) => l.tripId === trip.id)
      .map((l) => {
        const p = productsById[l.productId] || {};
        return { ...l, name: p.name, brand: p.brand, barcode: p.barcode };
      });
  }
  if (!lines.length) lines = [{}];
  const defStore = trip ? storesById[trip.storeId]?.name : storeName || store('lastStore') || '';
  const body = `
    <div class="group-box form grid2">
      <label>Store<input name="store" list="dl-stores" placeholder="e.g. King Soopers" value="${esc(defStore)}" autocomplete="off"></label>
      <label>Date<input name="date" type="date" value="${esc(trip?.date || today())}"></label>
    </div>
    <div class="group-box" id="lines">${lines.map(lineRow).join('')}</div>
    <div class="add-actions">
      <button type="button" class="btn ghost" data-add>+ Item</button>
      <button type="button" class="btn ghost" data-scan-add>Scan item</button>
    </div>
    <div class="sheet-footer">
      <div class="total-row"><span>Total</span><b id="trip-total">$0.00</b></div>
      <div class="actions">
        ${trip ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
        <button type="button" class="btn primary" data-save>Save</button>
      </div>
    </div>`;
  openSheet(trip ? 'Edit purchase' : 'New purchase', body, (d) => {
    const linesEl = $('#lines', d);
    const recalc = () => {
      const t = $$('.line', linesEl).reduce((sum, el) => {
        const r = readLine(el);
        if (!r.name && !r.price) return sum;
        const ph = el.querySelector('[name=price]').placeholder;
        return sum + lineTotal({ ...r, price: r.price || (ph !== '0.00' ? ph : 0) });
      }, 0);
      $('#trip-total', d).textContent = formatMoney(t);
    };
    $$('.line', linesEl).forEach(wireLine);
    linesEl.addEventListener('input', recalc);
    linesEl.addEventListener('change', recalc);
    recalc();
    const addLine = (l = {}) => {
      linesEl.insertAdjacentHTML('beforeend', lineRow(l));
      const el = linesEl.lastElementChild;
      wireLine(el);
      return el;
    };
    $('[data-add]', d).onclick = () => addLine().querySelector('[name=name]').focus();
    $('[data-scan-add]', d).onclick = async () => {
      const code = await scanBarcode();
      if (!code) return;
      const p = S.products.find((x) => x.barcode === code);
      // Reuse an empty first row if there is one.
      const empty = $$('.line', linesEl).find((el) => !readLine(el).name && !readLine(el).price);
      const el = empty || addLine();
      el.querySelector('[name=barcode]').value = code;
      if (p) fillFromProduct(el, p, { force: true });
      else toast('New barcode — type the item name');
      updateLineMeta(el);
      (p ? el.querySelector('[name=price]') : el.querySelector('[name=name]')).focus();
    };
    const del = $('[data-delete]', d);
    if (del)
      del.onclick = async () => {
        if (!confirm('Delete this purchase and its items?')) return;
        await write([
          { store: 'trips', del: trip.id },
          ...S.lines.filter((l) => l.tripId === trip.id).map((l) => ({ store: 'lines', del: l.id })),
        ]);
        d.close();
        await reload();
        toast('Purchase deleted');
      };
    $('[data-save]', d).onclick = async () => {
      const storeName = $('[name=store]', d).value.trim();
      const date = $('[name=date]', d).value || today();
      const rows = $$('.line', linesEl).map((el) => {
        const r = readLine(el);
        // An empty price falls back to the last price shown as the placeholder.
        if (r.price === '' && r.name) {
          const ph = el.querySelector('[name=price]').placeholder;
          if (ph && ph !== '0.00') r.price = ph;
        }
        return r;
      }).filter((l) => l.name);
      if (!storeName) return toast('Add a store');
      if (!rows.length) return toast('Add at least one item');
      if (rows.some((l) => l.price === '' || !Number.isFinite(Number(l.price)))) return toast('Every item needs a price');

      const ops = [];
      let st = S.stores.find((s) => lc(s.name) === lc(storeName));
      if (!st) {
        st = { id: newId(), name: storeName };
        S.stores.push(st);
        ops.push({ store: 'stores', put: st });
      }
      const t = { id: trip?.id || newId(), storeId: st.id, date, note: trip?.note || '', createdAt: trip?.createdAt || Date.now() };
      ops.push({ store: 'trips', put: t });
      if (trip) S.lines.filter((l) => l.tripId === trip.id).forEach((l) => ops.push({ store: 'lines', del: l.id }));
      for (const r of rows) {
        let p = findProduct(r.name, r.brand);
        if (!p) {
          p = { id: newId(), name: r.name, brand: r.brand, category: '' };
          S.products.push(p);
        }
        p = { ...p, defaultSize: r.size, defaultUnit: r.unit, barcode: r.barcode || p.barcode || '' };
        ops.push({ store: 'products', put: p });
        ops.push({
          store: 'lines',
          put: { id: newId(), tripId: t.id, productId: p.id, price: Number(r.price), qty: Number(r.qty) || 1, size: r.size ? Number(r.size) : null, unit: r.unit, onSale: r.onSale },
        });
      }
      await write(ops);
      store('lastStore', storeName);
      d.close();
      haptic();
      await onSaved?.({ storeName });
      await reload();
      toast('Saved');
    };
  }, { full: true });
}

// ---------- product sheet ----------
function openProduct(p) {
  const hist = historyFor([p.id]);
  const st = productStats(hist);
  const trend = trendValues(hist, 24);
  const body = `
    ${st ? `<div class="stats">
        <div><span>Last ${dot(lastRating(hist))}</span><b>${formatUnitPrice(st.last.unit)}</b></div>
        <div><span>Lowest</span><b>${formatUnitPrice(st.lowest.unit)}</b></div>
        <div><span>Typical</span><b>${formatUnitPrice(st.median)}</b></div>
      </div>
      ${trend.length > 1 ? `<div class="chart">${sparkline(trend, 320, 80, 'big')}</div>` : ''}` : '<p class="empty small">No price history yet.</p>'}
    ${hist.length ? `<ul class="list">${hist
      .map(
        (h) => `<li><div class="grow"><b>${formatMoney(h.price)}</b>${h.size ? ` · ${esc(h.size)} ${esc(UNITS[h.sizeUnit]?.label || '')}` : ''} ${h.onSale ? '<span class="tag">sale</span>' : ''}
          <div class="sub">${esc(h.store)} · ${fmtDate(h.date)}</div></div><div class="sub">${formatUnitPrice(h.unit)}</div></li>`
      )
      .join('')}</ul>` : ''}
    <h3>Details</h3>
    <div class="group-box form">
      <label>Name<input name="name" value="${esc(p.name)}"></label>
      <label>Brand<input name="brand" list="dl-brands" value="${esc(p.brand)}"></label>
      <label>Category<input name="category" list="dl-categories" value="${esc(p.category)}" placeholder="e.g. Dairy"></label>
      <div class="barcode-row"><label class="grow">Barcode<input name="barcode" inputmode="numeric" value="${esc(p.barcode)}"></label>
        <button type="button" class="btn" data-scan>Scan</button></div>
    </div>
    <div class="actions">
      ${hist.length ? '' : '<button type="button" class="btn danger" data-delete>Delete</button>'}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(p.brand ? `${p.name} · ${p.brand}` : p.name, body, (d) => {
    $('[data-scan]', d).onclick = async () => {
      const code = await scanBarcode();
      if (code) $('[name=barcode]', d).value = code;
    };
    $('[data-save]', d).onclick = async () => {
      const name = $('[name=name]', d).value.trim();
      if (!name) return toast('Name is required');
      await write([{ store: 'products', put: { ...p, name, brand: $('[name=brand]', d).value.trim(), category: $('[name=category]', d).value.trim(), barcode: $('[name=barcode]', d).value.trim() } }]);
      d.close();
      await reload();
    };
    const del = $('[data-delete]', d);
    if (del)
      del.onclick = async () => {
        await write([{ store: 'products', del: p.id }]);
        d.close();
        await reload();
      };
  });
}

async function priceCheckScan() {
  const code = await scanBarcode();
  if (!code) return;
  const p = S.products.find((x) => x.barcode === code);
  if (p) return openProduct(p);
  toast('Haven’t seen this item yet', { label: 'Log it', run: () => openPurchase({ prefill: [{ barcode: code }] }) });
}

// ---------- images ----------
// Downscale a photo to a small JPEG data URL so it fits in IndexedDB and backups.
function compressImage(src, max = 480) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try {
        resolve(c.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        reject(e); // tainted canvas (remote image without CORS)
      }
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

// Free link preview (Microlink, no key; ~50 lookups/day). Only called when you tap the button.
async function linkPreview(url) {
  const res = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url));
  const json = await res.json();
  if (json.status !== 'success') throw new Error('No preview for that link');
  return { image: json.data?.image?.url || json.data?.logo?.url || '', title: json.data?.title || '' };
}

// ---------- want sheet ----------
function openWant(w, defaults = {}) {
  let image = w?.image || '';
  const body = `
    <div class="img-pick">
      <div class="img-box" data-img>${image ? `<img src="${esc(image)}" alt="">` : '<span>Add photo</span>'}</div>
      <div class="img-actions">
        <label class="btn">Photo<input type="file" accept="image/*" hidden data-file></label>
        <button type="button" class="btn" data-fetch>From link</button>
        <button type="button" class="btn ghost" data-clear-img ${image ? '' : 'hidden'}>Remove</button>
      </div>
    </div>
    <div class="group-box form">
      <label>What do you want?<input name="name" value="${esc(w?.name)}" placeholder="e.g. Powell Quilted Jacket"></label>
      <label>Brand or group<input name="group" list="dl-want-groups" value="${esc(w?.group ?? defaults.group ?? '')}" placeholder="e.g. Barbour, TVs" autocomplete="off"></label>
      <label>Size / fit / color<input name="details" value="${esc(w?.details)}" placeholder="e.g. 33x34 athletic"></label>
    </div>
    <div class="group-box form">
      <div class="grid2">
        <label>Target price<input name="targetPrice" inputmode="decimal" value="${esc(w?.targetPrice ?? '')}" placeholder="optional"></label>
        <label>Priority<select name="priority">${['High', 'Medium', 'Low']
          .map((x) => `<option ${x === (w?.priority || 'Medium') ? 'selected' : ''}>${x}</option>`)
          .join('')}</select></label>
      </div>
      <label>Link<input name="url" type="url" value="${esc(w?.url)}" placeholder="https://"></label>
      <label>Notes<textarea name="notes" rows="2" placeholder="e.g. wait for $40 deals">${esc(w?.notes)}</textarea></label>
    </div>
    <div class="actions">
      ${w ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
      ${w && w.status !== 'bought' ? '<button type="button" class="btn" data-bought>Bought it</button>' : ''}
      ${w && w.status === 'bought' ? '<button type="button" class="btn" data-reopen>Want again</button>' : ''}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(w ? 'Edit want' : 'New want', body, (d) => {
    const setImage = (src) => {
      image = src;
      $('[data-img]', d).innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span>Add photo</span>';
      $('[data-clear-img]', d).hidden = !src;
    };
    $('[data-img]', d).onclick = () => $('[data-file]', d).click();
    $('[data-file]', d).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      try {
        setImage(await compressImage(url));
      } catch {
        toast('Couldn’t read that photo');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    $('[data-clear-img]', d).onclick = () => setImage('');
    $('[data-fetch]', d).onclick = async (e) => {
      const url = $('[name=url]', d).value.trim();
      if (!/^https?:\/\//.test(url)) return toast('Paste a link first');
      e.target.disabled = true;
      e.target.textContent = 'Fetching…';
      try {
        const pv = await linkPreview(url);
        if (!pv.image) throw new Error('No image on that page');
        let img = pv.image;
        try { img = await compressImage(pv.image); } catch { /* keep remote URL if the site blocks copying */ }
        setImage(img);
        const name = $('[name=name]', d);
        if (!name.value && pv.title) name.value = pv.title.split(/[|–-]/)[0].trim();
      } catch (err) {
        toast(err.message || 'Couldn’t fetch a preview');
      } finally {
        e.target.disabled = false;
        e.target.textContent = 'From link';
      }
    };
    const read = () => {
      const tp = $('[name=targetPrice]', d).value.replace(/[$,\s]/g, '');
      return {
        ...(w || { id: newId(), status: 'open', createdAt: new Date().toISOString() }),
        name: $('[name=name]', d).value.trim(),
        group: $('[name=group]', d).value.trim(),
        details: $('[name=details]', d).value.trim(),
        targetPrice: tp && Number.isFinite(Number(tp)) ? Number(tp) : null,
        priority: $('[name=priority]', d).value,
        url: $('[name=url]', d).value.trim(),
        notes: $('[name=notes]', d).value.trim(),
        image,
      };
    };
    $('[data-save]', d).onclick = async () => {
      const x = read();
      if (!x.name) return toast('Give it a name');
      await write([{ store: 'wants', put: x }]);
      d.close();
      await reload();
    };
    const del = $('[data-delete]', d);
    if (del) del.onclick = async () => { d.close(); await deleteWant(w); };
    const bought = $('[data-bought]', d);
    if (bought) bought.onclick = () => buyWant(read());
    const reopen = $('[data-reopen]', d);
    if (reopen)
      reopen.onclick = async () => {
        await write([{ store: 'wants', put: { ...read(), status: 'open', boughtAt: null } }]);
        d.close();
        await reload();
      };
  });
}

async function deleteWant(w) {
  await write([{ store: 'wants', del: w.id }]);
  await reload();
  toast('Deleted', { label: 'Undo', run: async () => { await write([{ store: 'wants', put: w }]); reload(); } });
}
function buyWant(w) {
  openPurchase({
    prefill: [{ name: w.name, price: w.targetPrice ?? '' }],
    onSaved: () => write([{ store: 'wants', put: { ...w, status: 'bought', boughtAt: new Date().toISOString() } }]),
  });
}
async function markWantBought(w) {
  // Swipe = quick "bought" without logging a price; the toast offers to log one.
  const done = { ...w, status: 'bought', boughtAt: new Date().toISOString() };
  await write([{ store: 'wants', put: done }]);
  haptic();
  await reload();
  toast('Marked bought', { label: 'Log price', run: () => openPurchase({ prefill: [{ name: w.name, price: w.targetPrice ?? '' }] }) });
}

// ---------- grocery sheets ----------
function openGrocery(g) {
  const body = `
    <div class="group-box form">
      <label>Item<input name="name" list="dl-products" value="${esc(g?.name)}" placeholder="e.g. Greek yogurt"></label>
      <div class="chips" role="radiogroup" aria-label="Category">${[...new Set([...GROCERY_CATS, g?.category].filter(Boolean))]
        .map((c) => `<label class="chip"><input type="radio" name="category" value="${esc(c)}" ${c === (g?.category || store('lastGcat') || 'Protein') ? 'checked' : ''}>${esc(c)}</label>`)
        .join('')}</div>
      <label>Usual store<input name="store" list="dl-stores" value="${esc(g?.store)}" placeholder="any store"></label>
    </div>
    <div class="actions">
      ${g ? '<button type="button" class="btn danger" data-delete>Remove</button>' : ''}
      ${g ? '' : '<button type="button" class="btn" data-save-next>Save & add another</button>'}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(g ? 'Staple' : 'Add staple', body, (d) => {
    const nameEl = $('[name=name]', d);
    if (!g) setTimeout(() => nameEl.focus(), 50);
    const save = async (again) => {
      const name = nameEl.value.trim();
      if (!name) return toast('Name is required');
      const category = $('[name=category]:checked', d)?.value || 'Other';
      store('lastGcat', category);
      const x = { ...(g || { id: newId(), checked: false, logged: false, createdAt: new Date().toISOString() }), name, category, store: $('[name=store]', d).value.trim() };
      await write([{ store: 'groceries', put: x }]);
      await reload();
      if (again) {
        nameEl.value = '';
        nameEl.focus();
        toast(`Added ${name}`);
      } else d.close();
    };
    $('[data-save]', d).onclick = () => save(false);
    const next = $('[data-save-next]', d);
    if (next) next.onclick = () => save(true);
    nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !g) { e.preventDefault(); save(true); } });
    const del = $('[data-delete]', d);
    if (del) del.onclick = async () => { d.close(); await deleteGrocery(g); };
  });
}
async function deleteGrocery(g) {
  await write([{ store: 'groceries', del: g.id }]);
  await reload();
  toast(`Removed ${g.name}`, { label: 'Undo', run: async () => { await write([{ store: 'groceries', put: g }]); reload(); } });
}
async function toggleGrocery(g, checked = !g.checked) {
  await write([{ store: 'groceries', put: { ...g, checked, logged: checked ? g.logged : false, checkedAt: checked ? Date.now() : null } }]);
  haptic();
  await reload();
}

function openNotesImport(kind = 'wants') {
  const body = `
    <p class="sub">In Notes, select your list and copy it, then paste here. Section headings become ${kind === 'wants' ? 'brands/groups' : 'categories (and stores)'}; checked items come in as ${kind === 'wants' ? 'bought' : 'got'}.</p>
    <div class="seg" role="radiogroup">
      <label><input type="radio" name="kind" value="wants" ${kind === 'wants' ? 'checked' : ''}> Wishlist</label>
      <label><input type="radio" name="kind" value="groceries" ${kind === 'groceries' ? 'checked' : ''}> Groceries</label>
    </div>
    <textarea name="text" rows="10" placeholder="Barbour&#10;- [ ] Powell Quilted Jacket"></textarea>
    <p class="sub" id="preview"></p>
    <div class="actions"><button type="button" class="btn primary" data-go>Import</button></div>`;
  openSheet('Paste from Notes', body, (d) => {
    const ta = $('[name=text]', d);
    const k = () => $('[name=kind]:checked', d).value;
    const preview = () => {
      const rows = parseChecklist(ta.value);
      const groups = new Set(rows.map((r) => r.group).filter(Boolean));
      const p = $('#preview', d);
      if (p) p.textContent = rows.length ? `${rows.length} items in ${groups.size} sections (${rows.filter((r) => r.checked).length} checked)` : '';
    };
    ta.oninput = preview;
    $('form', d).addEventListener('change', preview);
    $('[data-go]', d).onclick = async () => {
      const rows = parseChecklist(ta.value);
      if (!rows.length) return toast('No checklist items found');
      const now = new Date().toISOString();
      const ops =
        k() === 'wants'
          ? rows.map((r) => ({
              store: 'wants',
              put: { id: newId(), name: r.name, group: r.group, details: '', priority: 'Medium', notes: '', url: '', targetPrice: null, image: '', status: r.checked ? 'bought' : 'open', createdAt: now },
            }))
          : rows.map((r) => ({ store: 'groceries', put: { id: newId(), name: r.name, category: r.group, store: r.outer, checked: r.checked, logged: r.checked, createdAt: now } }));
      await write(ops);
      d.close();
      tab = k() === 'wants' ? 'want' : 'groceries';
      store('tab', tab);
      await reload();
      toast(`Imported ${rows.length} items`);
    };
  });
}

// ---------- settings ----------
async function exportData() {
  const json = JSON.stringify(makeExport(S), null, 2);
  const name = `cartwise-backup-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Cartwise backup' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    store('lastExport', new Date().toISOString());
    render();
    toast('Backup exported');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Export failed: ' + e.message);
  }
}

async function openSettings() {
  let persisted = null;
  try {
    persisted = await navigator.storage?.persisted?.();
  } catch {}
  const last = store('lastExport');
  const body = `
    <div class="stats">
      <div><span>Purchases</span><b>${S.trips.length}</b></div>
      <div><span>Products</span><b>${S.products.length}</b></div>
      <div><span>Wants</span><b>${S.wants.filter((w) => w.status !== 'bought').length}</b></div>
    </div>
    <h3>Backup</h3>
    <p class="sub">Your data lives only on this phone. Export saves a file you can keep in iCloud Drive. Last export: <b>${last ? fmtDate(last.slice(0, 10)) : 'never'}</b>.</p>
    <div class="actions"><label class="btn">Import backup<input type="file" accept="application/json,.json" hidden data-import></label>
      <button type="button" class="btn primary" data-export>Export backup</button></div>
    <h3>Bring in your lists</h3>
    <p class="sub">Paste a checklist from the Notes app into your wishlist or groceries.</p>
    <button type="button" class="btn ghost" data-notes>Paste from Notes</button>
    <h3>Storage</h3>
    <p class="sub">${persisted ? 'Persistent storage is on, so Safari won’t clear your data on its own.' : 'Storage isn’t marked persistent yet. Adding Cartwise to your Home Screen helps; exporting regularly keeps you safe either way.'}</p>
    ${persisted ? '' : '<button type="button" class="btn ghost" data-persist>Request persistent storage</button>'}
    <h3>Tips</h3>
    <p class="sub">Swipe right on a row to check it off or mark it bought, left to delete. Tap the camera button in Prices to scan a barcode.</p>
    <p class="sub version">Cartwise v${window.CARTWISE_VERSION || ''} · “From link” images use the free Microlink preview service.</p>`;
  openSheet('Settings', body, (d) => {
    $('[data-export]', d).onclick = exportData;
    $('[data-notes]', d).onclick = () => openNotesImport(tab === 'groceries' ? 'groceries' : 'wants');
    $('[data-import]', d).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = parseImport(await f.text());
        if (!confirm(`Replace everything on this phone with this backup (${data.trips.length} purchases)?`)) return;
        await replaceAll(data);
        d.close();
        await reload();
        toast('Backup imported');
      } catch (err) {
        toast(err.message);
      }
    };
    const p = $('[data-persist]', d);
    if (p)
      p.onclick = async () => {
        const ok = await navigator.storage?.persist?.();
        toast(ok ? 'Persistent storage on' : 'Safari declined — add to Home Screen and try again');
        openSettings();
      };
  });
}

// ---------- tabs ----------
function groupBy(items, key) {
  const m = new Map();
  for (const it of items) {
    const k = key(it) || '';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return [...m.entries()];
}
function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function renderWant() {
  const view = store('wantView') || 'list';
  const open = S.wants.filter((w) => w.status !== 'bought');
  const bought = S.wants.filter((w) => w.status === 'bought').sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || ''));
  const order = { High: 0, Medium: 1, Low: 2 };
  const meta = (w) => {
    const st = statsForName(w.name);
    return [
      w.details && esc(w.details),
      w.targetPrice != null && `target ${formatMoney(w.targetPrice)}`,
      st && `paid ${formatMoney(st.last.price)}`,
      w.status === 'bought' && w.boughtAt && `bought ${fmtShort(w.boughtAt.slice(0, 10))}`,
    ].filter(Boolean).join(' · ');
  };
  const prio = (w) => (w.status !== 'bought' && w.priority && w.priority !== 'Medium' ? `<span class="tag p-${esc(lc(w.priority))}">${esc(w.priority)}</span>` : '');
  const row = (w) =>
    swipeRow(
      `<div class="cell tap" data-want="${w.id}">${thumb(w, 48)}
        <div class="grow"><div class="title">${esc(w.name)} ${prio(w)}</div>
        ${meta(w) ? `<div class="sub">${meta(w)}</div>` : ''}
        ${w.notes ? `<div class="sub note">${esc(w.notes)}</div>` : ''}</div>
        ${w.url ? `<a class="link-btn" href="${esc(w.url)}" target="_blank" rel="noopener" aria-label="Open ${esc(safeHost(w.url))}">↗</a>` : ''}</div>`,
      w.status === 'bought' ? { left: 'Delete', attrs: `data-want-row="${w.id}"` } : { right: 'Bought', left: 'Delete', attrs: `data-want-row="${w.id}"` }
    );
  const tile = (w) => `<li class="tile tap" data-want="${w.id}">${thumb(w, 160)}<div class="tile-text"><div class="title">${esc(w.name)}</div>
      <div class="sub">${[w.details && esc(w.details), w.targetPrice != null && formatMoney(w.targetPrice)].filter(Boolean).join(' · ')}</div></div>${prio(w)}</li>`;
  const groups = groupBy(open, (w) => w.group).sort((a, b) => (a[0] || '~').localeCompare(b[0] || '~'));
  for (const [, items] of groups)
    items.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const q = lc($('#want-search')?.value);
  const shown = q ? groups.map(([g, xs]) => [g, xs.filter((w) => lc(w.name).includes(q) || lc(g).includes(q) || lc(w.details).includes(q))]).filter(([, xs]) => xs.length) : groups;
  return `
    <div class="tab-head">
      <input id="want-search" type="search" placeholder="Search ${open.length} wants" value="${esc(q)}">
      <div class="seg-toggle" role="group" aria-label="View">
        <button data-want-view="list" aria-pressed="${view === 'list'}" aria-label="List view">☰</button>
        <button data-want-view="grid" aria-pressed="${view === 'grid'}" aria-label="Grid view">▦</button>
      </div>
    </div>
    ${open.length
      ? shown.map(([g, items]) => `<section class="group"><h3>${esc(g || 'Other')} <span class="count">${items.length}</span>
          <button class="add-in-group" data-new-want-group="${esc(g)}" aria-label="Add to ${esc(g || 'Other')}">+</button></h3>
          ${view === 'grid' ? `<ul class="tiles">${items.map(tile).join('')}</ul>` : `<ul class="list">${items.map(row).join('')}</ul>`}</section>`).join('')
        || '<p class="empty small">No matches.</p>'
      : `<div class="empty">Nothing on your wishlist yet.<br><button class="btn ghost" data-notes-import="wants">Paste from Notes</button></div>`}
    ${bought.length ? `<details><summary>Bought (${bought.length})</summary><ul class="list">${bought.map(row).join('')}</ul></details>` : ''}`;
}

function renderGroceries() {
  const need = S.groceries.filter((g) => !g.checked);
  const got = S.groceries.filter((g) => g.checked);
  const toLog = got.filter((g) => !g.logged);
  const catOrder = (c) => {
    const i = GROCERY_CATS.indexOf(c);
    return i < 0 ? GROCERY_CATS.length - 1 : i;
  };
  const row = (g) => {
    const st = statsForName(g.name);
    return swipeRow(
      `<div class="cell ${g.checked ? 'done' : ''}">
        <button class="checkbox ${g.checked ? 'on' : ''}" data-toggle="${g.id}" aria-label="${g.checked ? 'Uncheck' : 'Check'} ${esc(g.name)}" aria-pressed="${!!g.checked}"></button>
        <div class="grow tap" data-grocery="${g.id}"><div class="title">${esc(g.name)}</div>
        ${st ? `<div class="sub">${formatMoney(st.last.price)}${shopping ? '' : ` at ${esc(st.lastStore)}`}</div>` : ''}</div></div>`,
      { right: g.checked ? 'Need' : 'Got', left: 'Delete', attrs: `data-grocery-row="${g.id}"` }
    );
  };
  const sortItems = (xs) =>
    [...xs].sort((a, b) => (a.store || '').localeCompare(b.store || '') || catOrder(a.category) - catOrder(b.category) || a.name.localeCompare(b.name));
  const section = (items) =>
    groupBy(sortItems(items), (g) => [g.store, g.category].filter(Boolean).join(' · '))
      .map(([k, xs]) => `<section class="group"><h3>${esc(k || 'Other')}</h3><ul class="list">${xs.map(row).join('')}</ul></section>`)
      .join('');

  if (shopping) {
    // Shopping mode: what you need plus what you've grabbed this trip, checked items sink to the bottom of each group.
    const trip = S.groceries.filter((g) => !g.checked || (g.checked && !g.logged));
    const grouped = groupBy(sortItems(trip), (g) => [g.store, g.category].filter(Boolean).join(' · '));
    const left = trip.filter((g) => !g.checked).length;
    return `
      <div class="shop-head"><div><b>${left}</b> left · ${toLog.length} in cart</div><button class="btn" data-shop-done>Done</button></div>
      ${grouped.length ? grouped.map(([k, xs]) => `<section class="group"><h3>${esc(k || 'Other')}</h3><ul class="list big">${[...xs].sort((a, b) => a.checked - b.checked).map(row).join('')}</ul></section>`).join('')
        : '<p class="empty">Nothing needed. Nice.</p>'}
      ${toLog.length ? `<div class="actions sticky"><button class="btn primary" data-log-checked>Log ${toLog.length} as purchase</button></div>` : ''}`;
  }
  return `
    ${S.groceries.length ? `
      <div class="tab-head"><h2 class="section-title">Need <span class="count">${need.length}</span></h2>
        ${need.length ? '<button class="btn primary" data-shop>Start shopping</button>' : ''}</div>
      ${need.length ? section(need) : '<p class="empty small">Nothing needed. Swipe items in Got back when you run low.</p>'}
      ${got.length ? `<details ${need.length ? '' : 'open'}><summary>Got (${got.length})</summary>${section(got)}
        <button class="btn ghost" data-uncheck-all>Need everything again</button></details>` : ''}`
      : `<div class="empty">Add your staples once; they stay here. Check them off as you shop, swipe back when you run low.<br><button class="btn ghost" data-notes-import="groceries">Paste from Notes</button></div>`}
    ${toLog.length ? `<div class="actions sticky"><button class="btn primary" data-log-checked>Log ${toLog.length} as purchase</button></div>` : ''}`;
}

function renderPrices() {
  const q = lc($('#price-search')?.value);
  const trips = byId(S.trips);
  const lastDate = {};
  for (const l of S.lines) {
    const d = trips[l.tripId]?.date || '';
    if (!lastDate[l.productId] || d > lastDate[l.productId]) lastDate[l.productId] = d;
  }
  const list = S.products
    .filter((p) => !q || lc(p.name).includes(q) || lc(p.brand).includes(q) || lc(p.category).includes(q))
    .sort((a, b) => (lastDate[b.id] || '').localeCompare(lastDate[a.id] || '') || a.name.localeCompare(b.name));
  return `
    <div class="tab-head">
      <input id="price-search" type="search" placeholder="Search items, brands, categories" value="${esc(q)}">
      <button class="btn icon" data-scan-price aria-label="Scan a barcode">⌁ Scan</button>
    </div>
    ${list.length ? `<ul class="list">${list
      .map((p) => {
        const hist = historyFor([p.id]);
        const st = productStats(hist);
        return `<li class="tap" data-product="${p.id}"><div class="grow"><div class="title">${dot(lastRating(hist))}${esc(p.name)}${p.brand ? ` <span class="sub">${esc(p.brand)}</span>` : ''}</div>
          <div class="sub">${st ? `${st.count}× · ${fmtShort(st.last.date)} at ${esc(st.lastStore)}` : 'No purchases'}</div></div>
          ${st ? sparkline(trendValues(hist)) : ''}
          <div class="right">${st ? `<b>${formatUnitPrice(st.last.unit)}</b><div class="sub">low ${formatUnitPrice(st.lowest.unit)}</div>` : ''}</div></li>`;
      })
      .join('')}</ul>` : `<p class="empty">${S.products.length ? 'No matches.' : 'Prices show up here after you log a purchase.'}</p>`}`;
}

function renderHistory() {
  const stores = byId(S.stores);
  const trips = [...S.trips].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const tripsById = byId(S.trips);
  const totals = {};
  for (const l of S.lines) totals[l.tripId] = (totals[l.tripId] || 0) + lineTotal(l);
  const month = today().slice(0, 7);
  const monthSpend = Object.entries(totals).reduce((s, [id, t]) => (tripsById[id]?.date.startsWith(month) ? s + t : s), 0);
  const counts = {};
  for (const l of S.lines) counts[l.tripId] = (counts[l.tripId] || 0) + 1;
  const byMonth = groupBy(trips, (t) => t.date.slice(0, 7));
  return `
    <div class="summary-card"><span class="sub">This month</span><b>${formatMoney(monthSpend)}</b></div>
    ${trips.length ? byMonth.map(([m, ts]) => `<section class="group"><h3>${new Date(m + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><ul class="list">${ts
      .map((t) => swipeRow(`<div class="cell tap" data-trip="${t.id}"><div class="grow"><div class="title">${esc(stores[t.storeId]?.name || 'Unknown store')}</div>
          <div class="sub">${fmtShort(t.date)} · ${counts[t.id] || 0} item${counts[t.id] === 1 ? '' : 's'}</div></div>
          <div class="right"><b>${formatMoney(totals[t.id] || 0)}</b></div></div>`, { left: 'Delete', attrs: `data-trip-row="${t.id}"` }))
      .join('')}</ul></section>`).join('') : '<p class="empty">No purchases yet. Tap + after your next shopping trip.</p>'}`;
}

const FAB = { want: 'Add want', groceries: 'Add staple', prices: 'Log purchase', history: 'Log purchase' };

function render() {
  renderDatalists();
  const view = { want: renderWant, groceries: renderGroceries, prices: renderPrices, history: renderHistory }[tab];
  const main = $('#main');
  const focusId = document.activeElement?.id;
  const keepFocus = ['price-search', 'want-search'].includes(focusId);
  main.innerHTML = view();
  if (keepFocus) {
    const s = $('#' + focusId);
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  }
  document.body.classList.toggle('shopping', shopping && tab === 'groceries');
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const fab = $('#fab');
  fab.setAttribute('aria-label', FAB[tab]);
  fab.hidden = shopping && tab === 'groceries';
  document.body.classList.toggle('has-sticky', !!$('.actions.sticky', main));
  const last = store('lastExport');
  const stale = S.trips.length >= 3 && (!last || Date.now() - Date.parse(last) > 14 * 864e5);
  $('#backup-banner').hidden = !stale;
}

async function setShopping(on) {
  shopping = on;
  try {
    if (on && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) await wakeLock.release(), (wakeLock = null);
  } catch {}
  render();
  window.scrollTo(0, 0);
}

// ---------- events ----------
function wire() {
  $('#tabs').onclick = (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    if (b.dataset.tab === tab) return window.scrollTo({ top: 0, behavior: 'smooth' });
    tab = b.dataset.tab;
    store('tab', tab);
    render();
    window.scrollTo(0, 0);
  };
  $('#settings-btn').onclick = openSettings;
  $('#backup-banner').onclick = openSettings;
  $('#fab').onclick = () => {
    haptic();
    if (tab === 'want') openWant();
    else if (tab === 'groceries') openGrocery();
    else openPurchase();
  };

  const main = $('#main');
  enableSwipe(main);
  main.addEventListener('input', (e) => {
    if (e.target.id === 'price-search' || e.target.id === 'want-search') render();
  });
  main.addEventListener('swipe', async (e) => {
    const r = e.target;
    const dir = e.detail;
    if (r.dataset.groceryRow) {
      const g = S.groceries.find((x) => x.id === r.dataset.groceryRow);
      return dir === 'right' ? toggleGrocery(g) : deleteGrocery(g);
    }
    if (r.dataset.wantRow) {
      const w = S.wants.find((x) => x.id === r.dataset.wantRow);
      return dir === 'right' ? markWantBought(w) : deleteWant(w);
    }
    if (r.dataset.tripRow && dir === 'left') {
      const t = S.trips.find((x) => x.id === r.dataset.tripRow);
      const ls = S.lines.filter((l) => l.tripId === t.id);
      await write([{ store: 'trips', del: t.id }, ...ls.map((l) => ({ store: 'lines', del: l.id }))]);
      await reload();
      toast('Purchase deleted', { label: 'Undo', run: async () => { await write([{ store: 'trips', put: t }, ...ls.map((l) => ({ store: 'lines', put: l }))]); reload(); } });
    }
  });
  main.addEventListener('click', async (e) => {
    if (e.target.closest('.link-btn')) return;
    if (e.target.closest('[data-just-swiped]')) return;
    const t = (sel) => e.target.closest(sel);
    if (t('[data-toggle]')) return toggleGrocery(S.groceries.find((g) => g.id === t('[data-toggle]').dataset.toggle));
    if (t('[data-want-view]')) return store('wantView', t('[data-want-view]').dataset.wantView), render();
    if (t('[data-new-want-group]')) return openWant(null, { group: t('[data-new-want-group]').dataset.newWantGroup });
    if (t('[data-want]')) return openWant(S.wants.find((w) => w.id === t('[data-want]').dataset.want));
    if (t('[data-trip]')) return openPurchase({ trip: S.trips.find((x) => x.id === t('[data-trip]').dataset.trip) });
    if (t('[data-product]')) return openProduct(S.products.find((x) => x.id === t('[data-product]').dataset.product));
    if (t('[data-scan-price]')) return priceCheckScan();
    if (t('[data-notes-import]')) return openNotesImport(t('[data-notes-import]').dataset.notesImport);
    if (t('[data-grocery]')) return openGrocery(S.groceries.find((g) => g.id === t('[data-grocery]').dataset.grocery));
    if (t('[data-shop]')) return setShopping(true);
    if (t('[data-shop-done]')) return setShopping(false);
    if (t('[data-uncheck-all]')) {
      if (!confirm('Move everything back to Need?')) return;
      await write(S.groceries.filter((g) => g.checked).map((g) => ({ store: 'groceries', put: { ...g, checked: false, logged: false } })));
      return reload();
    }
    if (t('[data-log-checked]')) {
      const toLog = S.groceries.filter((g) => g.checked && !g.logged);
      const stores = [...new Set(toLog.map((g) => g.store).filter(Boolean))];
      return openPurchase({
        storeName: stores.length === 1 ? stores[0] : undefined,
        prefill: toLog.map((g) => {
          const p = productsNamed(g.name)[0];
          return { name: g.name, brand: p?.brand, size: p?.defaultSize, unit: p?.defaultUnit, barcode: p?.barcode };
        }),
        // Mark logged, and remember the store for staples that didn't have one.
        onSaved: async ({ storeName }) => {
          await write(toLog.map((g) => ({ store: 'groceries', put: { ...g, logged: true, store: g.store || storeName } })));
          if (shopping) shopping = false;
        },
      });
    }
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && shopping && navigator.wakeLock && (!wakeLock || wakeLock.released)) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    }
  });
}

async function start() {
  tab = store('tab') || 'want';
  wire();
  await reload();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

start();

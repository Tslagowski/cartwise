import { loadAll, write, replaceAll, newId } from './db.js';
import { UNITS, unitPrice, lineTotal, formatMoney, formatUnitPrice } from './lib/units.js';
import { priceHistory, productStats, rate, lastRating, trendValues } from './lib/stats.js';
import { makeExport, parseImport } from './lib/backup.js';
import { parseChecklist } from './lib/notes.js';
import { sparkPath, sparkEnd } from './lib/spark.js';
import { AISLES, WANT_CATEGORIES, aisleFor, classifyWant } from './lib/categorize.js';
import { migrateAll, SCHEMA, splitItemName } from './lib/migrate.js';
import { scanBarcode } from './scanner.js';

// ---------- state ----------
let S = { stores: [], products: [], trips: [], lines: [], wants: [], groceries: [] };
let tab = 'groceries';
const ui = {
  storeFilter: '',         // groceries: '' = all stores
  wantFilter: 'All',       // wishlist category chip
  pricesView: 'items',     // 'items' | 'trips'
};
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

// ---------- small visual helpers ----------
function sparkline(values, w = 56, h = 22, cls = '') {
  const d = sparkPath(values, w, h, 3);
  if (!d) return '';
  const end = sparkEnd(values, w, h, 3);
  return `<svg class="spark ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><circle cx="${end.x}" cy="${end.y}" r="2.5"/></svg>`;
}
const dot = (r) => (r ? `<span class="dot ${r}" title="${{ good: 'Good price', ok: 'Typical', high: 'Higher than usual' }[r]}"></span>` : '');
const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

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
  // An open <dialog> sits in the browser's top layer, above everything in <body>,
  // so show the toast inside whichever dialog is open or it would be hidden.
  const host = $('#scanner').open ? $('#scanner') : sheet().open ? sheet() : document.body;
  if (t.parentElement !== host) host.append(t);
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.run(); };
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), Math.max(action ? 5000 : 2200, msg.length * 65));
}

// ---------- swipe to reveal ----------
// Swiping left only *reveals* action buttons (like Mail/Gmail). Nothing happens until you tap one.
// <li class="swipe"><div class="swipe-actions">buttons</div><div class="swipe-content">…</div></li>
let openRow = null;
function closeOpenRow() {
  if (!openRow) return false;
  const c = openRow.querySelector('.swipe-content');
  c.style.transition = 'transform .22s ease';
  c.style.transform = '';
  const r = openRow;
  r.classList.remove('open');
  setTimeout(() => { if (!r.classList.contains('open')) r.classList.remove('reveal'); }, 240);
  openRow = null;
  return true;
}
function enableSwipe(root) {
  let row, content, width, startX, startY, base, dx, locked;
  root.addEventListener('touchstart', (e) => {
    const r = e.target.closest('.swipe');
    if (!r || e.target.closest('.swipe-actions')) return;
    if (openRow && openRow !== r) closeOpenRow();
    row = r;
    content = r.querySelector('.swipe-content');
    width = r.querySelector('.swipe-actions').offsetWidth;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    base = r.classList.contains('open') ? -width : 0;
    dx = 0;
    locked = null;
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!row) return;
    const x = e.touches[0].clientX - startX, y = e.touches[0].clientY - startY;
    if (locked === null && (Math.abs(x) > 10 || Math.abs(y) > 10)) locked = Math.abs(x) > Math.abs(y) * 1.2 ? 'x' : 'y';
    if (locked !== 'x') return;
    e.preventDefault();
    row.classList.add('reveal');
    dx = x;
    let pos = base + dx;
    if (pos > 0) pos = 0;
    if (pos < -width) pos = -width - (-width - pos) * 0.25; // rubber band past the buttons
    content.style.transition = 'none';
    content.style.transform = `translateX(${pos}px)`;
  }, { passive: false });
  root.addEventListener('touchend', () => {
    if (!row) return;
    const r = row;
    row = null;
    if (locked !== 'x') return;
    const pos = base + dx;
    const c = r.querySelector('.swipe-content');
    c.style.transition = 'transform .22s ease';
    if (pos < -width / 2.5) {
      c.style.transform = `translateX(${-width}px)`;
      if (!r.classList.contains('open')) haptic();
      r.classList.add('open');
      openRow = r;
    } else {
      c.style.transform = '';
      r.classList.remove('open');
      setTimeout(() => { if (!r.classList.contains('open')) r.classList.remove('reveal'); }, 240);
      if (openRow === r) openRow = null;
    }
    r.dataset.justSwiped = '1';
    setTimeout(() => delete r.dataset.justSwiped, 350);
  });
}
const swipeRow = (inner, actions, attrs = '') =>
  `<li class="swipe" ${attrs}><div class="swipe-actions">${actions
    .map((a) => `<button type="button" class="sa ${a.cls || ''}" data-act="${a.act}">${esc(a.label)}</button>`)
    .join('')}</div><div class="swipe-content">${inner}</div></li>`;

// ---------- custom categories & stores ----------
// Wishlist categories = the defaults plus any you've created (kept on the items that use them).
function wantCategories() {
  const custom = [...new Set(S.wants.map((w) => w.category).filter((c) => c && !WANT_CATEGORIES.includes(c)))].sort();
  return [...WANT_CATEGORIES.filter((c) => c !== 'Other'), ...custom, 'Other'];
}
// Grocery aisles = the defaults plus any you've created (kept on the items that use them).
function groceryAisles() {
  const custom = [...new Set(S.groceries.map((g) => g.aisle).filter((a) => a && !AISLES.includes(a)))].sort();
  return [...AISLES.filter((a) => a !== 'Other'), ...custom, 'Other'];
}
// Grocery stores = stores you've added or shopped at, plus any set on items.
function storeNames() {
  return [...new Set([...S.stores.map((s) => s.name), ...S.groceries.map((g) => g.store)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
async function addStore(name) {
  name = name.trim();
  if (!name) return null;
  const existing = S.stores.find((s) => lc(s.name) === lc(name));
  if (existing) return existing.name;
  await write([{ store: 'stores', put: { id: newId(), name } }]);
  S.stores.push({ name });
  return name;
}
// A "+ New" chip that turns into a text box. onAdd(name) runs on Enter.
const newChip = (label, kind) => `<button type="button" class="chip add-chip" data-newchip="${kind}">+ ${esc(label)}</button>`;
function openNewChip(btn, placeholder, onAdd) {
  const input = document.createElement('input');
  input.className = 'chip-input';
  input.placeholder = placeholder;
  input.enterKeyHint = 'done';
  btn.replaceWith(input);
  input.focus();
  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (commit && v) await onAdd(v, input);
    if (input.isConnected) input.replaceWith(btn);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}
// Insert a checked radio chip before the "+ New" input inside a chip group.
function addRadioChip(input, name, value) {
  const group = input.closest('.chips');
  const dup = [...group.querySelectorAll(`input[name="${name}"]`)].find((r) => lc(r.value) === lc(value));
  if (dup) return (dup.checked = true);
  const label = document.createElement('label');
  label.className = 'chip';
  label.innerHTML = `<input type="radio" name="${name}" value="${esc(value)}" checked>${esc(value)}`;
  input.before(label);
}

// ---------- datalists ----------
function renderDatalists() {
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const fill = (id, xs) => ($(id).innerHTML = uniq(xs).map((n) => `<option value="${esc(n)}">`).join(''));
  fill('#dl-products', [...S.products.map((p) => p.name), ...S.groceries.map((g) => g.name)]);
  fill('#dl-brands', [...S.products.map((p) => p.brand), ...S.wants.map((w) => w.brand), ...S.groceries.map((g) => g.brand)]);
  fill('#dl-stores', [...S.stores.map((s) => s.name), ...S.groceries.map((g) => g.store)]);
  fill('#dl-categories', S.products.map((p) => p.category));
}

// =====================================================================
// GROCERIES — one list sorted by store aisle, quick add, usuals, cart
// =====================================================================
const aisleIndex = (a) => {
  const i = groceryAisles().indexOf(a || 'Other');
  return i < 0 ? 999 : i;
};
const groceryStores = () => storeNames();
const inStoreFilter = (g) => !ui.storeFilter || !g.store || g.store === ui.storeFilter;

function renderGroceries() {
  const items = S.groceries.filter(inStoreFilter);
  const need = items.filter((g) => g.status === 'need');
  const cart = items.filter((g) => g.status === 'cart');
  const usuals = items.filter((g) => g.status === 'stocked');
  const stores = groceryStores();

  const row = (g) => {
    const st = statsForName(g.name);
    return swipeRow(
      `<div class="cell ${g.status === 'cart' ? 'done' : ''}">
        <button type="button" class="check-hit" data-gtoggle="${g.id}" aria-label="${g.status === 'cart' ? 'Take out of cart' : 'Put in cart'}: ${esc(g.name)}" aria-pressed="${g.status === 'cart'}"><span class="checkbox ${g.status === 'cart' ? 'on' : ''}"></span></button>
        <div class="grow tap" data-gopen="${g.id}"><div class="title">${g.qty ? `<span class="qty">${esc(g.qty)}</span>` : ''}${esc(g.name)}</div>${g.brand || g.details ? `<div class="sub">${[g.brand && `<b>${esc(g.brand)}</b>`, g.details && esc(g.details)].filter(Boolean).join(' · ')}</div>` : ''}</div>
        ${st ? `<span class="sub price tap" data-gopen="${g.id}">${formatMoney(st.last.price)}</span>` : ''}
      </div>`,
      [{ act: 'gremove', label: 'Remove', cls: 'red' }],
      `data-gid="${g.id}"`
    );
  };
  const byAisle = (xs) =>
    groupBy([...xs].sort((a, b) => aisleIndex(a.aisle) - aisleIndex(b.aisle) || a.name.localeCompare(b.name)), (g) => g.aisle || 'Other');

  return `
    ${S.groceries.length ? `<div class="chips scroll" role="tablist">${['', ...stores]
      .map((s) => `<button class="chip ${ui.storeFilter === s ? 'on' : ''}" data-store-filter="${esc(s)}">${esc(s || 'All stores')}</button>`)
      .join('')}${newChip('Store', 'store-filter')}</div>` : ''}
    <form class="quick-add" data-quick-add autocomplete="off">
      <input name="q" placeholder="Add an item" enterkeyhint="done" aria-label="Add an item">
      <div class="suggest" hidden></div>
    </form>
    ${need.length
      ? byAisle(need).map(([a, xs]) => `<section class="group"><h3>${esc(a)}</h3><ul class="list">${xs.map(row).join('')}</ul></section>`).join('')
      : `<div class="empty">${S.groceries.length ? '<b>All set.</b><br>Nothing on your list. Add items above or tap your usuals below.' : 'Your grocery list is empty.<br><button class="btn ghost" data-notes-import="groceries">Paste a list from Notes</button>'}</div>`}
    ${cart.length ? `<section class="group"><h3>In cart · ${cart.length}</h3><ul class="list">${cart.map(row).join('')}</ul></section>` : ''}
    ${usuals.length ? `<details class="usuals" ${need.length ? '' : 'open'}><summary>Your usuals · ${usuals.length}</summary>
      <p class="sub hint-line">Tap to add back to your list.</p>
      ${byAisle(usuals).map(([a, xs]) => `<div class="usual-group"><div class="usual-aisle">${esc(a)}</div><div class="chips wrap">${xs
        .map((g) => `<button class="chip" data-usual="${g.id}">${esc(g.name)}</button>`).join('')}</div></div>`).join('')}
    </details>` : ''}
    ${cart.length ? `<div class="actions sticky"><button class="btn primary" data-finish>Finish shopping · ${cart.length} in cart</button></div>` : ''}`;
}

function wireQuickAdd() {
  const form = $('[data-quick-add]');
  if (!form) return;
  const input = form.q, box = $('.suggest', form);
  const matches = () => {
    const q = lc(input.value);
    if (!q) return [];
    return S.groceries.filter((g) => g.status !== 'need' && lc(g.name).includes(q)).slice(0, 6);
  };
  input.addEventListener('input', () => {
    const m = matches();
    box.hidden = !m.length;
    box.innerHTML = m.map((g) => `<button type="button" data-usual="${g.id}"><span>${esc(g.name)}${g.brand || g.details ? ` <span class="sub">${esc([g.brand, g.details].filter(Boolean).join(' · '))}</span>` : ''}</span><span class="sub">${esc(g.aisle)}</span></button>`).join('');
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { name, details } = splitItemName(input.value.trim());
    if (!name) return;
    const existing = S.groceries.find((g) => lc(g.name) === lc(name));
    if (existing) {
      if (existing.status === 'need') { toast('Already on your list'); input.value = ''; return; }
      await write([{ store: 'groceries', put: { ...existing, status: 'need', details: details || existing.details || '' } }]);
    } else {
      await write([{ store: 'groceries', put: { id: newId(), name, details, qty: '', aisle: aisleFor(name), store: ui.storeFilter, status: 'need', createdAt: new Date().toISOString(), v: SCHEMA } }]);
    }
    haptic();
    await reload();
    $('[data-quick-add] input')?.focus();
  };
}

async function setGrocery(g, patch, undoMsg) {
  await write([{ store: 'groceries', put: { ...g, ...patch } }]);
  await reload();
  if (undoMsg) toast(undoMsg, { label: 'Undo', run: async () => { await write([{ store: 'groceries', put: g }]); reload(); } });
}

function openGrocery(g) {
  const isNew = !g;
  g = g || { id: newId(), name: '', brand: '', details: '', qty: '', aisle: 'Other', store: ui.storeFilter, status: 'need', createdAt: new Date().toISOString(), v: SCHEMA };
  const body = `
    <div class="group-box form">
      <div class="name-qty">
        <label class="grow">Item<input name="name" value="${esc(g.name)}" placeholder="e.g. Potatoes"></label>
        <label class="qty-field">Qty<input name="qty" value="${esc(g.qty)}" placeholder="1" autocomplete="off"></label>
      </div>
      <label>Brand<input name="brand" list="dl-brands" value="${esc(g.brand)}" placeholder="e.g. Fage, Kirkland, any" autocomplete="off"></label>
      <label>Details<textarea name="details" rows="2" placeholder="Type, brand, size, flavor… e.g. gold or russet, 5 lb bag">${esc(g.details)}</textarea></label>
    </div>
    <h3>Usual store</h3>
    <div class="chips wrap" role="radiogroup">${['', ...storeNames()].map((s) => `<label class="chip"><input type="radio" name="store" value="${esc(s)}" ${s === (g.store || '') ? 'checked' : ''}>${esc(s || 'Any store')}</label>`).join('')}${newChip('New store', 'store')}</div>
    <h3>Aisle</h3>
    <div class="chips wrap" role="radiogroup">${groceryAisles().map((a) => `<label class="chip"><input type="radio" name="aisle" value="${esc(a)}" ${a === (g.aisle || 'Other') ? 'checked' : ''}>${esc(a)}</label>`).join('')}${newChip('New aisle', 'aisle')}</div>
    <div class="actions">
      ${isNew ? '' : '<button type="button" class="btn danger" data-delete>Delete item</button>'}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(isNew ? 'New item' : 'Edit item', body, (d) => {
    $('[data-newchip=aisle]', d).onclick = (e) =>
      openNewChip(e.currentTarget, 'Aisle name', (v, input) => {
        addRadioChip(input, 'aisle', v.replace(/^./, (c) => c.toUpperCase()));
        aisleTouched = true;
      });
    $('[data-newchip=store]', d).onclick = (e) =>
      openNewChip(e.currentTarget, 'Store name', async (v, input) => addRadioChip(input, 'store', await addStore(v)));
    const nameEl = $('[name=name]', d);
    let aisleTouched = !isNew;
    $$('[name=aisle]', d).forEach((r) => r.addEventListener('change', () => (aisleTouched = true)));
    nameEl.addEventListener('input', () => {
      if (aisleTouched) return;
      const a = aisleFor(nameEl.value);
      const r = $(`[name=aisle][value="${CSS.escape(a)}"]`, d);
      if (r) r.checked = true;
    });
    $('[data-save]', d).onclick = async () => {
      const name = nameEl.value.trim();
      if (!name) return toast('Name is required');
      await write([{ store: 'groceries', put: { ...g, name, brand: $('[name=brand]', d).value.trim(), qty: $('[name=qty]', d).value.trim(), details: $('[name=details]', d).value.trim(), store: $('[name=store]:checked', d)?.value || '', aisle: $('[name=aisle]:checked', d)?.value || 'Other' } }]);
      d.close();
      await reload();
    };
    const del = $('[data-delete]', d);
    if (del)
      del.onclick = async () => {
        await write([{ store: 'groceries', del: g.id }]);
        d.close();
        await reload();
        toast(`Deleted ${g.name}`, { label: 'Undo', run: async () => { await write([{ store: 'groceries', put: g }]); reload(); } });
      };
  });
}

function openFinish() {
  const cart = S.groceries.filter((g) => g.status === 'cart' && inStoreFilter(g));
  const body = `
    <p class="sub">${cart.length} item${cart.length === 1 ? '' : 's'} in your cart. Logging prices builds your price history, or you can just clear the cart.</p>
    <div class="actions stack">
      <button type="button" class="btn primary" data-log>Log prices</button>
      <button type="button" class="btn" data-clear>Clear cart without logging</button>
    </div>`;
  openSheet('Finish shopping', body, (d) => {
    const done = async (storeName) =>
      write(cart.map((g) => ({ store: 'groceries', put: { ...g, status: 'stocked', store: g.store || storeName || '', lastBought: today() } })));
    $('[data-clear]', d).onclick = async () => {
      await done();
      d.close();
      await reload();
      toast('Cart cleared');
    };
    $('[data-log]', d).onclick = () => {
      const stores = [...new Set(cart.map((g) => g.store).filter(Boolean))];
      openPurchase({
        storeName: ui.storeFilter || (stores.length === 1 ? stores[0] : undefined),
        prefill: cart.map((g) => {
          const ps = productsNamed(g.name);
          const p = (g.brand && ps.find((x) => lc(x.brand) === lc(g.brand))) || ps[0];
          return { name: g.name, brand: g.brand || p?.brand, size: p?.defaultSize, unit: p?.defaultUnit, barcode: p?.barcode };
        }),
        onSaved: ({ storeName }) => done(storeName),
      });
    };
  });
}

// =====================================================================
// WISHLIST — filter by category; brand is a detail, not a heading
// =====================================================================
function renderWishlist() {
  const open = S.wants.filter((w) => w.status !== 'bought');
  const bought = S.wants.filter((w) => w.status === 'bought');
  const counts = {};
  for (const w of open) counts[w.category || 'Other'] = (counts[w.category || 'Other'] || 0) + 1;
  const allCats = wantCategories();
  const cats = allCats.filter((c) => counts[c]);
  if (!['All', 'Bought', ...cats].includes(ui.wantFilter)) ui.wantFilter = 'All';
  const q = lc($('#want-search')?.value);
  const pool = ui.wantFilter === 'Bought' ? bought : ui.wantFilter === 'All' ? open : open.filter((w) => (w.category || 'Other') === ui.wantFilter);
  const shown = pool.filter((w) => !q || [w.name, w.brand, w.details, w.notes].some((x) => lc(x).includes(q)));
  const order = { High: 0, Medium: 1, Low: 2 };
  const sortFn = (a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || a.name.localeCompare(b.name);

  const row = (w, showBrand) => {
    const st = statsForName(w.name);
    const sub = [showBrand && w.brand && `<b>${esc(w.brand)}</b>`, w.details && esc(w.details), st && `paid ${formatMoney(st.last.price)}`,
      w.status === 'bought' && w.boughtAt && `bought ${fmtShort(w.boughtAt.slice(0, 10))}`].filter(Boolean).join(' · ');
    return swipeRow(
      `<div class="cell tap" data-want="${w.id}">
        ${w.image ? `<img class="thumb" src="${esc(w.image)}" alt="" loading="lazy">` : ''}
        <div class="grow">
          <div class="title">${w.priority === 'High' ? `<span class="star" aria-label="Must-have">${ICON.star}</span>` : ''}${esc(w.name)}</div>
          ${sub ? `<div class="sub">${sub}</div>` : ''}
          ${w.notes ? `<div class="sub note">${esc(w.notes)}</div>` : ''}
        </div>
        ${w.targetPrice != null ? `<span class="pill">${formatMoney(w.targetPrice)}</span>` : ''}
        ${w.url ? `<a class="link-btn" href="${esc(w.url)}" target="_blank" rel="noopener" aria-label="Open ${esc(safeHost(w.url))}">${ICON.link}</a>` : ''}
      </div>`,
      w.status === 'bought'
        ? [{ act: 'wreopen', label: 'Want again', cls: 'gray' }, { act: 'wdelete', label: 'Delete', cls: 'red' }]
        : [{ act: 'wbought', label: 'Bought', cls: 'green' }, { act: 'wdelete', label: 'Delete', cls: 'red' }],
      `data-wid="${w.id}"`
    );
  };

  let listHtml;
  if (!S.wants.length) {
    listHtml = `<div class="empty">Nothing on your wishlist yet.<br><button class="btn ghost" data-notes-import="wants">Paste a list from Notes</button></div>`;
  } else if (!shown.length) {
    listHtml = `<p class="empty small">${q ? 'No matches.' : 'Nothing here.'}</p>`;
  } else if (ui.wantFilter === 'All') {
    listHtml = groupBy([...shown].sort((a, b) => allCats.indexOf(a.category || 'Other') - allCats.indexOf(b.category || 'Other')), (w) => w.category || 'Other')
      .map(([c, xs]) => `<section class="group"><h3>${esc(c)}</h3><ul class="list">${xs.sort(sortFn).map((w) => row(w, true)).join('')}</ul></section>`).join('');
  } else if (ui.wantFilter === 'Bought') {
    listHtml = `<ul class="list mt">${[...shown].sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || '')).map((w) => row(w, true)).join('')}</ul>`;
  } else {
    listHtml = groupBy([...shown].sort((a, b) => (a.brand || '~').localeCompare(b.brand || '~')), (w) => w.brand || 'No brand')
      .map(([brand, xs]) => `<section class="group"><h3>${esc(brand)}</h3><ul class="list">${xs.sort(sortFn).map((w) => row(w, false)).join('')}</ul></section>`).join('');
  }

  return `
    ${S.wants.length ? `<input id="want-search" type="search" placeholder="Search wishlist" value="${esc(q)}">
    <div class="chips scroll" role="tablist">
      ${['All', ...cats].map((c) => `<button class="chip ${ui.wantFilter === c ? 'on' : ''}" data-want-filter="${esc(c)}">${esc(c)} <span class="n">${c === 'All' ? open.length : counts[c]}</span></button>`).join('')}
      ${bought.length ? `<button class="chip ${ui.wantFilter === 'Bought' ? 'on' : ''}" data-want-filter="Bought">Bought <span class="n">${bought.length}</span></button>` : ''}
    </div>` : ''}
    ${listHtml}`;
}

// ---------- images ----------
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
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}
// Free link preview (Microlink, no key). Their free plan allows only a few lookups a day,
// so we read the rate-limit headers and say plainly when it's used up and when it resets.
async function linkPreview(url) {
  let res;
  try {
    res = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url));
  } catch {
    throw new Error('Couldn’t reach the photo lookup service. Check your connection.');
  }
  const json = await res.json().catch(() => ({}));
  const left = res.headers.get('x-rate-limit-remaining');
  const reset = Number(res.headers.get('x-rate-limit-reset'));
  if (json.code === 'ERATE' || res.status === 429) {
    const when = reset ? new Date(reset * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'tomorrow';
    const err = new Error(`Free photo lookups are used up until ${when}. Copy the image on the site and tap Paste.`);
    err.rate = true;
    throw err;
  }
  if (json.status !== 'success') throw new Error(json.message ? `No photo: ${json.message}` : 'That page didn’t share a photo. Try Paste instead.');
  return { image: json.data?.image?.url || json.data?.logo?.url || '', title: json.data?.title || '', left: left == null ? null : Number(left) };
}

// Paste an image copied from Safari (long-press the photo -> Copy). Free, no limits.
async function pastedImage() {
  if (!navigator.clipboard?.read) throw new Error('Pasting images isn’t supported here. Save the image and use + Photo.');
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error('Allow paste when asked, or save the image and use + Photo.');
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) {
      const url = URL.createObjectURL(await item.getType(type));
      try { return await compressImage(url); } finally { URL.revokeObjectURL(url); }
    }
    if (item.types.includes('text/plain')) {
      const text = (await (await item.getType('text/plain')).text()).trim();
      if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif|avif)(\?\S*)?$/i.test(text)) {
        try { return await compressImage(text); } catch { return text; }
      }
    }
  }
  throw new Error('No image on the clipboard. Long-press the photo on the site and tap Copy.');
}

function openWant(w) {
  const isNew = !w;
  w = w || { id: newId(), status: 'open', createdAt: new Date().toISOString(), category: ui.wantFilter !== 'All' && ui.wantFilter !== 'Bought' ? ui.wantFilter : 'Other', priority: 'Medium', v: SCHEMA };
  let image = w.image || '';
  const body = `
    <div class="group-box form">
      <div class="name-row">
        <button type="button" class="img-box" data-img aria-label="Photo">${image ? `<img src="${esc(image)}" alt="">` : '<span>+ Photo</span>'}</button>
        <label class="grow">Item<input name="name" value="${esc(w.name)}" placeholder="e.g. Powell Quilted Jacket"></label>
      </div>
      <label>Brand<input name="brand" list="dl-brands" value="${esc(w.brand)}" placeholder="e.g. Barbour" autocomplete="off"></label>
      <label>Size / fit / color<input name="details" value="${esc(w.details)}" placeholder="e.g. L, 33x34 athletic, black"></label>
    </div>
    <h3>Category</h3>
    <div class="chips wrap" role="radiogroup">${wantCategories().map((c) => `<label class="chip"><input type="radio" name="category" value="${esc(c)}" ${c === (w.category || 'Other') ? 'checked' : ''}>${esc(c)}</label>`).join('')}${newChip('New category', 'category')}</div>
    <div class="group-box form">
      <div class="grid2">
        <label>Target price<input name="targetPrice" inputmode="decimal" value="${esc(w.targetPrice ?? '')}" placeholder="Optional"></label>
        <div><span class="lbl">Priority</span><div class="seg-toggle full" role="radiogroup">${['Low', 'Medium', 'High']
          .map((p) => `<label><input type="radio" name="priority" value="${p}" ${p === (w.priority || 'Medium') ? 'checked' : ''}><span>${p === 'Medium' ? 'Normal' : p === 'High' ? '★ Must' : 'Low'}</span></label>`).join('')}</div></div>
      </div>
      <label>Link<input name="url" type="url" value="${esc(w.url)}" placeholder="https://"></label>
      <div class="photo-actions">
        <button type="button" class="btn" data-fetch>Get photo from link</button>
        <button type="button" class="btn" data-paste>Paste photo</button>
      </div>
      <label>Notes<textarea name="notes" rows="2" placeholder="e.g. wait for $40 deals">${esc(w.notes)}</textarea></label>
    </div>
    <input type="file" accept="image/*" hidden data-file>
    <div class="actions">
      ${isNew ? '' : '<button type="button" class="btn danger" data-delete>Delete</button>'}
      ${!isNew && w.status !== 'bought' ? '<button type="button" class="btn" data-bought>Bought it</button>' : ''}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(isNew ? 'New wish' : 'Edit wish', body, (d) => {
    $('[data-newchip=category]', d).onclick = (e) =>
      openNewChip(e.currentTarget, 'Category name', (v, input) => addRadioChip(input, 'category', v.replace(/^./, (c) => c.toUpperCase())));
    const setImage = (src) => {
      image = src;
      $('[data-img]', d).innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span>+ Photo</span>';
    };
    $('[data-img]', d).onclick = () => {
      if (image) { if (confirm('Remove this photo?')) setImage(''); return; }
      $('[data-file]', d).click();
    };
    $('[data-file]', d).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      try { setImage(await compressImage(url)); } catch { toast('Couldn’t read that photo'); } finally { URL.revokeObjectURL(url); }
    };
    $('[data-fetch]', d).onclick = async (e) => {
      const url = $('[name=url]', d).value.trim();
      if (!/^https?:\/\//.test(url)) return toast('Paste a link first');
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const pv = await linkPreview(url);
        if (!pv.image) throw new Error('No image on that page');
        let img = pv.image;
        try { img = await compressImage(pv.image); } catch {}
        setImage(img);
        const name = $('[name=name]', d);
        if (!name.value && pv.title) name.value = pv.title.split(/[|–-]/)[0].trim();
        if (pv.left != null && pv.left <= 2) toast(pv.left ? `${pv.left} free photo lookup${pv.left === 1 ? '' : 's'} left today` : 'That was today’s last free photo lookup');
      } catch (err) {
        toast(err.message || 'Couldn’t fetch a preview', err.rate ? { label: 'Paste', run: () => $('[data-paste]', d)?.click() } : undefined);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Get photo from link';
      }
    };
    $('[data-paste]', d).onclick = async () => {
      try {
        setImage(await pastedImage());
        haptic();
      } catch (err) {
        toast(err.message);
      }
    };
    const read = () => {
      const tp = $('[name=targetPrice]', d).value.replace(/[$,\s]/g, '');
      return {
        ...w,
        name: $('[name=name]', d).value.trim(),
        brand: $('[name=brand]', d).value.trim(),
        details: $('[name=details]', d).value.trim(),
        category: $('[name=category]:checked', d)?.value || 'Other',
        targetPrice: tp && Number.isFinite(Number(tp)) ? Number(tp) : null,
        priority: $('[name=priority]:checked', d)?.value || 'Medium',
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
  });
}
async function deleteWant(w) {
  await write([{ store: 'wants', del: w.id }]);
  await reload();
  toast(`Deleted ${w.name}`, { label: 'Undo', run: async () => { await write([{ store: 'wants', put: w }]); reload(); } });
}
function buyWant(w) {
  openPurchase({
    prefill: [{ name: w.name, brand: w.brand, price: w.targetPrice ?? '' }],
    onSaved: () => write([{ store: 'wants', put: { ...w, status: 'bought', boughtAt: new Date().toISOString() } }]),
  });
}
async function markWantBought(w) {
  await write([{ store: 'wants', put: { ...w, status: 'bought', boughtAt: new Date().toISOString() } }]);
  haptic();
  await reload();
  toast('Moved to Bought', { label: 'Log price', run: () => openPurchase({ prefill: [{ name: w.name, brand: w.brand, price: w.targetPrice ?? '' }] }) });
}

// =====================================================================
// PRICES — items with trends, and past trips
// =====================================================================
function renderPrices() {
  const seg = `<div class="seg-toggle full top" role="tablist">
    <button data-prices-view="items" aria-pressed="${ui.pricesView === 'items'}">Items</button>
    <button data-prices-view="trips" aria-pressed="${ui.pricesView === 'trips'}">Trips</button></div>`;
  return seg + (ui.pricesView === 'trips' ? renderTrips() : renderItems());
}

function renderItems() {
  const q = lc($('#price-search')?.value);
  const trips = byId(S.trips);
  const lastDate = {};
  for (const l of S.lines) {
    const d = trips[l.tripId]?.date || '';
    if (!lastDate[l.productId] || d > lastDate[l.productId]) lastDate[l.productId] = d;
  }
  const list = S.products
    .filter((p) => lastDate[p.id])
    .filter((p) => !q || lc(p.name).includes(q) || lc(p.brand).includes(q) || lc(p.category).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="tab-head">
      <input id="price-search" type="search" placeholder="Search items" value="${esc(q)}">
      <button class="btn icon-text" data-scan-price aria-label="Scan a barcode">${ICON.scan}<span>Scan</span></button>
    </div>
    ${list.length ? `<ul class="list">${list
      .map((p) => {
        const hist = historyFor([p.id]);
        const st = productStats(hist);
        return `<li class="tap" data-product="${p.id}"><div class="grow"><div class="title">${dot(lastRating(hist))}${esc(p.name)}</div>
          <div class="sub">${[p.brand && esc(p.brand), `${st.count}×`, esc(st.lastStore)].filter(Boolean).join(' · ')}</div></div>
          ${sparkline(trendValues(hist))}
          <div class="right"><b>${formatMoney(st.last.price)}</b><div class="sub">${formatUnitPrice(st.last.unit)}</div></div></li>`;
      })
      .join('')}</ul>` : `<div class="empty">${S.products.length ? 'No matches.' : 'Prices show up here after you log a trip.<br>Finish a grocery run with “Log prices”, or tap + to log one.'}</div>`}`;
}

function renderTrips() {
  const stores = byId(S.stores);
  const trips = [...S.trips].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const tripsById = byId(S.trips);
  const totals = {}, counts = {};
  for (const l of S.lines) {
    totals[l.tripId] = (totals[l.tripId] || 0) + lineTotal(l);
    counts[l.tripId] = (counts[l.tripId] || 0) + 1;
  }
  const month = today().slice(0, 7);
  const monthSpend = Object.entries(totals).reduce((s, [id, t]) => (tripsById[id]?.date.startsWith(month) ? s + t : s), 0);
  const byMonth = groupBy(trips, (t) => t.date.slice(0, 7));
  return `
    <div class="summary-card"><span class="sub">Spent this month</span><b>${formatMoney(monthSpend)}</b></div>
    ${trips.length ? byMonth.map(([m, ts]) => `<section class="group"><h3>${new Date(m + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><ul class="list">${ts
      .map((t) => swipeRow(`<div class="cell tap" data-trip="${t.id}"><div class="grow"><div class="title">${esc(stores[t.storeId]?.name || 'Unknown store')}</div>
          <div class="sub">${fmtShort(t.date)} · ${counts[t.id] || 0} item${counts[t.id] === 1 ? '' : 's'}</div></div>
          <div class="right"><b>${formatMoney(totals[t.id] || 0)}</b></div></div>`, [{ act: 'tdelete', label: 'Delete', cls: 'red' }], `data-tid="${t.id}"`))
      .join('')}</ul></section>`).join('') : '<p class="empty">No trips yet.</p>'}`;
}

// ---------- purchase form ----------
const unitOptions = (sel) =>
  Object.entries(UNITS).map(([k, u]) => `<option value="${k}" ${k === (sel || 'ea') ? 'selected' : ''}>${u.label}</option>`).join('');

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
      <div class="barcode-row"><label class="grow">Barcode<input name="barcode" inputmode="numeric" value="${esc(l.barcode)}" placeholder="Optional"></label>
        <button type="button" class="btn" data-scan-line>Scan</button></div>
    </div>
  </div>`;
}
function readLine(el) {
  const v = (n) => el.querySelector(`[name=${n}]`);
  return {
    name: v('name').value.trim(), brand: v('brand').value.trim(), price: v('price').value.replace(/[$,\s]/g, ''),
    qty: v('qty').value.trim() || '1', size: v('size').value.trim(), unit: v('unit').value, onSale: v('onSale').checked, barcode: v('barcode').value.trim(),
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
  set('name', p.name); set('brand', p.brand); set('size', p.defaultSize); set('barcode', p.barcode);
  const unit = el.querySelector('[name=unit]');
  if (p.defaultUnit && (force || unit.value === 'ea')) unit.value = p.defaultUnit;
  const st = productStats(historyFor([p.id]));
  if (st) el.querySelector('[name=price]').placeholder = st.last.price.toFixed(2);
}
function wireLine(el) {
  el.querySelector('[data-remove]').onclick = () => { el.remove(); };
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
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[name=price]').focus(); } });
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
    lines = S.lines.filter((l) => l.tripId === trip.id).map((l) => {
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
    <p class="sub hint-line">Prices default to what you paid last time. Tap ⋯ for size, brand or barcode.</p>
    <div class="group-box" id="lines">${lines.map(lineRow).join('')}</div>
    <div class="add-actions">
      <button type="button" class="btn" data-add>+ Item</button>
      <button type="button" class="btn" data-scan-add>${ICON.scan} Scan</button>
    </div>
    <div class="sheet-footer">
      <div class="total-row"><span>Total</span><b id="trip-total">$0.00</b></div>
      <div class="actions">
        ${trip ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
        <button type="button" class="btn primary" data-save>Save</button>
      </div>
    </div>`;
  openSheet(trip ? 'Edit trip' : 'Log a trip', body, (d) => {
    const linesEl = $('#lines', d);
    const priceOf = (el) => {
      const r = readLine(el);
      const ph = el.querySelector('[name=price]').placeholder;
      return r.price || (ph !== '0.00' ? ph : '');
    };
    const recalc = () => {
      const t = $$('.line', linesEl).reduce((sum, el) => {
        const r = readLine(el);
        return r.name ? sum + lineTotal({ ...r, price: priceOf(el) || 0 }) : sum;
      }, 0);
      $('#trip-total', d).textContent = formatMoney(t);
    };
    $$('.line', linesEl).forEach(wireLine);
    linesEl.addEventListener('input', recalc);
    linesEl.addEventListener('change', recalc);
    linesEl.addEventListener('click', () => setTimeout(recalc));
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
      const empty = $$('.line', linesEl).find((el) => !readLine(el).name && !readLine(el).price);
      const el = empty || addLine();
      el.querySelector('[name=barcode]').value = code;
      if (p) fillFromProduct(el, p, { force: true });
      else toast('New barcode — type the item name');
      updateLineMeta(el);
      recalc();
      (p ? el.querySelector('[name=price]') : el.querySelector('[name=name]')).focus();
    };
    const del = $('[data-delete]', d);
    if (del)
      del.onclick = async () => {
        if (!confirm('Delete this trip and its items?')) return;
        await write([{ store: 'trips', del: trip.id }, ...S.lines.filter((l) => l.tripId === trip.id).map((l) => ({ store: 'lines', del: l.id }))]);
        d.close();
        await reload();
        toast('Trip deleted');
      };
    $('[data-save]', d).onclick = async () => {
      const storeName = $('[name=store]', d).value.trim();
      const date = $('[name=date]', d).value || today();
      const rows = $$('.line', linesEl).map((el) => ({ ...readLine(el), price: priceOf(el) })).filter((l) => l.name);
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
        ops.push({ store: 'lines', put: { id: newId(), tripId: t.id, productId: p.id, price: Number(r.price), qty: Number(r.qty) || 1, size: r.size ? Number(r.size) : null, unit: r.unit, onSale: r.onSale } });
      }
      await write(ops);
      store('lastStore', storeName);
      d.close();
      haptic();
      await onSaved?.({ storeName });
      await reload();
      toast('Trip saved');
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
        <div><span>${dot(lastRating(hist))}Last</span><b>${formatUnitPrice(st.last.unit)}</b></div>
        <div><span>Lowest</span><b>${formatUnitPrice(st.lowest.unit)}</b></div>
        <div><span>Typical</span><b>${formatUnitPrice(st.median)}</b></div>
      </div>
      ${trend.length > 1 ? `<div class="chart">${sparkline(trend, 320, 80, 'big')}</div>` : ''}` : '<p class="empty small">No price history yet.</p>'}
    ${hist.length ? `<h3>History</h3><ul class="list">${hist.map((h) => `<li><div class="grow"><b>${formatMoney(h.price)}</b>${h.size ? ` · ${esc(h.size)} ${esc(UNITS[h.sizeUnit]?.label || '')}` : ''} ${h.onSale ? '<span class="pill sm">sale</span>' : ''}
          <div class="sub">${esc(h.store)} · ${fmtDate(h.date)}</div></div><div class="sub">${formatUnitPrice(h.unit)}</div></li>`).join('')}</ul>` : ''}
    <h3>Details</h3>
    <div class="group-box form">
      <label>Name<input name="name" value="${esc(p.name)}"></label>
      <label>Brand<input name="brand" list="dl-brands" value="${esc(p.brand)}"></label>
      <div class="barcode-row"><label class="grow">Barcode<input name="barcode" inputmode="numeric" value="${esc(p.barcode)}"></label>
        <button type="button" class="btn" data-scan>Scan</button></div>
    </div>
    <div class="actions"><button type="button" class="btn primary" data-save>Save</button></div>`;
  openSheet(p.brand ? `${p.name} · ${p.brand}` : p.name, body, (d) => {
    $('[data-scan]', d).onclick = async () => {
      const code = await scanBarcode();
      if (code) $('[name=barcode]', d).value = code;
    };
    $('[data-save]', d).onclick = async () => {
      const name = $('[name=name]', d).value.trim();
      if (!name) return toast('Name is required');
      await write([{ store: 'products', put: { ...p, name, brand: $('[name=brand]', d).value.trim(), barcode: $('[name=barcode]', d).value.trim() } }]);
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

// ---------- import from Notes ----------
function openNotesImport(kind = 'wants') {
  const body = `
    <p class="sub">In Notes, select your list, copy it, and paste it here. Cartwise sorts it for you: groceries by store aisle, wishlist items by category, with section names used as brands.</p>
    <div class="seg-toggle full" role="radiogroup">
      <label><input type="radio" name="kind" value="wants" ${kind === 'wants' ? 'checked' : ''}><span>Wishlist</span></label>
      <label><input type="radio" name="kind" value="groceries" ${kind === 'groceries' ? 'checked' : ''}><span>Groceries</span></label>
    </div>
    <textarea name="text" rows="10" placeholder="Barbour&#10;- [ ] Powell Quilted Jacket"></textarea>
    <p class="sub" id="preview"></p>
    <div class="actions"><button type="button" class="btn primary" data-go>Import</button></div>`;
  openSheet('Paste from Notes', body, (d) => {
    const ta = $('[name=text]', d);
    const k = () => $('[name=kind]:checked', d).value;
    const preview = () => {
      const rows = parseChecklist(ta.value);
      const p = $('#preview', d);
      if (!p) return;
      p.textContent = rows.length ? `${rows.length} items · ${rows.filter((r) => !r.checked).length} unchecked ${k() === 'wants' ? 'go on your wishlist, checked go to Bought' : 'go on your list, checked become usuals'}` : '';
    };
    ta.oninput = preview;
    $('form', d).addEventListener('change', preview);
    $('[data-go]', d).onclick = async () => {
      const rows = parseChecklist(ta.value);
      if (!rows.length) return toast('No checklist items found');
      const now = new Date().toISOString();
      const existing = new Set(S.groceries.map((g) => lc(g.name)));
      rows.forEach((r) => (r.key = lc(splitItemName(r.name).name)));
      const ops = k() === 'wants'
        ? rows.map((r) => {
            const c = classifyWant(r.group, r.name);
            return { store: 'wants', put: { id: newId(), name: r.name, brand: c.brand, category: c.category, details: '', priority: 'Medium', notes: c.note, url: '', targetPrice: null, image: '', status: r.checked ? 'bought' : 'open', createdAt: now, v: SCHEMA } };
          })
        : rows.filter((r) => !existing.has(r.key)).map((r) => ({
            store: 'groceries',
            put: { id: newId(), ...splitItemName(r.name), qty: '', aisle: aisleFor(r.name), store: r.outer || '', status: r.checked ? 'stocked' : 'need', createdAt: now, v: SCHEMA },
          }));
      await write(ops);
      d.close();
      tab = k() === 'wants' ? 'wishlist' : 'groceries';
      store('tab', tab);
      await reload();
      toast(`Imported ${ops.length} items`);
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
  try { persisted = await navigator.storage?.persisted?.(); } catch {}
  const last = store('lastExport');
  const body = `
    <h3>Backup</h3>
    <div class="group-box form">
      <p class="sub">Your data lives only on this phone. Export saves a file you can keep in iCloud Drive. Last export: <b>${last ? fmtDate(last.slice(0, 10)) : 'never'}</b>.</p>
      <div class="actions tight"><label class="btn">Import<input type="file" accept="application/json,.json" hidden data-import></label>
        <button type="button" class="btn primary" data-export>Export backup</button></div>
    </div>
    <h3>Bring in a list</h3>
    <div class="group-box form"><button type="button" class="btn" data-notes>Paste from Notes</button></div>
    <h3>Text size</h3>
    <div class="group-box form">
      <div class="seg-toggle full" role="radiogroup" aria-label="Text size">${[['small', 'Smaller'], ['default', 'Default'], ['large', 'Larger']]
        .map(([v, l]) => `<label><input type="radio" name="textSize" value="${v}" ${(store('textSize') || 'default') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </div>
    <h3>Storage</h3>
    <div class="group-box form">
      <p class="sub">${persisted ? 'Persistent storage is on, so Safari won’t clear your data on its own.' : 'Storage isn’t marked persistent yet. Adding Cartwise to your Home Screen helps; exporting regularly keeps you safe either way.'}</p>
      ${persisted ? '' : '<button type="button" class="btn" data-persist>Request persistent storage</button>'}
    </div>
    <h3>Tips</h3>
    <div class="group-box form"><p class="sub">Tap the circle to put a grocery item in your cart; tap anywhere else on a row to edit it. Swipe left on a row to see Remove, Bought or Delete. Nothing happens until you tap a button, and deletes can be undone.</p></div>
    <p class="sub version">Cartwise v${window.CARTWISE_VERSION || ''} · ${S.trips.length} trips · ${S.products.length} items priced</p>`;
  openSheet('Settings', body, (d) => {
    $('[data-export]', d).onclick = exportData;
    $$('[name=textSize]', d).forEach((r) => r.addEventListener('change', () => {
      store('textSize', r.value);
      document.documentElement.dataset.text = r.value;
    }));
    $('[data-notes]', d).onclick = () => openNotesImport(tab === 'groceries' ? 'groceries' : 'wants');
    $('[data-import]', d).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = parseImport(await f.text());
        if (!confirm(`Replace everything on this phone with this backup (${data.trips.length} trips)?`)) return;
        await replaceAll(data);
        await runMigrations();
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

// ---------- render ----------
const TITLES = { groceries: 'Groceries', wishlist: 'Wishlist', prices: 'Prices' };
const ADD_LABEL = { groceries: 'Add item', wishlist: 'Add wish', prices: 'Log a trip' };

function render() {
  openRow = null;
  renderDatalists();
  const view = { groceries: renderGroceries, wishlist: renderWishlist, prices: renderPrices }[tab];
  const main = $('#main');
  const focusId = document.activeElement?.id;
  const keepFocus = ['price-search', 'want-search'].includes(focusId);
  main.innerHTML = view();
  if (keepFocus) {
    const s = $('#' + focusId);
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  }
  if (tab === 'groceries') wireQuickAdd();
  $('#title').textContent = TITLES[tab];
  document.title = `${TITLES[tab]} · Cartwise`;
  $('#add-btn').setAttribute('aria-label', ADD_LABEL[tab]);
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  document.body.classList.toggle('has-sticky', !!$('.actions.sticky', main));
  const last = store('lastExport');
  const stale = S.trips.length >= 3 && (!last || Date.now() - Date.parse(last) > 14 * 864e5);
  $('#backup-banner').hidden = !stale;
}

// ---------- sheet gestures ----------
// Drag the grabber/header (or the content when it's scrolled to the top) down to close; tap the dimmed area to close.
function wireSheetGestures() {
  const d = sheet();
  let startY, dy, dragging, tracking, startT;
  d.addEventListener('touchstart', (e) => {
    const body = e.target.closest('.sheet-body');
    const onHandle = e.target.closest('.grabber, .sheet-head') && !e.target.closest('button');
    const atTop = body && body.scrollTop <= 0 && !e.target.closest('input, textarea, select, .chips.scroll');
    if (!onHandle && !atTop) return (tracking = false);
    tracking = true;
    dragging = !!onHandle;
    startY = e.touches[0].clientY;
    startT = Date.now();
    dy = 0;
  }, { passive: true });
  d.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    dy = e.touches[0].clientY - startY;
    if (!dragging) {
      if (dy > 8) dragging = true;
      else if (dy < -4) return (tracking = false);
      else return;
    }
    if (dy < 0) dy = 0;
    e.preventDefault();
    d.style.transition = 'none';
    d.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  d.addEventListener('touchend', () => {
    if (!tracking || !dragging) return (tracking = false);
    tracking = dragging = false;
    const fast = dy > 60 && Date.now() - startT < 250;
    d.style.transition = 'transform .22s ease';
    if (dy > 140 || fast) {
      d.style.transform = 'translateY(100%)';
      setTimeout(() => { d.close(); d.style.transform = ''; d.style.transition = ''; }, 200);
    } else {
      d.style.transform = '';
    }
  });
  // A click on the <dialog> itself (not its contents) is a click on the backdrop.
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}

// ---------- events ----------
function wire() {
  wireSheetGestures();
  $('#add-btn').innerHTML = ICON.plus;
  $('#settings-btn').innerHTML = ICON.gear;
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
  $('#add-btn').onclick = () => {
    if (tab === 'groceries') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return $('[data-quick-add] input')?.focus();
    }
    if (tab === 'wishlist') return openWant();
    openPurchase();
  };

  const main = $('#main');
  enableSwipe(main);
  main.addEventListener('input', (e) => {
    if (e.target.id === 'price-search' || e.target.id === 'want-search') render();
  });
  // While a row is open, a tap anywhere except its buttons just closes it.
  document.addEventListener('click', (e) => {
    if (openRow && !e.target.closest('.swipe-actions')) {
      e.stopPropagation();
      e.preventDefault();
      closeOpenRow();
    }
  }, true);
  main.addEventListener('click', async (e) => {
    if (e.target.closest('.link-btn')) return;
    if (e.target.closest('[data-just-swiped]') && !e.target.closest('.swipe-actions')) return;
    const t = (sel) => e.target.closest(sel);

    const act = t('[data-act]');
    if (act) {
      const li = act.closest('.swipe');
      const a = act.dataset.act;
      closeOpenRow();
      if (li.dataset.gid) {
        const g = S.groceries.find((x) => x.id === li.dataset.gid);
        if (a === 'gedit') return openGrocery(g);
        if (a === 'gremove') return setGrocery(g, { status: 'stocked' }, `Removed ${g.name}`);
      }
      if (li.dataset.wid) {
        const w = S.wants.find((x) => x.id === li.dataset.wid);
        if (a === 'wbought') return markWantBought(w);
        if (a === 'wdelete') return deleteWant(w);
        if (a === 'wreopen') { await write([{ store: 'wants', put: { ...w, status: 'open', boughtAt: null } }]); return reload(); }
      }
      if (li.dataset.tid && a === 'tdelete') {
        const tr = S.trips.find((x) => x.id === li.dataset.tid);
        const ls = S.lines.filter((l) => l.tripId === tr.id);
        await write([{ store: 'trips', del: tr.id }, ...ls.map((l) => ({ store: 'lines', del: l.id }))]);
        await reload();
        return toast('Trip deleted', { label: 'Undo', run: async () => { await write([{ store: 'trips', put: tr }, ...ls.map((l) => ({ store: 'lines', put: l }))]); reload(); } });
      }
      return;
    }

    if (t('[data-gtoggle]')) {
      const g = S.groceries.find((x) => x.id === t('[data-gtoggle]').dataset.gtoggle);
      haptic();
      return setGrocery(g, { status: g.status === 'cart' ? 'need' : 'cart' });
    }
    if (t('[data-gopen]')) return openGrocery(S.groceries.find((x) => x.id === t('[data-gopen]').dataset.gopen));
    if (t('[data-usual]')) {
      const g = S.groceries.find((x) => x.id === t('[data-usual]').dataset.usual);
      haptic();
      await setGrocery(g, { status: 'need' });
      return toast(`Added ${g.name}`);
    }
    if (t('[data-newchip=store-filter]'))
      return openNewChip(t('[data-newchip=store-filter]'), 'Store name', async (v) => {
        ui.storeFilter = await addStore(v);
        await reload();
        toast(`Showing ${ui.storeFilter}`);
      });
    if (t('[data-store-filter]')) return (ui.storeFilter = t('[data-store-filter]').dataset.storeFilter), render();
    if (t('[data-finish]')) return openFinish();
    if (t('[data-want-filter]')) return (ui.wantFilter = t('[data-want-filter]').dataset.wantFilter), render();
    if (t('[data-want]')) return openWant(S.wants.find((w) => w.id === t('[data-want]').dataset.want));
    if (t('[data-prices-view]')) return (ui.pricesView = t('[data-prices-view]').dataset.pricesView), render();
    if (t('[data-trip]')) return openPurchase({ trip: S.trips.find((x) => x.id === t('[data-trip]').dataset.trip) });
    if (t('[data-product]')) return openProduct(S.products.find((x) => x.id === t('[data-product]').dataset.product));
    if (t('[data-scan-price]')) return priceCheckScan();
    if (t('[data-notes-import]')) return openNotesImport(t('[data-notes-import]').dataset.notesImport);
  });
}

async function runMigrations() {
  const data = await loadAll();
  const ops = migrateAll(data);
  if (ops.length) await write(ops);
}

// Keep the Home Screen app current: check for a new version on launch and every time
// it comes back to the foreground, and reload once the new version takes over.
function setupUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    store('justUpdated', '1');
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}

async function start() {
  const saved = store('tab');
  tab = saved === 'want' ? 'wishlist' : saved === 'history' ? 'prices' : TITLES[saved] ? saved : 'groceries';
  wire();
  await runMigrations();
  await reload();
  setupUpdates();
  const updated = store('justUpdated');
  if (updated) {
    store('justUpdated', '');
    toast(`Updated to v${window.CARTWISE_VERSION}`);
  }
}

start();

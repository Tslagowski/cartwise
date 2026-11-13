import { loadAll, write, replaceAll, newId } from './db.js';
import { UNITS, unitPrice, lineTotal, formatMoney, formatUnitPrice } from './lib/units.js';
import { priceHistory, productStats, rate } from './lib/stats.js';
import { makeExport, parseImport } from './lib/backup.js';
import { parseChecklist } from './lib/notes.js';

// ---------- state ----------
let S = { stores: [], products: [], trips: [], lines: [], wants: [], groceries: [] };
let tab = 'want';
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

// ---------- sheet (one reusable dialog) ----------
const sheet = () => $('#sheet');
function openSheet(title, body, wire) {
  const d = sheet();
  d.innerHTML = `<form method="dialog" class="sheet-inner">
    <header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="sheet-body">${body}</div></form>`;
  $('[data-close]', d).onclick = () => d.close();
  d.querySelector('form').onsubmit = (e) => e.preventDefault();
  if (!d.open) d.showModal();
  wire?.(d);
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- datalists ----------
function renderDatalists() {
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('#dl-products').innerHTML = uniq(S.products.map((p) => p.name)).map((n) => `<option value="${esc(n)}">`).join('');
  $('#dl-brands').innerHTML = uniq(S.products.map((p) => p.brand)).map((n) => `<option value="${esc(n)}">`).join('');
  $('#dl-stores').innerHTML = uniq(S.stores.map((s) => s.name)).map((n) => `<option value="${esc(n)}">`).join('');
  $('#dl-categories').innerHTML = uniq(S.products.map((p) => p.category)).map((n) => `<option value="${esc(n)}">`).join('');
  $('#dl-want-groups').innerHTML = uniq(S.wants.map((w) => w.group)).map((n) => `<option value="${esc(n)}">`).join('');
  $('#dl-gcats').innerHTML = uniq([...GROCERY_CATS, ...S.groceries.map((g) => g.category)]).map((n) => `<option value="${esc(n)}">`).join('');
}

// ---------- purchase form ----------
const unitOptions = (sel) =>
  Object.entries(UNITS)
    .map(([k, u]) => `<option value="${k}" ${k === (sel || 'ea') ? 'selected' : ''}>${u.label}</option>`)
    .join('');

function lineRow(l = {}) {
  return `<div class="line card">
    <div class="line-top">
      <input name="name" list="dl-products" placeholder="Item (e.g. Greek yogurt)" value="${esc(l.name)}" autocomplete="off">
      <button type="button" class="icon-btn" data-remove aria-label="Remove item">✕</button>
    </div>
    <input name="brand" list="dl-brands" placeholder="Brand" value="${esc(l.brand)}" autocomplete="off">
    <div class="grid2">
      <label>Price each<input name="price" inputmode="decimal" placeholder="0.00" value="${esc(l.price)}"></label>
      <label>Qty<input name="qty" inputmode="decimal" value="${esc(l.qty ?? 1)}"></label>
    </div>
    <div class="grid3">
      <label>Size<input name="size" inputmode="decimal" placeholder="—" value="${esc(l.size)}"></label>
      <label>Unit<select name="unit">${unitOptions(l.unit)}</select></label>
      <label class="check"><input type="checkbox" name="onSale" ${l.onSale ? 'checked' : ''}> Sale</label>
    </div>
    <div class="hint"></div>
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
  };
}

function updateHint(el) {
  const l = readLine(el);
  const hint = el.querySelector('.hint');
  const up = l.price ? unitPrice(l) : null;
  if (!up) return (hint.innerHTML = '');
  const p = findProduct(l.name, l.brand);
  const st = p ? productStats(historyFor([p.id])) : statsForName(l.name);
  let txt = `<b>${formatUnitPrice(up)}</b>`;
  if (st && st.last.unit.family === up.family) {
    const r = rate(up.value, st);
    const label = { good: 'Good price', ok: 'Typical', high: 'Higher than usual' }[r];
    txt += ` · <span class="rate ${r}">${label}</span> · low ${formatUnitPrice(st.lowest.unit)}, typical ${formatUnitPrice(st.median)}`;
  }
  hint.innerHTML = txt;
}

function wireLine(el) {
  el.querySelector('[data-remove]').onclick = () => {
    el.remove();
  };
  const name = el.querySelector('[name=name]');
  name.addEventListener('change', () => {
    // Prefill from the most recently used product with this name.
    const ps = productsNamed(name.value);
    if (!ps.length) return;
    const p = ps[0];
    const set = (n, val) => {
      const i = el.querySelector(`[name=${n}]`);
      if (!i.value && val) i.value = val;
    };
    set('brand', p.brand);
    set('size', p.defaultSize);
    if (p.defaultUnit && el.querySelector('[name=unit]').value === 'ea') el.querySelector('[name=unit]').value = p.defaultUnit;
    updateHint(el);
  });
  el.addEventListener('input', () => updateHint(el));
  updateHint(el);
}

function openPurchase({ trip, prefill = [], onSaved } = {}) {
  const storesById = byId(S.stores), productsById = byId(S.products);
  let lines = prefill;
  if (trip) {
    lines = S.lines
      .filter((l) => l.tripId === trip.id)
      .map((l) => ({ ...l, name: productsById[l.productId]?.name, brand: productsById[l.productId]?.brand }));
  }
  if (!lines.length) lines = [{}];
  const body = `
    <div class="grid2">
      <label>Store<input name="store" list="dl-stores" placeholder="e.g. King Soopers" value="${esc(trip ? storesById[trip.storeId]?.name : store('lastStore') || '')}" autocomplete="off"></label>
      <label>Date<input name="date" type="date" value="${esc(trip?.date || today())}"></label>
    </div>
    <div id="lines">${lines.map(lineRow).join('')}</div>
    <button type="button" class="btn ghost" data-add>+ Add item</button>
    <div class="total-row"><span>Total</span><b id="trip-total">$0.00</b></div>
    <div class="actions">
      ${trip ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(trip ? 'Edit purchase' : 'New purchase', body, (d) => {
    const linesEl = $('#lines', d);
    const recalc = () => {
      const t = $$('.line', linesEl).reduce((sum, el) => sum + lineTotal(readLine(el)), 0);
      $('#trip-total', d).textContent = formatMoney(t);
    };
    $$('.line', linesEl).forEach(wireLine);
    linesEl.addEventListener('input', recalc);
    linesEl.addEventListener('click', () => setTimeout(recalc));
    recalc();
    $('[data-add]', d).onclick = () => {
      linesEl.insertAdjacentHTML('beforeend', lineRow());
      const el = linesEl.lastElementChild;
      wireLine(el);
      el.querySelector('[name=name]').focus();
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
      const rows = $$('.line', linesEl).map(readLine).filter((l) => l.name);
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
      const t = { id: trip?.id || newId(), storeId: st.id, date, note: trip?.note || '' };
      ops.push({ store: 'trips', put: t });
      if (trip) S.lines.filter((l) => l.tripId === trip.id).forEach((l) => ops.push({ store: 'lines', del: l.id }));
      for (const r of rows) {
        let p = findProduct(r.name, r.brand);
        if (!p) {
          p = { id: newId(), name: r.name, brand: r.brand, category: '' };
          S.products.push(p);
        }
        p = { ...p, defaultSize: r.size, defaultUnit: r.unit };
        ops.push({ store: 'products', put: p });
        ops.push({
          store: 'lines',
          put: { id: newId(), tripId: t.id, productId: p.id, price: Number(r.price), qty: Number(r.qty) || 1, size: r.size ? Number(r.size) : null, unit: r.unit, onSale: r.onSale },
        });
      }
      await write(ops);
      store('lastStore', storeName);
      d.close();
      await onSaved?.();
      await reload();
      toast('Saved');
    };
  });
}

// ---------- product sheet ----------
function openProduct(p) {
  const hist = historyFor([p.id]);
  const st = productStats(hist);
  const body = `
    ${st ? `<div class="stats">
        <div><span>Last</span><b>${formatUnitPrice(st.last.unit)}</b></div>
        <div><span>Lowest</span><b>${formatUnitPrice(st.lowest.unit)}</b></div>
        <div><span>Typical</span><b>${formatUnitPrice(st.median)}</b></div>
      </div>` : '<p class="empty">No price history yet.</p>'}
    <ul class="list">${hist
      .map(
        (h) => `<li><div><b>${formatMoney(h.price)}</b> ${h.size ? `· ${esc(h.size)} ${esc(UNITS[h.sizeUnit]?.label || '')}` : ''} ${h.onSale ? '<span class="tag">sale</span>' : ''}
          <div class="sub">${esc(h.store)} · ${fmtDate(h.date)}</div></div><div class="sub">${formatUnitPrice(h.unit)}</div></li>`
      )
      .join('')}</ul>
    <h3>Details</h3>
    <label>Name<input name="name" value="${esc(p.name)}"></label>
    <label>Brand<input name="brand" list="dl-brands" value="${esc(p.brand)}"></label>
    <label>Category<input name="category" list="dl-categories" value="${esc(p.category)}" placeholder="e.g. Dairy"></label>
    <div class="actions">
      ${hist.length ? '' : '<button type="button" class="btn danger" data-delete>Delete</button>'}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(p.brand ? `${p.name} · ${p.brand}` : p.name, body, (d) => {
    $('[data-save]', d).onclick = async () => {
      const name = $('[name=name]', d).value.trim();
      if (!name) return toast('Name is required');
      await write([{ store: 'products', put: { ...p, name, brand: $('[name=brand]', d).value.trim(), category: $('[name=category]', d).value.trim() } }]);
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

// ---------- want sheet ----------
function openWant(w) {
  const body = `
    <label>What do you want?<input name="name" list="dl-products" value="${esc(w?.name)}" placeholder="e.g. Powell Quilted Jacket"></label>
    <div class="grid2">
      <label>Brand or group<input name="group" list="dl-want-groups" value="${esc(w?.group)}" placeholder="e.g. Barbour, TVs" autocomplete="off"></label>
      <label>Size / fit / color<input name="details" value="${esc(w?.details)}" placeholder="e.g. 33x34 athletic"></label>
    </div>
    <div class="grid2">
      <label>Target price<input name="targetPrice" inputmode="decimal" value="${esc(w?.targetPrice ?? '')}" placeholder="optional"></label>
      <label>Priority<select name="priority">${['High', 'Medium', 'Low']
        .map((x) => `<option ${x === (w?.priority || 'Medium') ? 'selected' : ''}>${x}</option>`)
        .join('')}</select></label>
    </div>
    <label>Link<input name="url" type="url" value="${esc(w?.url)}" placeholder="https://"></label>
    <label>Notes<textarea name="notes" rows="3">${esc(w?.notes)}</textarea></label>
    <div class="actions">
      ${w ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
      ${w && w.status !== 'bought' ? '<button type="button" class="btn" data-bought>Bought it</button>' : ''}
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet(w ? 'Edit want' : 'New want', body, (d) => {
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
    if (del)
      del.onclick = async () => {
        if (!confirm('Delete this want?')) return;
        await write([{ store: 'wants', del: w.id }]);
        d.close();
        await reload();
      };
    const bought = $('[data-bought]', d);
    if (bought)
      bought.onclick = () => {
        const x = read();
        openPurchase({
          prefill: [{ name: x.name, price: x.targetPrice ?? '' }],
          onSaved: () => write([{ store: 'wants', put: { ...x, status: 'bought', boughtAt: new Date().toISOString() } }]),
        });
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
    <div class="actions"><button type="button" class="btn primary" data-export>Export backup</button>
      <label class="btn">Import<input type="file" accept="application/json,.json" hidden data-import></label></div>
    <h3>Bring in your lists</h3>
    <p class="sub">Paste a checklist from the Notes app into your wishlist or groceries.</p>
    <button type="button" class="btn ghost" data-notes>Paste from Notes</button>
    <h3>Storage</h3>
    <p class="sub">${persisted ? 'Persistent storage is on, so Safari won’t clear your data on its own.' : 'Storage isn’t marked persistent yet. Adding Cartwise to your Home Screen helps; exporting regularly keeps you safe either way.'}</p>
    ${persisted ? '' : '<button type="button" class="btn ghost" data-persist>Request persistent storage</button>'}
    <p class="sub version">Cartwise v${window.CARTWISE_VERSION || ''}</p>`;
  openSheet('Settings', body, (d) => {
    $('[data-export]', d).onclick = exportData;
    $('[data-notes]', d).onclick = () => openNotesImport(tab === 'groceries' ? 'groceries' : 'wants');
    $('[data-import]', d).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = parseImport(await f.text());
        const n = data.trips.length;
        if (!confirm(`Replace everything on this phone with this backup (${n} purchases)?`)) return;
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

function renderWant() {
  const open = S.wants.filter((w) => w.status !== 'bought');
  const bought = S.wants.filter((w) => w.status === 'bought').sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || ''));
  const order = { High: 0, Medium: 1, Low: 2 };
  const card = (w) => {
    const st = statsForName(w.name);
    const bits = [
      w.details && esc(w.details),
      w.targetPrice != null && `target ${formatMoney(w.targetPrice)}`,
      st && `last paid ${formatMoney(st.last.price)}`,
      w.status === 'bought' && w.boughtAt && `bought ${fmtDate(w.boughtAt.slice(0, 10))}`,
    ].filter(Boolean);
    return `<li class="card tap" data-want="${w.id}">
      <div class="row"><b>${esc(w.name)}</b>${w.status !== 'bought' && w.priority && w.priority !== 'Medium' ? `<span class="tag p-${esc(lc(w.priority))}">${esc(w.priority)}</span>` : ''}</div>
      ${bits.length ? `<div class="sub">${bits.join(' · ')}</div>` : ''}
      ${w.notes ? `<div class="sub note">${esc(w.notes)}</div>` : ''}
      ${w.url ? `<a class="sub link" href="${esc(w.url)}" target="_blank" rel="noopener" data-stop>${esc(safeHost(w.url))}</a>` : ''}
    </li>`;
  };
  const groups = groupBy(open, (w) => w.group).sort((a, b) => (a[0] || '~').localeCompare(b[0] || '~'));
  for (const [, items] of groups)
    items.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  return `
    <div class="toolbar"><div class="sub">${open.length} open</div><button class="btn primary" data-new-want>+ Want</button></div>
    ${open.length ? groups.map(([g, items]) => `<section class="group"><h3>${esc(g || 'Other')}</h3><ul class="cards">${items.map(card).join('')}</ul></section>`).join('')
      : `<div class="empty">Nothing on your wishlist yet.<br><button class="btn ghost" data-notes-import="wants">Paste from Notes</button></div>`}
    ${bought.length ? `<details><summary>Bought (${bought.length})</summary><ul class="cards">${bought.map(card).join('')}</ul></details>` : ''}`;
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const GROCERY_CATS = ['Protein', 'Carbs', 'Fats', 'Produce', 'Other'];

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
    return `<li class="${g.checked ? 'done' : ''}">
      <input type="checkbox" data-toggle="${g.id}" ${g.checked ? 'checked' : ''} aria-label="Got ${esc(g.name)}">
      <div class="grow tap" data-grocery="${g.id}">${esc(g.name)}${st ? `<div class="sub">last ${formatMoney(st.last.price)} at ${esc(st.lastStore)}</div>` : ''}</div></li>`;
  };
  const section = (items) =>
    groupBy(
      [...items].sort((a, b) => (a.store || '').localeCompare(b.store || '') || catOrder(a.category) - catOrder(b.category) || a.name.localeCompare(b.name)),
      (g) => [g.store, g.category].filter(Boolean).join(' · ')
    )
      .map(([k, xs]) => `<section class="group"><h3>${esc(k || 'Other')}</h3><ul class="list groceries">${xs.map(row).join('')}</ul></section>`)
      .join('');
  return `
    <form class="add-row" data-add-grocery>
      <input name="g" list="dl-products" placeholder="Add a staple" autocomplete="off">
      <select name="c" aria-label="Category">${GROCERY_CATS.map((c) => `<option>${c}</option>`).join('')}</select>
      <button class="btn primary">Add</button>
    </form>
    ${S.groceries.length ? `
      <h2 class="section-title">Need <span class="sub">${need.length}</span></h2>
      ${need.length ? section(need) : '<p class="empty small">Nothing needed. Uncheck items as you run low.</p>'}
      ${got.length ? `<details ${need.length ? '' : 'open'}><summary>Got (${got.length})</summary>${section(got)}
        <button class="btn ghost" data-uncheck-all>Uncheck all (new list)</button></details>` : ''}`
      : `<div class="empty">Add your staples once; they stay here. Check them off as you shop, uncheck when you run low.<br><button class="btn ghost" data-notes-import="groceries">Paste from Notes</button></div>`}
    ${toLog.length ? `<div class="actions sticky"><button class="btn primary" data-log-checked>Log ${toLog.length} as purchase</button></div>` : ''}`;
}

function openGrocery(g) {
  const body = `
    <label>Item<input name="name" list="dl-products" value="${esc(g.name)}"></label>
    <div class="grid2">
      <label>Category<input name="category" list="dl-gcats" value="${esc(g.category)}"></label>
      <label>Store<input name="store" list="dl-stores" value="${esc(g.store)}" placeholder="any"></label>
    </div>
    <div class="actions">
      <button type="button" class="btn danger" data-delete>Remove</button>
      <button type="button" class="btn primary" data-save>Save</button>
    </div>`;
  openSheet('Staple', body, (d) => {
    $('[data-save]', d).onclick = async () => {
      const name = $('[name=name]', d).value.trim();
      if (!name) return toast('Name is required');
      await write([{ store: 'groceries', put: { ...g, name, category: $('[name=category]', d).value.trim(), store: $('[name=store]', d).value.trim() } }]);
      d.close();
      await reload();
    };
    $('[data-delete]', d).onclick = async () => {
      await write([{ store: 'groceries', del: g.id }]);
      d.close();
      await reload();
    };
  });
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
      $('#preview', d).textContent = rows.length ? `${rows.length} items in ${groups.size} sections (${rows.filter((r) => r.checked).length} checked)` : '';
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
              put: { id: newId(), name: r.name, group: r.group, details: '', priority: 'Medium', notes: '', url: '', targetPrice: null, status: r.checked ? 'bought' : 'open', createdAt: now },
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
    <input id="price-search" type="search" placeholder="Search items, brands, categories" value="${esc(q)}">
    ${list.length ? `<ul class="list">${list
      .map((p) => {
        const st = productStats(historyFor([p.id]));
        return `<li class="tap" data-product="${p.id}"><div><b>${esc(p.name)}</b>${p.brand ? ` <span class="sub">${esc(p.brand)}</span>` : ''}
          <div class="sub">${st ? `${st.count}× · last ${fmtDate(st.last.date)} at ${esc(st.lastStore)}` : 'No purchases'}</div></div>
          <div class="right">${st ? `<b>${formatUnitPrice(st.last.unit)}</b><div class="sub">low ${formatUnitPrice(st.lowest.unit)}</div>` : ''}</div></li>`;
      })
      .join('')}</ul>` : `<p class="empty">${S.products.length ? 'No matches.' : 'Prices show up here after you log a purchase.'}</p>`}`;
}

function renderHistory() {
  const stores = byId(S.stores);
  const trips = [...S.trips].sort((a, b) => b.date.localeCompare(a.date));
  const month = new Date().toISOString().slice(0, 7);
  const monthSpend = S.lines.reduce((sum, l) => {
    const t = S.trips.find((x) => x.id === l.tripId);
    return t && t.date.startsWith(month) ? sum + lineTotal(l) : sum;
  }, 0);
  return `
    <div class="toolbar"><div class="sub">This month: <b>${formatMoney(monthSpend)}</b></div><button class="btn primary" data-new-purchase>+ Purchase</button></div>
    ${trips.length ? `<ul class="list">${trips
      .map((t) => {
        const ls = S.lines.filter((l) => l.tripId === t.id);
        return `<li class="tap" data-trip="${t.id}"><div><b>${esc(stores[t.storeId]?.name || 'Unknown store')}</b>
          <div class="sub">${fmtDate(t.date)} · ${ls.length} item${ls.length === 1 ? '' : 's'}</div></div>
          <div class="right"><b>${formatMoney(ls.reduce((s, l) => s + lineTotal(l), 0))}</b></div></li>`;
      })
      .join('')}</ul>` : '<p class="empty">No purchases yet. Tap “+ Purchase” after your next shopping trip.</p>'}`;
}

function render() {
  renderDatalists();
  const view = { want: renderWant, groceries: renderGroceries, prices: renderPrices, history: renderHistory }[tab];
  const main = $('#main');
  const hadFocus = document.activeElement?.id === 'price-search';
  main.innerHTML = view();
  if (hadFocus) {
    const s = $('#price-search');
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  }
  const gsel = $('[data-add-grocery] select');
  if (gsel && store('lastGcat')) gsel.value = store('lastGcat');
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const last = store('lastExport');
  const stale = S.trips.length >= 3 && (!last || Date.now() - Date.parse(last) > 14 * 864e5);
  $('#backup-banner').hidden = !stale;
}

// ---------- events ----------
function wire() {
  $('#tabs').onclick = (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    store('tab', tab);
    render();
    window.scrollTo(0, 0);
  };
  $('#settings-btn').onclick = openSettings;
  $('#backup-banner').onclick = openSettings;

  const main = $('#main');
  main.addEventListener('input', (e) => {
    if (e.target.id === 'price-search') render();
  });
  main.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-add-grocery]')) return;
    e.preventDefault();
    const input = e.target.querySelector('input');
    const name = input.value.trim();
    if (!name) return;
    const category = e.target.querySelector('select').value;
    store('lastGcat', category);
    await write([{ store: 'groceries', put: { id: newId(), name, category, store: '', checked: false, logged: false, createdAt: new Date().toISOString() } }]);
    await reload();
    $('[data-add-grocery] input')?.focus();
  });
  main.addEventListener('change', async (e) => {
    const id = e.target.dataset.toggle;
    if (!id) return;
    const g = S.groceries.find((x) => x.id === id);
    await write([{ store: 'groceries', put: { ...g, checked: e.target.checked, logged: e.target.checked ? g.logged : false } }]);
    await reload();
  });
  main.addEventListener('click', async (e) => {
    if (e.target.closest('[data-stop]')) return;
    const t = (sel) => e.target.closest(sel);
    if (t('[data-new-want]')) return openWant();
    if (t('[data-want]')) return openWant(S.wants.find((w) => w.id === t('[data-want]').dataset.want));
    if (t('[data-new-purchase]')) return openPurchase();
    if (t('[data-trip]')) return openPurchase({ trip: S.trips.find((x) => x.id === t('[data-trip]').dataset.trip) });
    if (t('[data-product]')) return openProduct(S.products.find((x) => x.id === t('[data-product]').dataset.product));
    if (t('[data-notes-import]')) return openNotesImport(t('[data-notes-import]').dataset.notesImport);
    if (t('[data-grocery]')) return openGrocery(S.groceries.find((g) => g.id === t('[data-grocery]').dataset.grocery));
    if (t('[data-uncheck-all]')) {
      if (!confirm('Uncheck everything to start a new list?')) return;
      await write(S.groceries.filter((g) => g.checked).map((g) => ({ store: 'groceries', put: { ...g, checked: false, logged: false } })));
      return reload();
    }
    if (t('[data-log-checked]')) {
      const toLog = S.groceries.filter((g) => g.checked && !g.logged);
      const stores = [...new Set(toLog.map((g) => g.store).filter(Boolean))];
      if (stores.length === 1) store('lastStore', stores[0]);
      return openPurchase({
        prefill: toLog.map((g) => {
          const p = productsNamed(g.name)[0];
          return { name: g.name, brand: p?.brand, size: p?.defaultSize, unit: p?.defaultUnit };
        }),
        onSaved: () => write(toLog.map((g) => ({ store: 'groceries', put: { ...g, logged: true } }))),
      });
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

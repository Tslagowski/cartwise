import { CATEGORIES, FIT_STATES, OWNERSHIP, outfitErrors, pieceErrors } from './model.js';
import { compressPhoto } from './photo.js';
import { wardrobeStorage } from './storage.js';

const $ = (id) => document.getElementById(id);
const storage = wardrobeStorage();
const screens = ['closet', 'outfits', 'piece-detail', 'piece-editor', 'outfit-editor'];
const pieceForm = $('piece-form');
const outfitForm = $('outfit-form');
const pieceFields = ['photo', 'piece-name', 'ownership', 'category', 'fit-state'];
let screen = 'closet';
let pieces = new Map();
let outfits = [];
let outfit;
let draftPhoto;
let draftPhotoUrl;
let photoError = '';
let photoRequest = 0;
let processingPhoto = false;
let saving = false;
let dirty = false;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function options(id, label, values) {
  const field = $(id);
  if (label) field.add(new Option(label, ''));
  for (const value of values) field.add(new Option(value, value));
}

options('ownership', '', OWNERSHIP);
options('category', 'Choose a category', CATEGORIES);
options('fit-state', 'Choose a fit state', FIT_STATES);

function notice(message = '') {
  $('message').textContent = message;
  $('message').hidden = !message;
}

function allowLeave() {
  if (saving) return false;
  return !dirty || window.confirm('Discard your unsaved changes?');
}

function show(next) {
  if (screen === 'piece-editor') resetPhoto();
  dirty = false;
  screen = next;
  for (const name of screens) $(name).hidden = name !== next;
  const tab = next.startsWith('piece') ? 'closet' : next.startsWith('outfit') ? 'outfits' : next;
  for (const name of ['closet', 'outfits']) {
    if (name === tab) $(name + '-tab').setAttribute('aria-current', 'page');
    else $(name + '-tab').removeAttribute('aria-current');
  }
  notice();
  window.scrollTo(0, 0);
  $(next === 'piece-detail' ? 'piece-title' : next + '-title').focus();
}

function navigate(next) {
  if (screen !== next && allowLeave()) show(next);
}

$('closet-tab').onclick = () => navigate('closet');
$('outfits-tab').onclick = () => navigate('outfits');
$('cancel-piece').onclick = () => navigate('closet');
$('cancel-outfit').onclick = () => navigate('outfits');
$('close-detail').onclick = () => navigate('closet');

window.addEventListener('beforeunload', (event) => {
  if (!dirty && !saving) return;
  event.preventDefault();
  event.returnValue = true;
});

function fieldError(id, message = '') {
  $(id + '-error').textContent = message;
  if (message) $(id).setAttribute('aria-invalid', 'true');
  else $(id).removeAttribute('aria-invalid');
}

function trackInput(form, required) {
  form.addEventListener('input', (event) => {
    dirty = true;
    if (required.includes(event.target.id)) fieldError(event.target.id);
  });
}

trackInput(pieceForm, pieceFields.filter((id) => id !== 'photo'));
trackInput(outfitForm, ['outfit-name']);

function resetPhoto() {
  photoRequest++;
  if (draftPhotoUrl) URL.revokeObjectURL(draftPhotoUrl);
  draftPhoto = draftPhotoUrl = undefined;
  photoError = '';
  $('photo-preview').removeAttribute('src');
  $('photo-preview').hidden = true;
  processingPhoto = false;
}

$('add-piece').onclick = () => {
  pieceForm.reset();
  $('optional-fields').open = false;
  for (const id of pieceFields) fieldError(id);
  $('piece-save-error').textContent = '';
  show('piece-editor');
};

$('photo').onchange = async () => {
  const file = $('photo').files[0];
  if (!file) return;
  dirty = true;
  const request = ++photoRequest;
  processingPhoto = true;
  photoError = '';
  fieldError('photo');
  $('photo-error').textContent = 'Preparing photo…';
  try {
    const photo = await compressPhoto(file);
    if (request !== photoRequest) return;
    if (draftPhotoUrl) URL.revokeObjectURL(draftPhotoUrl);
    draftPhoto = photo;
    draftPhotoUrl = URL.createObjectURL(photo);
    $('photo-preview').src = draftPhotoUrl;
    $('photo-preview').hidden = false;
    fieldError('photo');
  } catch (error) {
    if (request !== photoRequest) return;
    photoError = error.message;
    fieldError('photo', draftPhoto ? photoError + ' The previous photo is still selected.' : photoError);
    $('photo').value = '';
  } finally {
    if (request === photoRequest) processingPhoto = false;
  }
};

async function save(form, errorId, write, onSuccess) {
  saving = true;
  $(errorId).textContent = '';
  // Freeze the submitted draft until the transaction commits or fails.
  const controls = [...form.elements].filter((control) => !control.disabled);
  for (const control of controls) control.disabled = true;
  try {
    onSuccess(await write());
  } catch (error) {
    const reason = error?.name === 'QuotaExceededError'
      ? 'This device is out of browser storage.'
      : 'Wardrobe could not save to local storage.';
    $(errorId).textContent = reason + ' Your draft is still here. Try saving again.';
  } finally {
    for (const control of controls) control.disabled = false;
    saving = false;
  }
}

pieceForm.onsubmit = (event) => {
  event.preventDefault();
  if (saving) return;
  if (processingPhoto) {
    $('piece-save-error').textContent = 'Wait for the photo to finish processing, then save.';
    return;
  }
  $('piece-save-error').textContent = '';
  const piece = Object.fromEntries([...new FormData(pieceForm)]
    .filter(([key]) => key !== 'photo')
    .map(([key, value]) => [key, value.trim()]));
  piece.photo = draftPhoto;
  const errors = pieceErrors(piece);
  fieldError('photo', photoError ? photoError + (draftPhoto ? ' The previous photo is still selected.' : '') : errors.photo);
  fieldError('piece-name', errors.name);
  fieldError('category', errors.category);
  fieldError('fit-state', errors.fitState);
  fieldError('ownership', errors.ownership);
  const first = pieceFields.find((id) => $(id + '-error').textContent && (id !== 'photo' || !draftPhoto));
  if (first) {
    $(first).focus();
    return;
  }
  save(pieceForm, 'piece-save-error', () => storage.addPiece(piece), (record) => {
    addToCloset(record);
    renderCloset();
    show('closet');
    notice('Piece saved.');
  });
};

function addToCloset(record) {
  pieces.set(record.id, { ...record, photoUrl: URL.createObjectURL(record.photo) });
}

function photoFor(piece) {
  const img = element('img');
  img.src = piece.photoUrl;
  img.alt = '';
  img.decoding = 'async';
  return img;
}

function badge(label, prospective = label === 'Prospective') {
  return element('span', prospective ? 'badge prospective' : 'badge', label);
}

function pieceCard(piece, action, click) {
  const button = element('button', 'card');
  button.type = 'button';
  const copy = element('span', 'card-copy');
  copy.append(
    element('span', 'card-name', piece.name),
    badge(piece.ownership),
    element('span', 'card-meta', piece.category + ' · ' + piece.fitState),
  );
  if (action) copy.append(element('span', 'card-state', action));
  button.append(photoFor(piece), copy);
  button.onclick = click;
  return button;
}

function renderCloset() {
  $('piece-count').textContent = pieces.size === 1 ? '1 piece' : pieces.size + ' pieces';
  const grid = $('closet-grid');
  grid.replaceChildren();
  if (!pieces.size) grid.append(element('p', 'empty', 'Add your first piece to start building outfits.'));
  for (const piece of [...pieces.values()].sort((a, b) => b.createdAt - a.createdAt)) {
    grid.append(pieceCard(piece, '', () => showPiece(piece)));
  }
}

function showPiece(piece) {
  $('piece-title').textContent = piece.name;
  const img = photoFor(piece);
  img.className = 'detail-photo';
  img.alt = piece.name;
  const metadata = [piece.category, piece.fitState, piece.brand, piece.size, piece.color].filter(Boolean);
  const info = element('p', 'detail-meta');
  info.append(badge(piece.ownership), document.createTextNode(' ' + metadata.join(' · ')));
  $('piece-content').replaceChildren(img, info);
  if (piece.notes) $('piece-content').append(element('p', 'detail-notes', piece.notes));
  show('piece-detail');
}

function renderOutfits() {
  $('outfit-count').textContent = outfits.length === 1 ? '1 saved outfit' : outfits.length + ' saved outfits';
  const list = $('outfit-list');
  list.replaceChildren();
  if (!outfits.length) {
    list.append(element('p', 'empty', 'Choose pieces from your closet to save your first outfit.'));
  }
  for (const record of outfits) {
    const selected = record.pieceIds.map((id) => pieces.get(id)).filter(Boolean);
    const button = element('button', 'card');
    button.type = 'button';
    const photos = element('span', 'outfit-photos');
    photos.append(...selected.slice(0, 4).map(photoFor));
    const copy = element('span', 'card-copy');
    const count = selected.length === 1 ? '1 piece' : selected.length + ' pieces';
    copy.append(element('span', 'card-name', record.name), element('span', 'card-meta', count));
    if (selected.some((piece) => piece.ownership === 'Prospective')) copy.append(badge('Includes prospective pieces', true));
    button.append(photos, copy);
    button.onclick = () => openOutfit(record);
    list.append(button);
  }
}

$('new-outfit').onclick = () => openOutfit();

function openOutfit(record) {
  outfit = { id: record?.id, pieceIds: new Set(record?.pieceIds) };
  $('outfit-editor-title').textContent = record ? 'Edit outfit' : 'Create outfit';
  $('outfit-name').value = record?.name || '';
  $('outfit-save-error').textContent = '';
  fieldError('outfit-name');
  $('board-error').textContent = '';
  $('picker-grid').replaceChildren();
  for (const piece of pieces.values()) {
    const button = pieceCard(piece, 'Add to board', () => {
      if (saving) return;
      if (outfit.pieceIds.has(piece.id)) outfit.pieceIds.delete(piece.id);
      else outfit.pieceIds.add(piece.id);
      dirty = true;
      $('board-error').textContent = '';
      renderBoard();
    });
    button.dataset.piece = piece.id;
    $('picker-grid').append(button);
  }
  if (!pieces.size) $('picker-grid').append(element('p', 'empty', 'Add a piece in Closet to start an outfit.'));
  renderBoard();
  show('outfit-editor');
}

function renderBoard() {
  const selected = [...outfit.pieceIds].map((id) => pieces.get(id)).filter(Boolean);
  $('board-title').textContent = selected.length ? 'On the board (' + selected.length + ')' : 'On the board';
  $('board-empty').hidden = Boolean(selected.length);
  $('board-grid').replaceChildren(...selected.map((piece) => pieceCard(piece, 'Remove from board', () => {
    if (saving) return;
    outfit.pieceIds.delete(piece.id);
    dirty = true;
    renderBoard();
    $('picker-grid').querySelector('[data-piece="' + piece.id + '"]').focus();
  })));

  for (const button of $('picker-grid').querySelectorAll('button[data-piece]')) {
    const selected = outfit.pieceIds.has(button.dataset.piece);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.card-state').textContent = selected ? 'On the board' : 'Add to board';
  }
}

outfitForm.onsubmit = (event) => {
  event.preventDefault();
  if (saving) return;
  $('outfit-save-error').textContent = '';
  const pieceIds = [...outfit.pieceIds];
  const name = $('outfit-name').value;
  const errors = outfitErrors(name, pieceIds);
  fieldError('outfit-name', errors.name);
  $('board-error').textContent = errors.board || '';
  if (errors.name) $('outfit-name').focus();
  if (Object.keys(errors).length) return;
  save(outfitForm, 'outfit-save-error', () => storage.saveOutfit({ id: outfit.id, name, pieceIds }), (record) => {
    outfits = [record, ...outfits.filter((entry) => entry.id !== record.id)];
    renderOutfits();
    show('outfits');
    notice('Outfit saved.');
  });
};

async function load() {
  try {
    const data = await storage.load();
    for (const record of data.pieces) addToCloset(record);
    outfits = data.outfits.sort((a, b) => b.updatedAt - a.updatedAt);
    renderCloset();
    renderOutfits();
    $('add-piece').disabled = $('new-outfit').disabled = false;
  } catch {
    $('piece-count').textContent = 'Closet unavailable';
    $('outfit-count').textContent = 'Outfits unavailable';
    notice('Wardrobe could not open local storage. Reload the preview to try again.');
  }
}

async function enableOffline() {
  const status = $('offline-status');
  try {
    const script = new URL('./sw.js', location.href).href;
    const updateStatus = () => {
      if (navigator.serviceWorker.controller?.scriptURL === script) status.textContent = 'Ready offline';
    };
    navigator.serviceWorker.addEventListener('controllerchange', updateStatus);
    const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    const worker = registration.installing;
    const watch = (worker) => worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant' && !registration.active) status.textContent = 'Offline setup failed. Reload to retry.';
    });
    if (worker) watch(worker);
    registration.addEventListener('updatefound', () => {
      if (registration.installing) watch(registration.installing);
    });
    updateStatus();
  } catch {
    status.textContent = 'Offline access unavailable.';
  }
}

load();
enableOffline();

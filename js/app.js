import {
  settings, saveSettings, hasProject,
  getLock, setLock, hasLock, clearLock,
  failedTries, bumpFailedTries, resetFailedTries, MAX_PIN_TRIES,
  getSecretBox, setSecretBox,
  setOpenAIKey, openAIKey, takeLegacyPlainKey,
} from './config.js';
import { t, applyI18n, toggleLang, formatDate } from './i18n.js';
import {
  deriveCredentials, slugUser, makeCheck, verifyCheck,
  encryptWith, decryptWith, cryptoAvailable,
} from './crypto.js';
import * as db from './supa.js';
import { Recorder } from './recorder.js';
import { transcribe } from './transcribe.js';
import { currentPosition, placeName, coordText, mapsLink } from './geo.js';
import { preparePhoto, localPreview } from './photos.js';
import { isVideo, readVideo, humanSize, clockTime, MAX_VIDEO_BYTES } from './video.js';

const $ = id => document.getElementById(id);

const state = {
  session: null,
  date: todayISO(),
  entry: null,        // row from `entries`, or null when nothing saved yet
  photos: [],         // rows from `entry_photos`
  loc: null,          // { lat, lng, place }
  tags: [],           // labels on the open entry
  filter: { tags: [] },
  audio: null,        // { blob, ext, seconds } waiting to be uploaded
  recorder: null,
  cryptoKey: null,    // AES key derived from the PIN, memory only
  pin: { mode: 'unlock', buffer: '', first: '', busy: false },
};

/* ============================== boot ============================== */

boot();

async function boot() {
  applyI18n();
  wireGlobal();

  if (!hasProject()) return show('setup');

  try {
    state.session = await db.getSession();
  } catch (e) {
    return show('setup');
  }
  db.onAuthChange(session => { state.session = session; });

  askForPin();
  registerSW();
}

/** Signed in and unlocked - hand over to the diary itself. */
function enterApp() {
  show('app');
  openDate(state.date);
}

function show(screen) {
  ['setup', 'pin', 'app'].forEach(s => {
    $(`screen-${s}`).classList.toggle('is-on', s === screen);
  });
  if (screen === 'app') $('who').textContent = state.session?.user?.email ?? '';
}

/* ============================ global UI =========================== */

function wireGlobal() {
  // --- setup screen
  $('setup-save').onclick = () => {
    const url = $('setup-url').value.trim().replace(/\/+$/, '');
    const anon = $('setup-anon').value.trim();
    if (!url || !anon) return toast('?');
    saveSettings({ supabaseUrl: url, supabaseAnon: anon });
    location.reload();
  };

  // --- login: username + PIN
  document.querySelectorAll('.keypad .key').forEach(btn => {
    btn.onclick = () => pinPress(btn.dataset.k);
  });
  document.addEventListener('keydown', e => {
    if (!$('screen-pin').classList.contains('is-on')) return;
    if (document.activeElement === $('pin-user') && e.key !== 'Enter') return;
    if (/^\d$/.test(e.key)) pinPress(e.key);
    else if (e.key === 'Backspace') pinPress('del');
    else if (e.key === 'Enter') pinPress('ok');
  });
  $('pin-newuser').onclick = () => startLogin({ mode: 'create' });
  $('pin-switch').onclick = async () => {
    clearLock();
    saveSettings({ username: '' });
    await db.signOut();
    startLogin({ mode: 'signin' });
  };

  // --- nav
  $('nav-today').onclick = () => switchView('today');
  $('nav-list').onclick = () => { switchView('list'); renderList(); };
  $('nav-settings').onclick = () => { switchView('settings'); fillSettings(); };
  $('lang-toggle').onclick = () => {
    toggleLang();
    // Re-label only - never touch the textarea, it may hold unsaved typing.
    $('entry-text').placeholder = formatDate(state.date);
    if (!$('view-list').hidden) renderList();
  };

  // --- date
  $('entry-date').onchange = e => openDate(e.target.value);
  $('date-prev').onclick = () => openDate(shiftDate(state.date, -1));
  $('date-next').onclick = () => openDate(shiftDate(state.date, 1));

  // --- recorder
  $('rec-btn').onclick = toggleRecording;
  $('btn-transcribe').onclick = runTranscribe;
  $('btn-drop-audio').onclick = () => { state.audio = null; renderAudio(); };

  // --- entry actions
  $('btn-locate').onclick = grabLocation;
  $('photo-input').onchange = e => { addMedia([...e.target.files]); e.target.value = ''; };
  $('video-input').onchange = e => { addMedia([...e.target.files]); e.target.value = ''; };

  $('tag-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag($('tag-input').value);
      $('tag-input').value = '';
    } else if (e.key === 'Backspace' && !$('tag-input').value && state.tags.length) {
      state.tags.pop();
      renderTags();
    }
  });
  $('tag-input').addEventListener('blur', () => {
    if ($('tag-input').value.trim()) { addTag($('tag-input').value); $('tag-input').value = ''; }
  });

  // --- list filters
  $('filter-from').onchange = renderList;
  $('filter-to').onchange = renderList;
  $('filter-clear').onclick = () => {
    $('search').value = '';
    $('filter-from').value = '';
    $('filter-to').value = '';
    state.filter.tags = [];
    renderList();
  };

  // --- media viewer
  $('viewer-close').onclick = closeViewer;
  $('viewer').onclick = e => { if (e.target === $('viewer')) closeViewer(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('viewer').hidden) closeViewer();
  });
  $('btn-save').onclick = () => saveEntry({ toastIt: true });
  $('btn-delete').onclick = removeEntry;

  // --- settings
  $('set-save').onclick = async () => {
    saveSettings({
      model: $('set-model').value,
      sttLang: $('set-sttlang').value,
      vocab: $('set-vocab').value.trim(),
    });
    // The API key never goes into settings - it is encrypted under the PIN.
    const key = $('set-openai').value.trim();
    try {
      if (state.cryptoKey) {
        setSecretBox(key ? await encryptWith(state.cryptoKey, key) : null);
      }
      setOpenAIKey(key);
      $('set-status').textContent = t('set.saved');
      setTimeout(() => { $('set-status').textContent = ''; }, 2000);
    } catch (e) {
      toast(e.message);
    }
  };
  $('btn-changepin').onclick = () => startLogin({ mode: 'change' });
  $('btn-signout').onclick = async () => { await db.signOut(); location.reload(); };
  $('btn-export').onclick = exportAll;

  // --- search
  let searchTimer;
  $('search').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 250);
  };

  // warn before losing an unsaved recording
  window.addEventListener('beforeunload', e => {
    if (state.audio || $('entry-text').dataset.dirty === '1') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  $('entry-text').addEventListener('input', () => { $('entry-text').dataset.dirty = '1'; });
}

function switchView(name) {
  for (const v of ['today', 'list', 'settings']) $(`view-${v}`).hidden = v !== name;
  $('nav-today').classList.toggle('is-active', name === 'today');
  $('nav-list').classList.toggle('is-active', name === 'list');
}

/* ============================== PIN =============================== */

const PIN_MIN = 4;
const PIN_MAX = 8;

/**
 * Three ways in, all on one screen:
 *   unlock  - this device already knows you; the PIN is checked offline
 *   signin  - name + PIN, verified against Supabase
 *   create  - name + PIN twice, makes the account
 */
function askForPin() {
  if (!cryptoAvailable()) {
    // No WebCrypto means no secure context. Say so rather than fail silently.
    show('pin');
    $('pin-msg').textContent = t('pin.noCrypto');
    return;
  }
  const known = hasLock() && settings().username && state.session;
  startLogin({ mode: known ? 'unlock' : 'signin' });
}

function startLogin({ mode }) {
  state.pin = { mode, buffer: '', first: '', pendingUser: '', busy: false };
  $('pin-msg').textContent = '';
  $('pin-user').value = mode === 'unlock' ? '' : settings().username;
  renderPin();
  show('pin');
}

function renderPin() {
  const { mode, buffer } = state.pin;

  const unlocking = mode === 'unlock';
  const changing = mode === 'change' || mode === 'changeConfirm';
  $('pin-user-row').hidden = unlocking || changing;
  $('pin-newuser').hidden = mode === 'create' || changing;
  $('pin-switch').hidden = !unlocking;

  $('pin-greet').textContent = unlocking
    ? t('pin.greet', { name: settings().username })
    : mode === 'create' ? t('pin.greetNew')
    : mode === 'signin' && !settings().username ? t('pin.firstTime')
    : '';

  const prompt = {
    unlock: 'pin.enter', signin: 'pin.signin', create: 'pin.create',
    confirm: 'pin.confirm', change: 'pin.create', changeConfirm: 'pin.confirm',
  }[mode];
  $('pin-prompt').textContent = t(prompt);

  const dots = $('pin-dots');
  dots.innerHTML = '';
  for (let i = 0; i < PIN_MAX; i++) {
    const dot = document.createElement('span');
    dot.className = 'pin-dot' + (i < buffer.length ? ' is-on' : '') + (i < PIN_MIN ? '' : ' is-extra');
    dots.appendChild(dot);
  }
}

function pinPress(k) {
  const p = state.pin;
  if (p.busy) return;

  if (k === 'del') {
    p.buffer = p.buffer.slice(0, -1);
    return renderPin();
  }
  if (k === 'ok') return pinSubmit();

  if (p.buffer.length >= PIN_MAX) return;
  p.buffer += k;
  renderPin();
  // A full-length PIN submits itself, so you rarely need the tick.
  if (p.mode === 'unlock' && p.buffer.length === PIN_MAX) pinSubmit();
}

async function pinSubmit() {
  const p = state.pin;
  const pin = p.buffer;

  if (pin.length < PIN_MIN) {
    $('pin-msg').textContent = t('pin.tooShort');
    return;
  }

  // --- first of two entries when making a new account
  if (p.mode === 'create') {
    const name = slugUser($('pin-user').value);
    if (!name) {
      $('pin-msg').textContent = t('pin.needName');
      return;
    }
    p.pendingUser = name;
    p.first = pin;
    p.buffer = '';
    p.mode = 'confirm';
    $('pin-msg').textContent = '';
    return renderPin();
  }

  if (p.mode === 'confirm') {
    if (pin !== p.first) {
      p.mode = 'create';
      p.first = '';
      p.buffer = '';
      $('pin-msg').textContent = t('pin.mismatch');
      return renderPin();
    }
    return finishLogin(p.pendingUser, pin, { creating: true });
  }

  if (p.mode === 'signin') {
    const name = slugUser($('pin-user').value);
    if (!name) {
      $('pin-msg').textContent = t('pin.needName');
      return;
    }
    return finishLogin(name, pin, { creating: false });
  }

  // --- changing the PIN of an account already signed in
  if (p.mode === 'change') {
    p.first = pin;
    p.buffer = '';
    p.mode = 'changeConfirm';
    $('pin-msg').textContent = '';
    return renderPin();
  }

  if (p.mode === 'changeConfirm') {
    if (pin !== p.first) {
      p.mode = 'change';
      p.first = '';
      p.buffer = '';
      $('pin-msg').textContent = t('pin.mismatch');
      return renderPin();
    }
    p.busy = true;
    $('pin-msg').textContent = t('pin.working');
    try {
      const username = settings().username;
      const { password, localKey } = await deriveCredentials(username, pin);
      await db.updatePassword(password);              // the Supabase side
      const apiKey = openAIKey();                     // keep the key across the change
      setLock({ v: 2, user: username, check: await makeCheck(localKey) });
      setSecretBox(apiKey ? await encryptWith(localKey, apiKey) : null);
      state.cryptoKey = localKey;
      resetFailedTries();
      p.busy = false;
      toast(t('pin.set'));
      return enterApp();
    } catch (e) {
      p.busy = false;
      p.buffer = '';
      $('pin-msg').textContent = e.message;
      return renderPin();
    }
  }

  // --- unlock: no network, just check the PIN against the stored token
  p.busy = true;
  $('pin-msg').textContent = t('pin.working');
  try {
    const { localKey } = await deriveCredentials(settings().username, pin);
    await verifyCheck(localKey, getLock().check);
    state.cryptoKey = localKey;
    resetFailedTries();
    const box = getSecretBox();
    setOpenAIKey(box ? await decryptWith(localKey, box) : '');
    p.busy = false;
    enterApp();
  } catch {
    p.busy = false;
    p.buffer = '';
    const left = MAX_PIN_TRIES - bumpFailedTries();
    if (left <= 0) {
      clearLock();
      saveSettings({ username: '' });
      await db.signOut();
      $('pin-msg').textContent = t('pin.locked');
      return setTimeout(() => location.reload(), 2500);
    }
    $('pin-msg').textContent = t('pin.wrong', { n: left });
    renderPin();
  }
}

/** Sign in or sign up against Supabase using the derived credentials. */
async function finishLogin(username, pin, { creating }) {
  const p = state.pin;
  p.busy = true;
  $('pin-msg').textContent = t(creating ? 'pin.signup' : 'pin.working');
  try {
    const { user, email, password, localKey } = await deriveCredentials(username, pin);

    if (creating) {
      const { needsConfirm } = await db.signUpWithPassword(email, password);
      // Email confirmation must be off; without a session there is nothing to do.
      if (needsConfirm) await db.signInWithPassword(email, password);
    } else {
      await db.signInWithPassword(email, password);
    }

    state.session = await db.getSession();
    state.cryptoKey = localKey;
    saveSettings({ username: user });
    setLock({ v: 2, user, check: await makeCheck(localKey) });
    resetFailedTries();

    // Carry a key from an older build across, then re-encrypt under this PIN.
    const existing = openAIKey() || takeLegacyPlainKey();
    const box = getSecretBox();
    let apiKey = existing;
    if (!apiKey && box) {
      try { apiKey = await decryptWith(localKey, box); } catch { apiKey = ''; }
    }
    setSecretBox(apiKey ? await encryptWith(localKey, apiKey) : null);
    setOpenAIKey(apiKey);

    p.busy = false;
    enterApp();
  } catch (e) {
    p.busy = false;
    p.buffer = '';
    $('pin-msg').textContent = loginError(e, creating);
    renderPin();
  }
}

function loginError(e, creating) {
  const msg = String(e?.message || e);
  if (/already registered|already been registered|User already/i.test(msg)) return t('pin.taken');
  if (/[Ss]ignups? not allowed|signup_disabled/i.test(msg)) return t('pin.signupOff');
  // Supabase deliberately does not say whether it was the name or the PIN.
  if (/Invalid login credentials/i.test(msg)) return t('pin.noAccount');
  return creating ? msg : `${t('pin.wrongNet')} (${msg})`;
}

/* ============================= entries ============================ */

async function openDate(date) {
  state.date = date;
  $('entry-date').value = date;
  switchView('today');
  state.audio = null;
  state.loc = null;
  state.entry = null;
  state.photos = [];
  state.tags = [];
  renderAudio();

  try {
    const row = await db.getEntry(date);
    state.entry = row;
    state.photos = row?.entry_photos ?? [];
    state.tags = row?.tags ?? [];
    if (row?.lat != null && row?.lng != null) {
      state.loc = { lat: row.lat, lng: row.lng, place: row.place };
    }
  } catch (e) {
    toast(e.message);
  }
  renderEntry();
}

function renderEntry() {
  $('entry-text').value = state.entry?.text ?? '';
  $('entry-text').dataset.dirty = '0';
  $('entry-text').placeholder = formatDate(state.date);
  $('btn-delete').hidden = !state.entry;
  renderLocation();
  renderTags();
  renderPhotos();
  renderSavedAudio();
  refreshTagOptions();
}

/* ============================== tags ============================== */

function cleanTag(raw) {
  return String(raw || '').trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 40);
}

function addTag(raw) {
  for (const part of String(raw).split(',')) {
    const tag = cleanTag(part);
    if (tag && !state.tags.includes(tag)) state.tags.push(tag);
  }
  renderTags();
}

function renderTags() {
  const box = $('tag-view');
  box.innerHTML = '';
  for (const tag of state.tags) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(`#${tag}`);
    const x = document.createElement('button');
    x.textContent = '×';
    x.onclick = () => {
      state.tags = state.tags.filter(t2 => t2 !== tag);
      renderTags();
    };
    chip.appendChild(x);
    box.appendChild(chip);
  }
}

/** Feed the datalist so old tags autocomplete instead of getting re-typed. */
async function refreshTagOptions() {
  try {
    const tags = await db.allTags();
    const list = $('tag-options');
    list.innerHTML = '';
    for (const { tag } of tags) {
      const opt = document.createElement('option');
      opt.value = tag;
      list.appendChild(opt);
    }
  } catch { /* autocomplete is a nicety */ }
}

/** Make sure a row exists so photos have something to hang off. */
async function ensureEntry() {
  if (state.entry?.id) return state.entry;
  state.entry = await db.upsertEntry({
    entry_date: state.date,
    text: $('entry-text').value,
    tags: state.tags,
  });
  $('btn-delete').hidden = false;
  return state.entry;
}

async function saveEntry({ toastIt = false } = {}) {
  $('btn-save').disabled = true;
  $('save-status').textContent = t('entry.saving');
  try {
    const patch = {
      entry_date: state.date,
      text: $('entry-text').value,
      lat: state.loc?.lat ?? null,
      lng: state.loc?.lng ?? null,
      place: state.loc?.place ?? null,
      tags: state.tags,
    };
    if (state.entry?.id) patch.id = state.entry.id;

    // Upload the pending voice note alongside the text so you can replay it.
    if (state.audio) {
      const path = db.userPath(state.session.user.id, state.date, `stem-${Date.now()}.${state.audio.ext}`);
      await db.uploadFile(path, state.audio.blob, state.audio.blob.type || 'audio/webm');
      patch.audio_path = path;
      const old = state.entry?.audio_path;
      if (old && old !== path) await db.removeFiles([old]);
    }

    state.entry = await db.upsertEntry(patch);
    state.audio = null;
    $('entry-text').dataset.dirty = '0';
    renderAudio();
    renderSavedAudio();
    $('save-status').textContent = t('entry.saved');
    if (toastIt) toast(t('entry.saved'));
    setTimeout(() => { $('save-status').textContent = ''; }, 2500);
  } catch (e) {
    $('save-status').textContent = '';
    toast(e.message);
  } finally {
    $('btn-save').disabled = false;
  }
}

async function removeEntry() {
  if (!state.entry?.id) return;
  if (!confirm(t('entry.deleteConfirm'))) return;
  try {
    const paths = state.photos.map(p => p.path);
    if (state.entry.audio_path) paths.push(state.entry.audio_path);
    await db.removeFiles(paths);
    await db.deleteEntry(state.entry.id);   // cascades to entry_photos rows
    await openDate(state.date);
    toast('✓');
  } catch (e) {
    toast(e.message);
  }
}

/* ============================ recording =========================== */

async function toggleRecording() {
  const btn = $('rec-btn');

  if (state.recorder?.recording) {
    const result = await state.recorder.stop();
    state.recorder = null;
    btn.classList.remove('is-rec');
    $('rec-label').textContent = t('rec.done');
    $('rec-level').style.width = '0%';
    if (result?.blob?.size) {
      state.audio = result;
      renderAudio();
      // Straight to text - that is the whole point of the daily voice note.
      if (openAIKey()) runTranscribe();
    }
    return;
  }

  state.recorder = new Recorder({
    onTick: label => { $('rec-time').textContent = label; },
    onLevel: v => { $('rec-level').style.width = `${Math.round(v * 100)}%`; },
  });
  try {
    await state.recorder.start();
    btn.classList.add('is-rec');
    $('rec-label').textContent = t('rec.recording');
    $('rec-time').textContent = '0:00';
  } catch (e) {
    state.recorder = null;
    toast(t('rec.noMic'));
  }
}

function renderAudio() {
  const player = $('audio-play');
  if (state.audio) {
    player.src = URL.createObjectURL(state.audio.blob);
    player.hidden = false;
    $('transcribe-row').hidden = false;
  } else {
    $('transcribe-row').hidden = true;
    $('transcribe-status').textContent = '';
    renderSavedAudio();
  }
}

async function renderSavedAudio() {
  if (state.audio) return;
  const player = $('audio-play');
  const path = state.entry?.audio_path;
  if (!path) { player.hidden = true; player.removeAttribute('src'); return; }
  const url = await db.fileUrl(path);
  if (url) { player.src = url; player.hidden = false; }
}

async function runTranscribe() {
  if (!state.audio) return;
  if (!openAIKey()) return toast(t('rec.noKey'));

  $('btn-transcribe').disabled = true;
  $('transcribe-status').textContent = t('rec.working');
  try {
    const text = await transcribe(state.audio.blob, state.audio.ext);
    if (text) {
      const box = $('entry-text');
      box.value = box.value.trim() ? `${box.value.trim()}\n\n${text}` : text;
      box.dataset.dirty = '1';
      box.scrollTop = box.scrollHeight;
    }
    $('transcribe-status').textContent = '';
    await saveEntry();
  } catch (e) {
    $('transcribe-status').textContent = e.code === 'NO_KEY' ? t('rec.noKey') : e.message;
  } finally {
    $('btn-transcribe').disabled = false;
  }
}

/* ============================ location ============================ */

async function grabLocation() {
  const box = $('loc-view');
  box.innerHTML = `<span class="chip">${t('entry.locating')}</span>`;
  try {
    const pos = await currentPosition();
    const place = await placeName(pos.lat, pos.lng);
    state.loc = { lat: pos.lat, lng: pos.lng, place };
    renderLocation();
  } catch {
    state.loc = null;
    renderLocation();
    toast(t('entry.locFail'));
  }
}

function renderLocation() {
  const box = $('loc-view');
  box.innerHTML = '';
  if (!state.loc) return;
  const { lat, lng, place } = state.loc;

  const chip = document.createElement('span');
  chip.className = 'chip';

  const link = document.createElement('a');
  link.href = mapsLink(lat, lng);
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = place || coordText(lat, lng);
  chip.appendChild(link);

  const x = document.createElement('button');
  x.textContent = '×';
  x.onclick = () => { state.loc = null; renderLocation(); };
  chip.appendChild(x);

  box.appendChild(chip);
}

/* ============================= photos ============================= */

function stamp(ext) {
  return `${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`;
}

async function addMedia(files) {
  if (!files.length) return;
  try {
    await ensureEntry();
  } catch (e) {
    return toast(e.message);
  }

  for (const file of files) {
    if (isVideo(file) && file.size > MAX_VIDEO_BYTES) {
      toast(t('entry.tooBig', { size: humanSize(file.size) }));
      continue;
    }
    const previewUrl = isVideo(file) ? '' : localPreview(file);
    const node = mediaNode({ preview: previewUrl, busy: true, video: isVideo(file) });
    $('photo-grid').appendChild(node);
    try {
      const row = isVideo(file) ? await uploadVideo(file) : await uploadPhoto(file);
      state.photos.push(row);
    } catch (e) {
      toast(e.message);
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      node.remove();
    }
  }
  renderPhotos();
}

async function uploadPhoto(file) {
  const prep = await preparePhoto(file);
  const path = db.userPath(state.session.user.id, state.date, `foto-${stamp('jpg')}`);
  await db.uploadFile(path, prep.blob, 'image/jpeg');
  const row = await db.addPhotoRow({
    entry_id: state.entry.id,
    path,
    kind: 'photo',
    width: prep.width,
    height: prep.height,
    bytes: prep.blob.size,
    taken_at: prep.takenAt,
    lat: prep.lat,
    lng: prep.lng,
    sort: state.photos.length,
  });

  // A photo carrying GPS fills in the day's location when you have none yet.
  if (!state.loc && prep.lat != null && prep.lng != null) {
    state.loc = { lat: prep.lat, lng: prep.lng, place: await placeName(prep.lat, prep.lng) };
    renderLocation();
    saveEntry();
  }
  return row;
}

async function uploadVideo(file) {
  const meta = await readVideo(file);
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().slice(0, 4);
  const path = db.userPath(state.session.user.id, state.date, `video-${stamp(ext)}`);
  await db.uploadFile(path, file, file.type || 'video/mp4');

  let posterPath = null;
  if (meta.poster) {
    posterPath = db.userPath(state.session.user.id, state.date, `plakkaat-${stamp('jpg')}`);
    await db.uploadFile(posterPath, meta.poster, 'image/jpeg');
  } else {
    toast(t('entry.noPoster'));
  }

  return db.addPhotoRow({
    entry_id: state.entry.id,
    path,
    kind: 'video',
    width: meta.width || null,
    height: meta.height || null,
    duration: meta.duration || null,
    poster_path: posterPath,
    bytes: file.size,
    sort: state.photos.length,
  });
}

function mediaNode({ preview, busy = false, video = false, duration = 0, onRemove, onOpen }) {
  const div = document.createElement('div');
  div.className = 'photo' + (busy ? ' is-busy' : '');
  const img = document.createElement('img');
  img.src = preview || '';
  img.loading = 'lazy';
  div.appendChild(img);

  if (video) {
    const badge = document.createElement('span');
    badge.className = 'play';
    badge.textContent = duration ? clockTime(duration) : '▶';
    div.appendChild(badge);
  }
  if (onOpen) {
    div.classList.add('is-open');
    img.onclick = onOpen;
  }
  if (onRemove) {
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.onclick = onRemove;
    div.appendChild(x);
  }
  return div;
}

async function renderPhotos() {
  const grid = $('photo-grid');
  grid.innerHTML = '';
  for (const m of state.photos) {
    const isVid = m.kind === 'video';
    const node = mediaNode({
      preview: '',
      video: isVid,
      duration: m.duration,
      onRemove: () => removeMedia(m),
      onOpen: () => openViewer(m),
    });
    grid.appendChild(node);
    const thumbPath = isVid ? (m.poster_path || null) : m.path;
    if (thumbPath) {
      db.fileUrl(thumbPath).then(url => { if (url) node.querySelector('img').src = url; });
    }
  }
}

async function removeMedia(media) {
  try {
    await db.deletePhotoRow(media.id);
    await db.removeFiles([media.path, media.poster_path]);
    state.photos = state.photos.filter(p => p.id !== media.id);
    renderPhotos();
  } catch (e) {
    toast(e.message);
  }
}

/* ============================== viewer ============================ */

async function openViewer(media) {
  const body = $('viewer-body');
  body.innerHTML = '';
  $('viewer').hidden = false;
  const url = await db.fileUrl(media.path);
  if (!url) return closeViewer();

  if (media.kind === 'video') {
    const v = document.createElement('video');
    v.src = url;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    if (media.poster_path) db.fileUrl(media.poster_path).then(p => { if (p) v.poster = p; });
    body.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = url;
    body.appendChild(img);
  }
}

function closeViewer() {
  const body = $('viewer-body');
  body.querySelector('video')?.pause();
  body.innerHTML = '';
  $('viewer').hidden = true;
}

/* ============================== list ============================== */

async function renderList() {
  const box = $('entry-list');
  const search = $('search').value;
  const words = db.searchWords(search);

  let rows = [];
  try {
    rows = await db.listEntries({
      search,
      tags: state.filter.tags,
      from: $('filter-from').value,
      to: $('filter-to').value,
    });
  } catch (e) {
    return toast(e.message);
  }

  await renderTagCloud();

  const filtering = words.length || state.filter.tags.length || $('filter-from').value || $('filter-to').value;
  $('list-count').textContent = rows.length
    ? (rows.length === 1 ? t('list.count1') : t('list.count', { n: rows.length }))
    : '';

  box.innerHTML = '';
  if (!rows.length) {
    box.innerHTML = `<p class="hint">${filtering ? t('list.nothing') : t('list.empty')}</p>`;
    return;
  }

  for (const row of rows) {
    const card = document.createElement('button');
    card.className = 'entry-card';
    card.onclick = () => openDate(row.entry_date);

    const d = document.createElement('div');
    d.className = 'd';
    d.textContent = formatDate(row.entry_date);
    card.appendChild(d);

    if (row.place) {
      const p = document.createElement('div');
      p.className = 'p';
      p.textContent = `📍 ${row.place}`;
      card.appendChild(p);
    }

    if (row.text) {
      const tx = document.createElement('div');
      tx.className = 't';
      fillHighlighted(tx, snippet(row.text, words), words);
      card.appendChild(tx);
    }

    if (row.tags?.length) {
      const tagRow = document.createElement('div');
      tagRow.className = 'card-tags';
      for (const tag of row.tags) {
        const el = document.createElement('span');
        el.className = 'mini-tag' + (state.filter.tags.includes(tag) ? ' is-on' : '');
        el.textContent = `#${tag}`;
        tagRow.appendChild(el);
      }
      card.appendChild(tagRow);
    }

    const media = (row.entry_photos ?? []).slice(0, 4);
    if (media.length) {
      const strip = document.createElement('div');
      strip.className = 'thumbs';
      card.appendChild(strip);
      for (const m of media) {
        const wrap = document.createElement('span');
        wrap.className = 'thumb' + (m.kind === 'video' ? ' is-video' : '');
        const img = document.createElement('img');
        img.loading = 'lazy';
        wrap.appendChild(img);
        strip.appendChild(wrap);
        const p = m.kind === 'video' ? m.poster_path : m.path;
        if (p) db.fileUrl(p).then(url => { if (url) img.src = url; });
      }
    }

    box.appendChild(card);
  }
}

/** Show the part of the entry the search actually matched, not just the start. */
function snippet(text, words, radius = 90) {
  if (!words.length || text.length <= radius * 2) return text;
  const hay = text.toLowerCase();
  let at = -1;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at <= radius) return text;
  const start = Math.max(0, at - radius);
  return `…${text.slice(start, start + radius * 3)}`;
}

function fillHighlighted(el, text, words) {
  el.textContent = '';
  if (!words.length) return void (el.textContent = text);

  const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi');
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) el.append(text.slice(last, m.index));
    const mark = document.createElement('mark');
    mark.textContent = m[0];
    el.appendChild(mark);
    last = m.index + m[0].length;
  }
  el.append(text.slice(last));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function renderTagCloud() {
  const cloud = $('tag-cloud');
  let tags = [];
  try { tags = await db.allTags(); } catch { return; }
  cloud.innerHTML = '';
  for (const { tag, n } of tags) {
    const btn = document.createElement('button');
    btn.className = 'chip tag-chip' + (state.filter.tags.includes(tag) ? ' is-on' : '');
    btn.textContent = `#${tag} ${n}`;
    btn.onclick = () => {
      state.filter.tags = state.filter.tags.includes(tag)
        ? state.filter.tags.filter(x => x !== tag)
        : [...state.filter.tags, tag];
      renderList();
    };
    cloud.appendChild(btn);
  }
}

/* ============================ settings ============================ */

function fillSettings() {
  const s = settings();
  $('set-openai').value = openAIKey();
  $('set-model').value = s.model;
  $('set-sttlang').value = s.sttLang;
  $('set-vocab').value = s.vocab;
}

async function exportAll() {
  try {
    const rows = await db.listEntries({ limit: 5000 });
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dagboek-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    toast(e.message);
  }
}

/* ============================= helpers ============================ */

function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDate(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return todayISOFrom(d);
}

function todayISOFrom(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let toastTimer;
function toast(msg) {
  if (!msg) return;
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

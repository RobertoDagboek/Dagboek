import { settings, saveSettings, hasProject } from './config.js';
import { t, applyI18n, toggleLang, formatDate } from './i18n.js';
import * as db from './supa.js';
import { Recorder } from './recorder.js';
import { transcribe } from './transcribe.js';
import { currentPosition, placeName, coordText, mapsLink } from './geo.js';
import { preparePhoto, localPreview } from './photos.js';

const $ = id => document.getElementById(id);

const state = {
  session: null,
  date: todayISO(),
  entry: null,        // row from `entries`, or null when nothing saved yet
  photos: [],         // rows from `entry_photos`
  loc: null,          // { lat, lng, place }
  audio: null,        // { blob, ext, seconds } waiting to be uploaded
  recorder: null,
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
  db.onAuthChange(session => {
    const wasOut = !state.session;
    state.session = session;
    if (session && wasOut) { show('app'); openDate(state.date); }
    if (!session) show('auth');
  });

  if (!state.session) return show('auth');
  show('app');
  openDate(state.date);
  registerSW();
}

function show(screen) {
  ['setup', 'auth', 'app'].forEach(s => {
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

  // --- auth screen
  $('auth-send').onclick = async () => {
    const email = $('auth-email').value.trim();
    if (!email) return;
    $('auth-send').disabled = true;
    try {
      await db.sendMagicLink(email);
      $('auth-msg').textContent = t('auth.sent');
    } catch (e) {
      $('auth-msg').textContent = e.message;
    } finally {
      $('auth-send').disabled = false;
    }
  };
  $('auth-reset').onclick = () => {
    saveSettings({ supabaseUrl: '', supabaseAnon: '' });
    location.reload();
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
  $('photo-input').onchange = e => { addPhotos([...e.target.files]); e.target.value = ''; };
  $('btn-save').onclick = () => saveEntry({ toastIt: true });
  $('btn-delete').onclick = removeEntry;

  // --- settings
  $('set-save').onclick = () => {
    saveSettings({
      openaiKey: $('set-openai').value.trim(),
      model: $('set-model').value,
      sttLang: $('set-sttlang').value,
      vocab: $('set-vocab').value.trim(),
    });
    $('set-status').textContent = t('set.saved');
    setTimeout(() => { $('set-status').textContent = ''; }, 2000);
  };
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

/* ============================= entries ============================ */

async function openDate(date) {
  state.date = date;
  $('entry-date').value = date;
  switchView('today');
  state.audio = null;
  state.loc = null;
  state.entry = null;
  state.photos = [];
  renderAudio();

  try {
    const row = await db.getEntry(date);
    state.entry = row;
    state.photos = row?.entry_photos ?? [];
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
  renderPhotos();
  renderSavedAudio();
}

/** Make sure a row exists so photos have something to hang off. */
async function ensureEntry() {
  if (state.entry?.id) return state.entry;
  state.entry = await db.upsertEntry({
    entry_date: state.date,
    text: $('entry-text').value,
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
      updated_at: new Date().toISOString(),
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
      if (settings().openaiKey) runTranscribe();
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
  if (!settings().openaiKey) return toast(t('rec.noKey'));

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

async function addPhotos(files) {
  if (!files.length) return;
  try {
    await ensureEntry();
  } catch (e) {
    return toast(e.message);
  }

  for (const file of files) {
    const previewUrl = localPreview(file);
    const node = photoNode({ preview: previewUrl, busy: true });
    $('photo-grid').appendChild(node);
    try {
      const prep = await preparePhoto(file);
      const name = `foto-${Date.now()}-${Math.round(Math.random() * 1e4)}.jpg`;
      const path = db.userPath(state.session.user.id, state.date, name);
      await db.uploadFile(path, prep.blob, 'image/jpeg');
      const row = await db.addPhotoRow({
        entry_id: state.entry.id,
        path,
        width: prep.width,
        height: prep.height,
        taken_at: prep.takenAt,
        lat: prep.lat,
        lng: prep.lng,
        sort: state.photos.length,
      });
      state.photos.push(row);

      // A photo with GPS fills in the day's location when you have none yet.
      if (!state.loc && prep.lat != null && prep.lng != null) {
        state.loc = { lat: prep.lat, lng: prep.lng, place: await placeName(prep.lat, prep.lng) };
        renderLocation();
        saveEntry();
      }
    } catch (e) {
      toast(e.message);
    } finally {
      URL.revokeObjectURL(previewUrl);
      node.remove();
    }
  }
  renderPhotos();
}

function photoNode({ preview, busy = false, onRemove }) {
  const div = document.createElement('div');
  div.className = 'photo' + (busy ? ' is-busy' : '');
  const img = document.createElement('img');
  img.src = preview || '';
  img.loading = 'lazy';
  div.appendChild(img);
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
  for (const p of state.photos) {
    const node = photoNode({
      preview: '',
      onRemove: () => removePhoto(p),
    });
    grid.appendChild(node);
    db.fileUrl(p.path).then(url => { if (url) node.querySelector('img').src = url; });
  }
}

async function removePhoto(photo) {
  try {
    await db.deletePhotoRow(photo.id);
    await db.removeFiles([photo.path]);
    state.photos = state.photos.filter(p => p.id !== photo.id);
    renderPhotos();
  } catch (e) {
    toast(e.message);
  }
}

/* ============================== list ============================== */

async function renderList() {
  const box = $('entry-list');
  box.innerHTML = '';
  let rows = [];
  try {
    rows = await db.listEntries({ search: $('search').value });
  } catch (e) {
    return toast(e.message);
  }
  if (!rows.length) {
    box.innerHTML = `<p class="hint">${t('list.empty')}</p>`;
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
      tx.textContent = row.text;
      card.appendChild(tx);
    }

    const photos = (row.entry_photos ?? []).slice(0, 4);
    if (photos.length) {
      const strip = document.createElement('div');
      strip.className = 'thumbs';
      card.appendChild(strip);
      for (const ph of photos) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        strip.appendChild(img);
        db.fileUrl(ph.path).then(url => { if (url) img.src = url; });
      }
    }

    box.appendChild(card);
  }
}

/* ============================ settings ============================ */

function fillSettings() {
  const s = settings();
  $('set-openai').value = s.openaiKey;
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

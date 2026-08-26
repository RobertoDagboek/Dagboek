// The diary, as a screen inside the planner.
//
// Same features as before - voice note straight to text, topics, tags, photos,
// video, location - rebuilt out of the planner's parts so it looks native to it.

import { t, lang, formatDate } from './i18n.js';
import { TOPICS, topicLabel, sectionsToText } from './topics.js';
import { randomQuote } from './quotes.js';
import { settings, openAIKey } from './config.js';
import * as db from './supa.js';
import { Recorder } from './recorder.js';
import { transcribe } from './transcribe.js';
import { currentPosition, placeName, coordText, mapsLink } from './geo.js';
import { preparePhoto, localPreview } from './photos.js';
import {
  isVideo, readVideo, humanSize, clockTime,
  MAX_VIDEO_BYTES, PART_BYTES, partPaths, partCount, sliceParts, joinParts,
} from './video.js';
import {
  $, escapeHtml, uid, todayStr, addDays, fmtDateFull, fmtMonthDay,
  ICON_CHECK, ICON_TRASH, ICON_MIC, ICON_CHEVRON, toast, refresh,
} from './ui.js';

/* ===================== state ===================== */

const state = {
  session: null,
  date: todayStr(),
  entry: null,
  media: [],
  tags: [],
  sections: {},
  topic: TOPICS[0].id,
  loc: null,
  audio: null,
  recorder: null,
  search: '',
  filterTopic: '',
  filterTags: [],
};

let dirty = false;
let filling = false;
let quote = null;
let entryDates = new Set();   // every date that has an entry, for the month dots
let viewerUrl = null;

export function setDiarySession(session) { state.session = session; }
export function diaryDate() { return state.date; }
export function diarySubtitle() { return fmtDateFull(state.date); }

/** Dates with an entry, used by the calendar to mark days. */
export function diaryDatesInRange(from, to) {
  const out = new Set();
  for (const d of entryDates) if (d >= from && d <= to) out.add(d);
  return out;
}

export async function loadDiaryIndex() {
  try {
    const rows = await db.listEntries({ limit: 2000 });
    entryDates = new Set(rows.map(r => r.entry_date));
  } catch { entryDates = new Set(); }
}

/** Jump to a date, optionally seeding text into the current topic. */
export function openDiaryDate(dateStr, seedText) {
  state.date = dateStr;
  document.dispatchEvent(new CustomEvent('app:goto', { detail: { screen: 'diary', seed: seedText } }));
}

/* ===================== screen ===================== */

export function renderDiary(seedText) {
  const el = $('screenContent');
  if (!quote) quote = randomQuote();

  el.innerHTML = `
    <div class="quote-card" id="quoteCard">
      <p class="quote-text" id="quoteText">&ldquo;${escapeHtml(quote.t)}&rdquo;</p>
      <p class="quote-source" id="quoteSource">${escapeHtml(quote.s)}</p>
    </div>

    <div class="search-row">
      <span class="search-icon">${ICON_CHEVRON}</span>
      <input type="text" id="diarySearch" placeholder="${t('list.search')}" value="${escapeHtml(state.search)}">
      ${state.search ? `<button class="search-clear" id="diarySearchClear" type="button">&times;</button>` : ''}
    </div>

    <div id="diaryMain"></div>`;

  $('quoteCard').addEventListener('click', () => {
    quote = randomQuote(quote);
    $('quoteText').textContent = `“${quote.t}”`;
    $('quoteSource').textContent = quote.s;
  });

  const search = $('diarySearch');
  search.addEventListener('input', () => { state.search = search.value; renderDiaryMain(); });
  const clear = $('diarySearchClear');
  if (clear) clear.addEventListener('click', () => { state.search = ''; renderDiary(); });

  renderDiaryMain(seedText);
}

function renderDiaryMain(seedText) {
  if (state.search.trim()) return renderDiaryResults();
  renderEditor(seedText);
}

/* ===================== the day's entry ===================== */

async function renderEditor(seedText) {
  const box = $('diaryMain');
  box.innerHTML = `
    <div class="diary-datebar">
      <button class="week-nav-btn" id="dPrev" type="button">&lsaquo;</button>
      <input type="date" id="dDate" value="${state.date}">
      <button class="week-nav-btn" id="dNext" type="button">&rsaquo;</button>
    </div>

    <div class="chip-row topic-chips" id="topicChips"></div>

    <div class="recorder">
      <button class="record" id="recBtn" type="button" aria-label="${t('rec.idle')}"><span class="dot"></span></button>
      <div class="rec-meta"><div id="recLabel">${t('rec.idle')}</div><div class="timer" id="recTime">0:00</div></div>
      <div class="levels"><div class="level-fill" id="recLevel"></div></div>
    </div>

    <audio id="audioPlay" controls hidden></audio>
    <div class="chip-row" id="transcribeRow" hidden style="margin-bottom:12px;">
      <button class="chip" id="btnTranscribe" type="button">${ICON_MIC} ${t('rec.transcribe')}</button>
      <button class="link" id="btnDropAudio" type="button">${t('rec.discard')}</button>
    </div>
    <p class="status-line" id="transcribeStatus" style="text-align:left;margin:0 0 10px;"></p>

    <div id="sections"></div>

    <div class="block">
      <div class="block-head"><span>${t('entry.location')}</span>
        <button class="link" id="btnLocate" type="button">${t('entry.getLocation')}</button></div>
      <div class="chip-row" id="locView"></div>
    </div>

    <div class="block">
      <div class="block-head"><span>${t('entry.tags')}</span></div>
      <div class="chip-row" id="tagView"></div>
      <input type="text" class="tag-input" id="tagInput" list="tagOptions" autocapitalize="none"
             spellcheck="false" placeholder="${t('entry.tagPh')}">
      <datalist id="tagOptions"></datalist>
    </div>

    <div class="block">
      <div class="block-head"><span>${t('entry.media')}</span>
        <label class="link" for="photoInput">${t('entry.addPhotos')}</label>
        <label class="link" for="videoInput">${t('entry.addVideo')}</label>
        <input id="photoInput" type="file" accept="image/*" multiple hidden>
        <input id="videoInput" type="file" accept="video/*" multiple hidden>
      </div>
      <div class="photo-grid" id="photoGrid"></div>
    </div>

    <div class="sheet-actions">
      <button class="sheet-save" id="btnSave" type="button">${t('entry.save')}</button>
    </div>
    <p class="status-line" id="saveStatus"></p>
    <div style="text-align:center;"><button class="link danger" id="btnDelete" type="button" hidden>${t('entry.delete')}</button></div>`;

  buildSections();
  buildTopicChips();
  wireEditor();
  await loadDate(state.date);
  if (seedText) appendToTopic(state.topic, seedText);
}

function wireEditor() {
  $('dPrev').addEventListener('click', () => gotoDate(addDays(state.date, -1)));
  $('dNext').addEventListener('click', () => gotoDate(addDays(state.date, 1)));
  $('dDate').addEventListener('change', e => gotoDate(e.target.value));
  $('recBtn').addEventListener('click', toggleRecording);
  $('btnTranscribe').addEventListener('click', runTranscribe);
  $('btnDropAudio').addEventListener('click', () => { state.audio = null; renderAudio(); });
  $('btnLocate').addEventListener('click', grabLocation);
  $('btnSave').addEventListener('click', () => saveEntry(true));
  $('btnDelete').addEventListener('click', removeEntry);
  $('photoInput').addEventListener('change', e => { addMedia([...e.target.files]); e.target.value = ''; });
  $('videoInput').addEventListener('change', e => { addMedia([...e.target.files]); e.target.value = ''; });

  const tagInput = $('tagInput');
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault(); addTag(tagInput.value); tagInput.value = '';
    } else if (e.key === 'Backspace' && !tagInput.value && state.tags.length) {
      state.tags.pop(); renderTags();
    }
  });
  tagInput.addEventListener('blur', () => {
    if (tagInput.value.trim()) { addTag(tagInput.value); tagInput.value = ''; }
  });
}

async function gotoDate(date) {
  if (!date) return;
  state.date = date;
  $('dDate').value = date;
  await loadDate(date);
  document.dispatchEvent(new CustomEvent('app:subtitle'));
}

async function loadDate(date) {
  state.audio = null; state.loc = null; state.entry = null; state.media = []; state.tags = [];
  renderAudio();
  try {
    const row = await db.getEntry(date);
    state.entry = row;
    state.media = row?.entry_photos ?? [];
    state.tags = row?.tags ?? [];
    if (row?.lat != null && row?.lng != null) state.loc = { lat: row.lat, lng: row.lng, place: row.place };
  } catch (e) { toast(e.message); }

  const sections = { ...(state.entry?.sections ?? {}) };
  const legacy = state.entry?.text?.trim();
  if (legacy && !Object.keys(sections).length) sections.ander = legacy;
  fillSections(sections);
  $('btnDelete').hidden = !state.entry;
  renderLocation();
  renderTags();
  renderMedia();
  renderSavedAudio();
  refreshTagOptions();
}

/* ===================== topic sections ===================== */

function buildSections() {
  const wrap = $('sections');
  wrap.innerHTML = '';
  for (const topic of TOPICS) {
    const block = document.createElement('details');
    block.className = 'section';
    block.dataset.section = topic.id;

    const head = document.createElement('summary');
    head.className = 'section-label';
    const name = document.createElement('span');
    name.dataset.topicLabel = topic.id;
    name.textContent = topicLabel(topic.id, lang);
    head.appendChild(name);
    const preview = document.createElement('span');
    preview.className = 'section-preview';
    preview.id = `pre-${topic.id}`;
    head.appendChild(preview);
    block.appendChild(head);

    const body = document.createElement('div');
    body.className = 'section-body';
    const ta = document.createElement('textarea');
    ta.id = `sec-${topic.id}`;
    ta.rows = 3;
    ta.addEventListener('input', () => { dirty = true; autoGrow(ta); updatePreview(topic.id); });
    ta.addEventListener('focus', () => setTopic(topic.id));
    body.appendChild(ta);
    block.appendChild(body);

    block.addEventListener('toggle', () => {
      if (block.open && !filling) { setTopic(topic.id); autoGrow(ta); }
    });
    wrap.appendChild(block);
  }
}

function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight, 84)}px`; }
function updatePreview(id) {
  const el = $(`pre-${id}`);
  if (!el) return;
  const v = ($(`sec-${id}`)?.value || '').trim().replace(/\s+/g, ' ');
  el.textContent = v ? v.slice(0, 70) : '';
}
function readSections() {
  const out = {};
  for (const topic of TOPICS) {
    const v = $(`sec-${topic.id}`)?.value.trim() ?? '';
    if (v) out[topic.id] = v;
  }
  return out;
}
function fillSections(sections) {
  state.sections = sections || {};
  filling = true;
  let any = false;
  for (const topic of TOPICS) {
    const ta = $(`sec-${topic.id}`);
    if (!ta) continue;
    ta.value = state.sections[topic.id] || '';
    autoGrow(ta);
    updatePreview(topic.id);
    const written = Boolean(ta.value.trim());
    const block = document.querySelector(`.section[data-section="${topic.id}"]`);
    if (block) block.open = written;
    any = any || written;
  }
  if (!any) {
    const first = document.querySelector(`.section[data-section="${TOPICS[0].id}"]`);
    if (first) first.open = true;
  }
  filling = false;
  setTopic(TOPICS[0].id);
  dirty = false;
}
function appendToTopic(id, text) {
  const ta = $(`sec-${id}`);
  if (!ta) return;
  const block = document.querySelector(`.section[data-section="${id}"]`);
  if (block) block.open = true;
  ta.value = ta.value.trim() ? `${ta.value.trim()}\n\n${text}` : text;
  autoGrow(ta);
  updatePreview(id);
  dirty = true;
  ta.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function buildTopicChips() {
  const row = $('topicChips');
  row.innerHTML = '';
  for (const topic of TOPICS) {
    const chip = document.createElement('button');
    chip.className = 'chip topic-chip' + (topic.id === state.topic ? ' is-on' : '');
    chip.dataset.topic = topic.id;
    chip.type = 'button';
    chip.textContent = topicLabel(topic.id, lang);
    chip.addEventListener('click', () => setTopic(topic.id));
    row.appendChild(chip);
  }
}
function setTopic(id) {
  state.topic = id;
  document.querySelectorAll('.topic-chip').forEach(c => c.classList.toggle('is-on', c.dataset.topic === id));
  if (!state.recorder?.recording && $('recLabel')) {
    $('recLabel').textContent = t('rec.for', { topic: topicLabel(id, lang) });
  }
}

/* ===================== tags ===================== */

function cleanTag(raw) {
  return String(raw || '').trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 40);
}
function addTag(raw) {
  for (const part of String(raw).split(',')) {
    const tag = cleanTag(part);
    if (tag && !state.tags.includes(tag)) state.tags.push(tag);
  }
  dirty = true;
  renderTags();
}
function renderTags() {
  const box = $('tagView');
  if (!box) return;
  box.innerHTML = '';
  for (const tag of state.tags) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(`#${tag}`);
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.addEventListener('click', () => { state.tags = state.tags.filter(v => v !== tag); dirty = true; renderTags(); });
    chip.appendChild(x);
    box.appendChild(chip);
  }
}
async function refreshTagOptions() {
  try {
    const tags = await db.allTags();
    const list = $('tagOptions');
    if (!list) return;
    list.innerHTML = '';
    for (const { tag } of tags) {
      const opt = document.createElement('option');
      opt.value = tag;
      list.appendChild(opt);
    }
  } catch { /* autocomplete is a nicety */ }
}

/* ===================== saving ===================== */

async function ensureEntry() {
  if (state.entry?.id) return state.entry;
  const sections = readSections();
  state.entry = await db.upsertEntry({
    entry_date: state.date, sections, text: sectionsToText(sections, lang), tags: state.tags,
  });
  entryDates.add(state.date);
  $('btnDelete').hidden = false;
  return state.entry;
}

async function saveEntry(loud = false) {
  const btn = $('btnSave');
  if (btn) btn.disabled = true;
  const status = $('saveStatus');
  if (status) status.textContent = t('entry.saving');
  try {
    const sections = readSections();
    const patch = {
      entry_date: state.date,
      sections,
      text: sectionsToText(sections, lang),
      tags: state.tags,
      lat: state.loc?.lat ?? null,
      lng: state.loc?.lng ?? null,
      place: state.loc?.place ?? null,
    };
    if (state.entry?.id) patch.id = state.entry.id;

    if (state.audio) {
      const path = db.userPath(state.session.user.id, state.date, `stem-${Date.now()}.${state.audio.ext}`);
      await db.uploadFile(path, state.audio.blob, state.audio.blob.type || 'audio/webm');
      patch.audio_path = path;
      const old = state.entry?.audio_path;
      if (old && old !== path) await db.removeFiles([old]);
    }

    state.entry = await db.upsertEntry(patch);
    entryDates.add(state.date);
    state.audio = null;
    dirty = false;
    renderAudio();
    renderSavedAudio();
    if (status) status.textContent = t('entry.saved');
    if (loud) toast(t('entry.saved'));
    setTimeout(() => { if ($('saveStatus')) $('saveStatus').textContent = ''; }, 2500);
  } catch (e) {
    if (status) status.textContent = '';
    toast(e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function removeEntry() {
  if (!state.entry?.id) return;
  if (!confirm(t('entry.deleteConfirm'))) return;
  try {
    const paths = state.media.flatMap(m => [...partPaths(m.path, m.part_count || 1), m.poster_path]);
    if (state.entry.audio_path) paths.push(state.entry.audio_path);
    await db.removeFiles(paths);
    await db.deleteEntry(state.entry.id);
    entryDates.delete(state.date);
    await loadDate(state.date);
    toast(t('entry.saved'));
  } catch (e) { toast(e.message); }
}

/* ===================== recording ===================== */

async function toggleRecording() {
  const btn = $('recBtn');
  if (state.recorder?.recording) {
    const result = await state.recorder.stop();
    state.recorder = null;
    btn.classList.remove('is-rec');
    $('recLabel').textContent = t('rec.for', { topic: topicLabel(state.topic, lang) });
    $('recLevel').style.width = '0%';
    if (result?.blob?.size) {
      state.audio = result;
      renderAudio();
      if (openAIKey()) runTranscribe();
    }
    return;
  }
  state.recorder = new Recorder({
    onTick: label => { $('recTime').textContent = label; },
    onLevel: v => { $('recLevel').style.width = `${Math.round(v * 100)}%`; },
  });
  try {
    await state.recorder.start();
    btn.classList.add('is-rec');
    $('recLabel').textContent = t('rec.recording');
    $('recTime').textContent = '0:00';
  } catch {
    state.recorder = null;
    toast(t('rec.noMic'));
  }
}

function renderAudio() {
  const player = $('audioPlay');
  if (!player) return;
  if (state.audio) {
    player.src = URL.createObjectURL(state.audio.blob);
    player.hidden = false;
    $('transcribeRow').hidden = false;
  } else {
    $('transcribeRow').hidden = true;
    if ($('transcribeStatus')) $('transcribeStatus').textContent = '';
    renderSavedAudio();
  }
}
async function renderSavedAudio() {
  if (state.audio) return;
  const player = $('audioPlay');
  if (!player) return;
  const path = state.entry?.audio_path;
  if (!path) { player.hidden = true; player.removeAttribute('src'); return; }
  const url = await db.fileUrl(path);
  if (url) { player.src = url; player.hidden = false; }
}

async function runTranscribe() {
  if (!state.audio) return;
  if (!openAIKey()) return toast(t('rec.noKey'));
  const btn = $('btnTranscribe');
  btn.disabled = true;
  $('transcribeStatus').textContent = t('rec.working');
  try {
    const text = await transcribe(state.audio.blob, state.audio.ext);
    if (text) appendToTopic(state.topic, text);
    $('transcribeStatus').textContent = text ? t('rec.into', { topic: topicLabel(state.topic, lang) }) : '';
    await saveEntry();
  } catch (e) {
    $('transcribeStatus').textContent = e.code === 'NO_KEY' ? t('rec.noKey') : e.message;
  } finally {
    btn.disabled = false;
  }
}

/* ===================== location ===================== */

async function grabLocation() {
  const box = $('locView');
  box.innerHTML = `<span class="chip">${t('entry.locating')}</span>`;
  try {
    const pos = await currentPosition();
    state.loc = { lat: pos.lat, lng: pos.lng, place: await placeName(pos.lat, pos.lng) };
    dirty = true;
  } catch {
    state.loc = null;
    toast(t('entry.locFail'));
  }
  renderLocation();
}
function renderLocation() {
  const box = $('locView');
  if (!box) return;
  box.innerHTML = '';
  if (!state.loc) return;
  const { lat, lng, place } = state.loc;
  const chip = document.createElement('span');
  chip.className = 'chip';
  const link = document.createElement('a');
  link.href = mapsLink(lat, lng);
  link.target = '_blank';
  link.rel = 'noopener';
  link.style.color = 'var(--sys-blue)';
  link.style.textDecoration = 'none';
  link.textContent = place || coordText(lat, lng);
  chip.appendChild(link);
  const x = document.createElement('button');
  x.type = 'button';
  x.textContent = '×';
  x.addEventListener('click', () => { state.loc = null; dirty = true; renderLocation(); });
  chip.appendChild(x);
  box.appendChild(chip);
}

/* ===================== photos and video ===================== */

function stamp(ext) { return `${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`; }

async function addMedia(files) {
  if (!files.length) return;
  try { await ensureEntry(); } catch (e) { return toast(e.message); }

  for (const file of files) {
    if (isVideo(file) && file.size > MAX_VIDEO_BYTES) {
      toast(t('entry.wayTooBig', { size: humanSize(file.size) }));
      continue;
    }
    if (isVideo(file) && file.size > PART_BYTES) {
      toast(t('entry.bigVideo', { size: humanSize(file.size), n: partCount(file.size) }));
    }
    const preview = isVideo(file) ? '' : localPreview(file);
    const node = mediaNode({ preview, busy: true, video: isVideo(file) });
    $('photoGrid').appendChild(node);
    try {
      state.media.push(isVideo(file) ? await uploadVideo(file) : await uploadPhoto(file));
    } catch (e) {
      toast(e.message);
    } finally {
      if (preview) URL.revokeObjectURL(preview);
      node.remove();
    }
  }
  renderMedia();
}

async function uploadPhoto(file) {
  const prep = await preparePhoto(file);
  const path = db.userPath(state.session.user.id, state.date, `foto-${stamp('jpg')}`);
  await db.uploadFile(path, prep.blob, 'image/jpeg');
  const row = await db.addPhotoRow({
    entry_id: state.entry.id, path, kind: 'photo',
    width: prep.width, height: prep.height, bytes: prep.blob.size,
    taken_at: prep.takenAt, lat: prep.lat, lng: prep.lng, sort: state.media.length,
  });
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
  const type = file.type || 'video/mp4';

  const parts = sliceParts(file);
  const paths = partPaths(path, parts.length);
  for (let i = 0; i < parts.length; i++) {
    if (parts.length > 1) toast(t('entry.uploading', { i: i + 1, n: parts.length }));
    await db.uploadFile(paths[i], parts[i], type);
  }

  let posterPath = null;
  if (meta.poster) {
    posterPath = db.userPath(state.session.user.id, state.date, `plakkaat-${stamp('jpg')}`);
    await db.uploadFile(posterPath, meta.poster, 'image/jpeg');
  } else {
    toast(t('entry.noPoster'));
  }

  return db.addPhotoRow({
    entry_id: state.entry.id, path, kind: 'video',
    width: meta.width || null, height: meta.height || null, duration: meta.duration || null,
    poster_path: posterPath, bytes: file.size, part_count: parts.length, mime: type,
    sort: state.media.length,
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
  if (onOpen) { div.classList.add('is-open'); img.addEventListener('click', onOpen); }
  if (onRemove) {
    const x = document.createElement('button');
    x.className = 'x';
    x.type = 'button';
    x.textContent = '×';
    x.addEventListener('click', onRemove);
    div.appendChild(x);
  }
  return div;
}

function renderMedia() {
  const grid = $('photoGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const m of state.media) {
    const isVid = m.kind === 'video';
    const node = mediaNode({
      preview: '', video: isVid, duration: m.duration,
      onRemove: () => removeMedia(m),
      onOpen: () => openViewer(m),
    });
    grid.appendChild(node);
    const thumb = isVid ? m.poster_path : m.path;
    if (thumb) db.fileUrl(thumb).then(url => { if (url) node.querySelector('img').src = url; });
  }
}

async function removeMedia(m) {
  try {
    await db.deletePhotoRow(m.id);
    await db.removeFiles([...partPaths(m.path, m.part_count || 1), m.poster_path]);
    state.media = state.media.filter(x => x.id !== m.id);
    renderMedia();
  } catch (e) { toast(e.message); }
}

/* ===================== viewer ===================== */

export async function openViewer(m) {
  const body = $('viewer-body');
  body.innerHTML = '';
  $('viewer').hidden = false;

  if (m.kind !== 'video') {
    const url = await db.fileUrl(m.path);
    if (!url) return closeViewer();
    const img = document.createElement('img');
    img.src = url;
    body.appendChild(img);
    return;
  }

  const v = document.createElement('video');
  v.controls = true;
  v.playsInline = true;
  if (m.poster_path) db.fileUrl(m.poster_path).then(p => { if (p) v.poster = p; });
  body.appendChild(v);

  const parts = m.part_count || 1;
  if (parts === 1) {
    const url = await db.fileUrl(m.path);
    if (!url) return closeViewer();
    v.src = url;
    v.autoplay = true;
    return;
  }

  const note = document.createElement('p');
  note.className = 'viewer-note';
  note.textContent = t('entry.joining', { i: 0, n: parts });
  body.appendChild(note);
  try {
    const urls = [];
    for (const p of partPaths(m.path, parts)) urls.push(await db.fileUrl(p));
    if (urls.some(u => !u)) throw new Error('missing part');
    const blob = await joinParts(urls, m.mime || 'video/mp4', (i, n) => {
      note.textContent = t('entry.joining', { i, n });
    });
    viewerUrl = URL.createObjectURL(blob);
    v.src = viewerUrl;
    note.remove();
    v.play().catch(() => {});
  } catch (e) {
    note.textContent = e.message;
  }
}

export function closeViewer() {
  const body = $('viewer-body');
  body.querySelector('video')?.pause();
  body.innerHTML = '';
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; }
  $('viewer').hidden = true;
}

/* ===================== search across entries ===================== */

async function renderDiaryResults() {
  const box = $('diaryMain');
  const words = db.searchWords(state.search);

  box.innerHTML = `
    <div class="filters">
      <select id="fTopic">
        <option value="">${t('topic.all')}</option>
        ${TOPICS.map(x => `<option value="${x.id}" ${state.filterTopic === x.id ? 'selected' : ''}>${escapeHtml(topicLabel(x.id, lang))}</option>`).join('')}
      </select>
    </div>
    <div class="chip-row tag-cloud" id="tagCloud"></div>
    <div class="group" id="resultList"><div class="empty-note">${t('pin.working')}</div></div>`;

  $('fTopic').addEventListener('change', e => { state.filterTopic = e.target.value; renderDiaryResults(); });
  renderTagCloud();

  let rows = [];
  try {
    rows = await db.listEntries({ search: state.search, tags: state.filterTags, topic: state.filterTopic });
  } catch (e) { return toast(e.message); }

  const list = $('resultList');
  if (!list) return;
  if (!rows.length) { list.innerHTML = `<div class="empty-note">${t('list.nothing')}</div>`; return; }

  list.innerHTML = '';
  for (const row of rows) {
    const card = document.createElement('div');
    card.className = 'row';
    const preview = state.filterTopic ? (row.sections?.[state.filterTopic] || '') : (row.text || '');

    const bodyEl = document.createElement('div');
    bodyEl.className = 'row-body';
    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = formatDate(row.entry_date);
    bodyEl.appendChild(title);

    if (row.place) {
      const p = document.createElement('div');
      p.className = 'row-meta';
      p.textContent = `\u{1F4CD} ${row.place}`;
      bodyEl.appendChild(p);
    }
    if (preview) {
      const tx = document.createElement('div');
      tx.className = 'row-notes';
      tx.style.whiteSpace = 'normal';
      fillHighlighted(tx, snippet(preview, words), words);
      bodyEl.appendChild(tx);
    }
    if (row.tags?.length) {
      const tagRow = document.createElement('div');
      tagRow.className = 'card-tags';
      for (const tag of row.tags) {
        const el2 = document.createElement('span');
        el2.className = 'mini-tag';
        el2.textContent = `#${tag}`;
        tagRow.appendChild(el2);
      }
      bodyEl.appendChild(tagRow);
    }
    bodyEl.addEventListener('click', () => {
      state.search = '';
      state.date = row.entry_date;
      renderDiary();
      document.dispatchEvent(new CustomEvent('app:subtitle'));
    });

    card.appendChild(bodyEl);
    const chev = document.createElement('span');
    chev.className = 'row-trail';
    chev.innerHTML = ICON_CHEVRON;
    card.appendChild(chev);
    list.appendChild(card);
  }
}

async function renderTagCloud() {
  const cloud = $('tagCloud');
  if (!cloud) return;
  let tags = [];
  try { tags = await db.allTags(); } catch { return; }
  cloud.innerHTML = '';
  for (const { tag, n } of tags) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip tag-chip' + (state.filterTags.includes(tag) ? ' is-on' : '');
    btn.textContent = `#${tag} ${n}`;
    btn.addEventListener('click', () => {
      state.filterTags = state.filterTags.includes(tag)
        ? state.filterTags.filter(x => x !== tag)
        : [...state.filterTags, tag];
      renderDiaryResults();
    });
    cloud.appendChild(btn);
  }
}

function snippet(text, words, radius = 90) {
  if (!words.length || text.length <= radius * 2) return text;
  const hay = text.toLowerCase();
  let at = -1;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at <= radius) return text;
  return `…${text.slice(Math.max(0, at - radius), Math.max(0, at - radius) + radius * 3)}`;
}
function fillHighlighted(el, text, words) {
  el.textContent = '';
  if (!words.length) { el.textContent = text; return; }
  const re = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
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

export function diaryIsDirty() { return dirty || Boolean(state.audio); }

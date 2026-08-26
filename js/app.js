// Boot, the PIN lock, and the tab router.
//
// boot() is called from the last line of this file on purpose: module-level
// `let`s further down sit in the temporal dead zone until their own line runs,
// so starting from the top would crash the moment boot touched one.

import {
  settings, saveSettings, hasProject,
  getLock, setLock, hasLock, clearLock,
  failedTries, bumpFailedTries, resetFailedTries, MAX_PIN_TRIES,
  getSecretBox, setSecretBox,
  setOpenAIKey, openAIKey, takeLegacyPlainKey,
} from './core/config.js';
import {
  deriveCredentials, slugUser, newSlug, makeCheck, verifyCheck,
  encryptWith, decryptWith, cryptoAvailable,
} from './core/crypto.js';
import * as db from './core/supa.js';
import { loadItems } from './planner/tasks.js';
import {
  $, ICON_PLUS, ICON_TODAY, ICON_WEEK, ICON_GOALS, ICON_INBOX, ICON_DIARY,
  todayStr, fmtDateFull, Spring, runSpring,
  sheetEl, openSheet, closeSheet, toast,
} from './core/ui.js';
import {
  renderToday, renderWeek, renderGoals, renderInbox,
  openCaptureSheet, inboxCount, goalsSoonCount, monthCursorLabel,
} from './planner/planner.js';
import {
  renderDiary, setDiarySession, loadDiaryIndex, diarySubtitle, closeViewer,
} from './diary/diary.js';

/* ===================== state ===================== */

let screen = 'today';
let session = null;
let cryptoKey = null;
let pin = { mode: 'unlock', buffer: '', first: '', newUser: '', busy: false };
let today = todayStr();

const PIN_MIN = 4;
const PIN_MAX = 8;

const TABS = [
  { id: 'today', icon: ICON_TODAY, label: 'Today' },
  { id: 'week', icon: ICON_WEEK, label: 'Calendar' },
  { id: 'diary', icon: ICON_DIARY, label: 'Diary' },
  { id: 'goals', icon: ICON_GOALS, label: 'Goals' },
  { id: 'inbox', icon: ICON_INBOX, label: 'Inbox' },
];

/* ===================== boot ===================== */

async function boot() {
  wireChrome();

  if (!hasProject()) {
    $('pin-msg').textContent = 'Supabase is not configured.';
    return;
  }
  try { session = await db.getSession(); } catch { session = null; }
  db.onAuthChange(s => { session = s; setDiarySession(s); });

  askForPin();
  registerSW();
}

function showLock() {
  $('screen-lock').hidden = false;
  $('app-shell').hidden = true;
  document.body.classList.add('no-tabs');
}
function showApp() {
  $('screen-lock').hidden = true;
  $('app-shell').hidden = false;
  document.body.classList.remove('no-tabs');
}

/** Signed in and unlocked. */
async function enterApp() {
  showApp();
  setDiarySession(session);
  try {
    await loadItems();
    await loadDiaryIndex();
  } catch (e) {
    toast(e.message);
  }
  renderAll();

  db.myHandle().then(h => {
    if (h?.username && h.username !== settings().username) {
      saveSettings({ username: h.username });
      const lock = getLock();
      if (lock) setLock({ ...lock, user: h.username });
    }
    if (h?.slug && h.slug !== settings().slug) saveSettings({ slug: h.slug });
  }).catch(() => {});
}

/* ===================== chrome ===================== */

function wireChrome() {
  $('fabAdd').innerHTML = ICON_PLUS;
  $('fabAdd').addEventListener('click', () => openCaptureSheet(screen === 'diary' ? 'diary' : null));
  $('gearBtn').addEventListener('click', openSettings);

  $('viewer-close').addEventListener('click', closeViewer);
  $('viewer').addEventListener('click', e => { if (e.target === $('viewer')) closeViewer(); });
  $('scrim').addEventListener('click', closeSheet);

  document.addEventListener('app:refresh', renderAll);
  document.addEventListener('app:subtitle', renderHeader);
  document.addEventListener('app:goto', e => {
    const { screen: target, seed } = e.detail || {};
    if (target) switchScreen(target, seed);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('viewer').hidden) closeViewer();
    if ($('screen-lock').hidden) return;
    if (document.activeElement === $('pin-user') && e.key !== 'Enter') return;
    if (/^\d$/.test(e.key)) pinPress(e.key);
    else if (e.key === 'Backspace') pinPress('del');
    else if (e.key === 'Enter') pinPress('ok');
  });

  document.querySelectorAll('.keypad .key').forEach(btn => {
    btn.addEventListener('click', () => pinPress(btn.dataset.k));
  });
  $('pin-newuser').addEventListener('click', () => startLogin({ mode: 'create' }));
  $('pin-switch').addEventListener('click', async () => {
    clearLock();
    saveSettings({ username: '', slug: '' });
    await db.signOut();
    startLogin({ mode: 'signin' });
  });

  wirePressFeedback();

  setInterval(() => {
    const now = todayStr();
    if (now !== today) { today = now; renderAll(); }
  }, 60000);
}

/** The planner's press effect: rows dip slightly on pointer-down. */
function wirePressFeedback() {
  document.addEventListener('pointerdown', e => {
    const row = e.target.closest('.row, .ongoing-row, .goal-card, .month-cell');
    if (!row || row.style.transform.includes('translateX')) return;
    const down = new Spring(1, { dampingRatio: 1, response: 0.15 });
    down.set(0.985);
    runSpring(down, v => { if (!row.style.transform.includes('translateX')) row.style.transform = `scale(${v})`; });
    const up = () => {
      const back = new Spring(0.985, { dampingRatio: 0.8, response: 0.22 });
      back.set(1);
      runSpring(back,
        v => { if (!row.style.transform.includes('translateX')) row.style.transform = `scale(${v})`; },
        () => { if (!row.style.transform.includes('translateX')) row.style.transform = ''; });
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function switchScreen(name, seed) {
  screen = name;
  window.scrollTo(0, 0);
  renderAll(seed);
}

function renderTabBar() {
  const el = $('tabbar');
  const inbox = inboxCount();
  const goals = goalsSoonCount();
  el.innerHTML = TABS.map(tab => {
    let badge = '';
    if (tab.id === 'inbox' && inbox) badge = `<span class="tab-badge">${inbox > 99 ? '99+' : inbox}</span>`;
    if (tab.id === 'goals' && goals) badge = `<span class="tab-badge">${goals}</span>`;
    return `<button class="tab-btn ${screen === tab.id ? 'active' : ''}" data-tab="${tab.id}" type="button">
      ${tab.icon}${badge}<span class="tlabel">${tab.label}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('[data-tab]').forEach(b =>
    b.addEventListener('click', e => switchScreen(e.currentTarget.getAttribute('data-tab'))));
}

function renderHeader() {
  const title = $('navTitle');
  const sub = $('navSub');
  if (screen === 'today') { title.textContent = 'Today'; sub.textContent = fmtDateFull(today); }
  else if (screen === 'week') { title.textContent = 'Calendar'; sub.textContent = monthCursorLabel(); }
  else if (screen === 'diary') { title.textContent = 'Diary'; sub.textContent = diarySubtitle(); }
  else if (screen === 'goals') { title.textContent = 'Goals'; sub.textContent = 'Things with a deadline'; }
  else if (screen === 'inbox') { title.textContent = 'Inbox'; sub.textContent = 'Not scheduled yet'; }
}

function renderAll(seed) {
  renderHeader();
  renderTabBar();
  if (screen === 'today') renderToday();
  else if (screen === 'week') renderWeek();
  else if (screen === 'diary') renderDiary(typeof seed === 'string' ? seed : undefined);
  else if (screen === 'goals') renderGoals();
  else if (screen === 'inbox') renderInbox();
}

/* ===================== PIN lock ===================== */

function accountSlug() {
  const s = settings();
  return s.slug || s.username;
}

function askForPin() {
  showLock();
  if (!cryptoAvailable()) {
    $('pin-msg').textContent = 'This browser cannot store a PIN safely. Use https.';
    return;
  }
  const known = hasLock() && settings().username && session;
  startLogin({ mode: known ? 'unlock' : 'signin' });
}

function startLogin({ mode, newUser = '' }) {
  pin = { mode, buffer: '', first: '', newUser, busy: false };
  showLock();
  $('pin-msg').textContent = '';
  $('pin-user').value = mode === 'unlock' ? '' : settings().username;
  renderPin();
}

function renderPin() {
  const { mode, buffer } = pin;
  const unlocking = mode === 'unlock';
  const changing = mode === 'change' || mode === 'changeConfirm';

  $('pin-user-row').hidden = unlocking || changing;
  $('pin-newuser').hidden = mode === 'create' || changing;
  $('pin-switch').hidden = !unlocking;

  $('pin-greet').textContent = unlocking
    ? `Welcome back, ${settings().username}`
    : mode === 'create' ? 'Pick a name and a PIN. That is all.'
    : mode === 'signin' && !settings().username ? 'First time? Press “New account” below.'
    : '';

  $('pin-prompt').textContent = {
    unlock: 'Enter your PIN',
    signin: 'Enter your name and PIN',
    create: 'Choose a PIN',
    confirm: 'Enter the PIN again',
    change: 'Choose a PIN',
    changeConfirm: 'Enter the PIN again',
  }[mode];

  const dots = $('pin-dots');
  dots.innerHTML = '';
  for (let i = 0; i < PIN_MAX; i++) {
    const dot = document.createElement('span');
    dot.className = 'pin-dot' + (i < buffer.length ? ' is-on' : '') + (i < PIN_MIN ? '' : ' is-extra');
    dots.appendChild(dot);
  }
}

function pinPress(k) {
  if (pin.busy) return;
  if (k === 'del') { pin.buffer = pin.buffer.slice(0, -1); return renderPin(); }
  if (k === 'ok') return pinSubmit();
  if (pin.buffer.length >= PIN_MAX) return;
  pin.buffer += k;
  renderPin();
  if (pin.mode === 'unlock' && pin.buffer.length === PIN_MAX) pinSubmit();
}

async function pinSubmit() {
  const value = pin.buffer;
  if (value.length < PIN_MIN) { $('pin-msg').textContent = 'At least 4 digits — 6 is safer.'; return; }

  if (pin.mode === 'create') {
    const name = slugUser($('pin-user').value);
    if (!name) { $('pin-msg').textContent = 'Enter a username.'; return; }
    pin.newUser = name; pin.first = value; pin.buffer = ''; pin.mode = 'confirm';
    $('pin-msg').textContent = '';
    return renderPin();
  }
  if (pin.mode === 'confirm') {
    if (value !== pin.first) {
      pin.mode = 'create'; pin.first = ''; pin.buffer = '';
      $('pin-msg').textContent = 'The two PINs do not match. Start again.';
      return renderPin();
    }
    return finishLogin(pin.newUser, value, { creating: true });
  }
  if (pin.mode === 'signin') {
    const name = slugUser($('pin-user').value);
    if (!name) { $('pin-msg').textContent = 'Enter a username.'; return; }
    return finishLogin(name, value, { creating: false });
  }
  if (pin.mode === 'change') {
    pin.first = value; pin.buffer = ''; pin.mode = 'changeConfirm';
    $('pin-msg').textContent = '';
    return renderPin();
  }
  if (pin.mode === 'changeConfirm') {
    if (value !== pin.first) {
      pin.mode = 'change'; pin.first = ''; pin.buffer = '';
      $('pin-msg').textContent = 'The two PINs do not match. Start again.';
      return renderPin();
    }
    pin.busy = true;
    $('pin-msg').textContent = 'Working…';
    try {
      const username = settings().username;
      const { password, localKey } = await deriveCredentials(accountSlug(), value);
      await db.updatePassword(password);
      const apiKey = openAIKey();
      setLock({ v: 2, user: username, check: await makeCheck(localKey) });
      setSecretBox(apiKey ? await encryptWith(localKey, apiKey) : null);
      cryptoKey = localKey;
      resetFailedTries();
      pin.busy = false;
      await enterApp();
      toast('PIN saved');
    } catch (e) {
      pin.busy = false; pin.buffer = '';
      $('pin-msg').textContent = e.message;
      renderPin();
    }
    return;
  }

  // unlock: offline check against the stored token
  pin.busy = true;
  $('pin-msg').textContent = 'Working…';
  try {
    const { localKey } = await deriveCredentials(accountSlug(), value);
    await verifyCheck(localKey, getLock().check);
    cryptoKey = localKey;
    resetFailedTries();
    const box = getSecretBox();
    setOpenAIKey(box ? await decryptWith(localKey, box) : '');
    pin.busy = false;
    await enterApp();
  } catch {
    pin.busy = false;
    pin.buffer = '';
    const left = MAX_PIN_TRIES - bumpFailedTries();
    if (left <= 0) {
      clearLock();
      saveSettings({ username: '', slug: '' });
      await db.signOut();
      $('pin-msg').textContent = 'Too many wrong tries. Start again.';
      return setTimeout(() => location.reload(), 2500);
    }
    $('pin-msg').textContent = `Wrong name or PIN. ${left} tries left.`;
    renderPin();
  }
}

async function finishLogin(username, value, { creating }) {
  pin.busy = true;
  $('pin-msg').textContent = creating ? 'Creating your account…' : 'Working…';
  try {
    let slug;
    let legacy = false;

    if (creating) {
      if (await db.slugFor(username)) throw new Error('USERNAME_TAKEN');
      slug = newSlug();
    } else {
      slug = await db.slugFor(username);
      if (!slug) { slug = username; legacy = true; }
    }

    const { email, password, localKey } = await deriveCredentials(slug, value);

    if (creating) {
      const { needsConfirm } = await db.signUpWithPassword(email, password);
      if (needsConfirm) await db.signInWithPassword(email, password);
    } else {
      await db.signInWithPassword(email, password);
    }

    session = await db.getSession();
    cryptoKey = localKey;

    if (creating || legacy) {
      try { await db.claimHandle(username, slug); } catch { /* not fatal */ }
    }

    saveSettings({ username, slug });
    setLock({ v: 2, user: username, check: await makeCheck(localKey) });
    resetFailedTries();

    const existing = openAIKey() || takeLegacyPlainKey();
    const box = getSecretBox();
    let apiKey = existing;
    if (!apiKey && box) { try { apiKey = await decryptWith(localKey, box); } catch { apiKey = ''; } }
    setSecretBox(apiKey ? await encryptWith(localKey, apiKey) : null);
    setOpenAIKey(apiKey);

    pin.busy = false;
    await enterApp();
  } catch (e) {
    pin.busy = false;
    pin.buffer = '';
    $('pin-msg').textContent = loginError(e, creating);
    renderPin();
  }
}

function loginError(e, creating) {
  const msg = String(e?.message || e);
  if (/USERNAME_TAKEN|already|exists|registered/i.test(msg)) return 'That name is already taken. Pick another.';
  if (/[Ss]ignups? not allowed|signup_disabled/i.test(msg)) return 'New accounts are disabled in Supabase.';
  if (/Invalid login credentials/i.test(msg)) return 'No account with that name and PIN. Press “New account” below.';
  return creating ? msg : `${'Wrong name or PIN.'} (${msg})`;
}

/* ===================== settings ===================== */

function openSettings() {
  const s = settings();
  sheetEl().innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${'Settings'}</div>

    <div class="field-group">
      <div class="field-row"><span class="fname">${'Username'}</span>
        <input type="text" id="setUsername" value="${s.username}" autocapitalize="none" spellcheck="false"></div>
      <div class="field-row"><span class="fname">${'Change name'}</span>
        <button class="link" id="btnRename" type="button">${'Save'}</button></div>
    </div>
    <p class="sheet-hint">${'Your name is just a label — change it freely. Your login, your PIN and your data stay exactly as they are.'}</p>

    <div class="field-group" style="margin-top:14px;">
      <div class="field-row"><span class="fname">${'OpenAI key'}</span>
        <input type="password" id="setOpenai" value="${openAIKey()}" placeholder="sk-..." autocomplete="off" spellcheck="false"></div>
      <div class="field-row"><span class="fname">${'Speech model'}</span>
        <select id="setModel">
          <option value="gpt-4o-transcribe" ${s.model === 'gpt-4o-transcribe' ? 'selected' : ''}>gpt-4o-transcribe</option>
          <option value="gpt-4o-mini-transcribe" ${s.model === 'gpt-4o-mini-transcribe' ? 'selected' : ''}>gpt-4o-mini-transcribe</option>
          <option value="whisper-1" ${s.model === 'whisper-1' ? 'selected' : ''}>whisper-1</option>
        </select></div>
      <div class="field-row"><span class="fname">${'Voice note language'}</span>
        <select id="setSttLang">
          <option value="" ${!s.sttLang ? 'selected' : ''}>${'Auto (AF + EN)'}</option>
          <option value="af" ${s.sttLang === 'af' ? 'selected' : ''}>Afrikaans</option>
          <option value="en" ${s.sttLang === 'en' ? 'selected' : ''}>English</option>
        </select></div>
    </div>
    <p class="sheet-hint">${'Encrypted with your PIN and kept in this browser only — never on GitHub or Supabase.'}</p>

    <div class="fname" style="margin:14px 2px 6px;">${'Word list'}</div>
    <textarea id="setVocab" class="sheet-notes" placeholder="Riebeeck-Kasteel, oupa Hennie, bakkie">${s.vocab}</textarea>
    <p class="sheet-hint">${'Names of people, places and words you use often, comma separated. This helps a lot with accents and proper nouns.'}</p>

    <div class="sheet-move-row" style="margin-top:16px;">
      <button class="sheet-move-btn" id="btnChangePin" type="button">${'Change PIN'}</button>
      <button class="sheet-move-btn" id="btnExport" type="button">${'Download everything'}</button>
      <button class="sheet-move-btn" id="btnSignout" type="button" style="color:var(--sys-red);">${'Sign out'}</button>
    </div>
    <p class="sheet-hint" id="setStatus"></p>

    <div class="sheet-actions">
      <button class="sheet-cancel" id="setCancel" type="button">${'Cancel'}</button>
      <button class="sheet-save" id="setSave" type="button">${'Save'}</button>
    </div>`;

  $('setCancel').addEventListener('click', closeSheet);
  $('setSave').addEventListener('click', async () => {
    saveSettings({
      model: $('setModel').value,
      sttLang: $('setSttLang').value,
      vocab: $('setVocab').value.trim(),
    });
    const key = $('setOpenai').value.trim();
    try {
      if (cryptoKey) setSecretBox(key ? await encryptWith(cryptoKey, key) : null);
      setOpenAIKey(key);
      toast('Saved');
      closeSheet();
    } catch (e) { toast(e.message); }
  });
  $('btnRename').addEventListener('click', renameAccount);
  $('btnChangePin').addEventListener('click', () => { closeSheet(); startLogin({ mode: 'change' }); });
  $('btnExport').addEventListener('click', exportAll);
  $('btnSignout').addEventListener('click', async () => { await db.signOut(); location.reload(); });

  openSheet();
}

async function renameAccount() {
  const wanted = slugUser($('setUsername').value);
  const status = $('setStatus');
  if (!wanted) { status.textContent = 'Enter a username.'; return; }
  if (wanted === settings().username) { status.textContent = 'That is already your name.'; return; }
  status.textContent = 'Working…';
  try {
    if (await db.slugFor(wanted)) { status.textContent = 'That name is already taken.'; return; }
    await db.renameHandle(session.user.id, wanted);
    saveSettings({ username: wanted });
    const lock = getLock();
    if (lock) setLock({ ...lock, user: wanted });
    status.textContent = '';
    toast(`Name changed to ${wanted}`);
  } catch (e) {
    const msg = String(e?.message || e);
    status.textContent = /duplicate|unique/i.test(msg) ? 'That name is already taken.'
      : /relation|does not exist|schema cache/i.test(msg) ? 'Run migration 004 in the Supabase SQL editor first.'
      : `Could not change the name. (${msg})`;
  }
}

async function exportAll() {
  try {
    const entries = await db.listEntries({ limit: 5000 });
    const { items } = await import('./planner/tasks.js');
    const blob = new Blob([JSON.stringify({ entries, planner: items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dagboek-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message); }
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* ===================== start ===================== */
// Last line on purpose - see the note at boot().

boot();

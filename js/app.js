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
} from './config.js';
import { t, lang, applyI18n, toggleLang, formatDate } from './i18n.js';
import {
  deriveCredentials, slugUser, newSlug, makeCheck, verifyCheck,
  encryptWith, decryptWith, cryptoAvailable,
} from './crypto.js';
import * as db from './supa.js';
import { loadItems } from './tasks.js';
import {
  $, ICON_PLUS, ICON_TODAY, ICON_WEEK, ICON_GOALS, ICON_INBOX, ICON_DIARY,
  todayStr, fmtDateFull, Spring, runSpring,
  sheetEl, openSheet, closeSheet, toast,
} from './ui.js';
import {
  renderToday, renderWeek, renderGoals, renderInbox,
  openCaptureSheet, inboxCount, goalsSoonCount, monthCursorLabel,
} from './planner.js';
import {
  renderDiary, setDiarySession, loadDiaryIndex, diarySubtitle, closeViewer,
} from './diary.js';

/* ===================== state ===================== */

let screen = 'today';
let session = null;
let cryptoKey = null;
let pin = { mode: 'unlock', buffer: '', first: '', newUser: '', busy: false };
let today = todayStr();

const PIN_MIN = 4;
const PIN_MAX = 8;

const TABS = [
  { id: 'today', icon: ICON_TODAY, key: 'tab.today' },
  { id: 'week', icon: ICON_WEEK, key: 'tab.calendar' },
  { id: 'diary', icon: ICON_DIARY, key: 'tab.diary' },
  { id: 'goals', icon: ICON_GOALS, key: 'tab.goals' },
  { id: 'inbox', icon: ICON_INBOX, key: 'tab.inbox' },
];

/* ===================== boot ===================== */

async function boot() {
  applyI18n();
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
  $('langBtn').addEventListener('click', () => {
    toggleLang();
    applyI18n();
    $('langBtn').textContent = lang.toUpperCase();
    renderAll();
  });
  $('langBtn').textContent = lang.toUpperCase();

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
      ${tab.icon}${badge}<span class="tlabel">${t(tab.key)}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('[data-tab]').forEach(b =>
    b.addEventListener('click', e => switchScreen(e.currentTarget.getAttribute('data-tab'))));
}

function renderHeader() {
  const title = $('navTitle');
  const sub = $('navSub');
  if (screen === 'today') { title.textContent = t('tab.today'); sub.textContent = fmtDateFull(today); }
  else if (screen === 'week') { title.textContent = t('tab.calendar'); sub.textContent = monthCursorLabel(); }
  else if (screen === 'diary') { title.textContent = t('tab.diary'); sub.textContent = diarySubtitle(); }
  else if (screen === 'goals') { title.textContent = t('tab.goals'); sub.textContent = t('sub.goals'); }
  else if (screen === 'inbox') { title.textContent = t('tab.inbox'); sub.textContent = t('sub.inbox'); }
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
    $('pin-msg').textContent = t('pin.noCrypto');
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
    ? t('pin.greet', { name: settings().username })
    : mode === 'create' ? t('pin.greetNew')
    : mode === 'signin' && !settings().username ? t('pin.firstTime')
    : '';

  $('pin-prompt').textContent = t({
    unlock: 'pin.enter', signin: 'pin.signin', create: 'pin.create',
    confirm: 'pin.confirm', change: 'pin.create', changeConfirm: 'pin.confirm',
  }[mode]);

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
  if (value.length < PIN_MIN) { $('pin-msg').textContent = t('pin.tooShort'); return; }

  if (pin.mode === 'create') {
    const name = slugUser($('pin-user').value);
    if (!name) { $('pin-msg').textContent = t('pin.needName'); return; }
    pin.newUser = name; pin.first = value; pin.buffer = ''; pin.mode = 'confirm';
    $('pin-msg').textContent = '';
    return renderPin();
  }
  if (pin.mode === 'confirm') {
    if (value !== pin.first) {
      pin.mode = 'create'; pin.first = ''; pin.buffer = '';
      $('pin-msg').textContent = t('pin.mismatch');
      return renderPin();
    }
    return finishLogin(pin.newUser, value, { creating: true });
  }
  if (pin.mode === 'signin') {
    const name = slugUser($('pin-user').value);
    if (!name) { $('pin-msg').textContent = t('pin.needName'); return; }
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
      $('pin-msg').textContent = t('pin.mismatch');
      return renderPin();
    }
    pin.busy = true;
    $('pin-msg').textContent = t('pin.working');
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
      toast(t('pin.set'));
    } catch (e) {
      pin.busy = false; pin.buffer = '';
      $('pin-msg').textContent = e.message;
      renderPin();
    }
    return;
  }

  // unlock: offline check against the stored token
  pin.busy = true;
  $('pin-msg').textContent = t('pin.working');
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
      $('pin-msg').textContent = t('pin.locked');
      return setTimeout(() => location.reload(), 2500);
    }
    $('pin-msg').textContent = t('pin.wrong', { n: left });
    renderPin();
  }
}

async function finishLogin(username, value, { creating }) {
  pin.busy = true;
  $('pin-msg').textContent = t(creating ? 'pin.signup' : 'pin.working');
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
  if (/USERNAME_TAKEN|already|exists|registered/i.test(msg)) return t('pin.taken');
  if (/[Ss]ignups? not allowed|signup_disabled/i.test(msg)) return t('pin.signupOff');
  if (/Invalid login credentials/i.test(msg)) return t('pin.noAccount');
  return creating ? msg : `${t('pin.wrongNet')} (${msg})`;
}

/* ===================== settings ===================== */

function openSettings() {
  const s = settings();
  sheetEl().innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${t('set.title')}</div>

    <div class="field-group">
      <div class="field-row"><span class="fname">${t('set.username')}</span>
        <input type="text" id="setUsername" value="${s.username}" autocapitalize="none" spellcheck="false"></div>
      <div class="field-row"><span class="fname">${t('set.rename')}</span>
        <button class="link" id="btnRename" type="button">${t('btn.save')}</button></div>
    </div>
    <p class="sheet-hint">${t('set.usernameHint')}</p>

    <div class="field-group" style="margin-top:14px;">
      <div class="field-row"><span class="fname">${t('set.apikey')}</span>
        <input type="password" id="setOpenai" value="${openAIKey()}" placeholder="sk-..." autocomplete="off" spellcheck="false"></div>
      <div class="field-row"><span class="fname">${t('set.model')}</span>
        <select id="setModel">
          <option value="gpt-4o-transcribe" ${s.model === 'gpt-4o-transcribe' ? 'selected' : ''}>gpt-4o-transcribe</option>
          <option value="gpt-4o-mini-transcribe" ${s.model === 'gpt-4o-mini-transcribe' ? 'selected' : ''}>gpt-4o-mini-transcribe</option>
          <option value="whisper-1" ${s.model === 'whisper-1' ? 'selected' : ''}>whisper-1</option>
        </select></div>
      <div class="field-row"><span class="fname">${t('set.lang')}</span>
        <select id="setSttLang">
          <option value="" ${!s.sttLang ? 'selected' : ''}>${t('set.auto')}</option>
          <option value="af" ${s.sttLang === 'af' ? 'selected' : ''}>Afrikaans</option>
          <option value="en" ${s.sttLang === 'en' ? 'selected' : ''}>English</option>
        </select></div>
    </div>
    <p class="sheet-hint">${t('set.apikeyHint')}</p>

    <div class="fname" style="margin:14px 2px 6px;">${t('set.vocab')}</div>
    <textarea id="setVocab" class="sheet-notes" placeholder="Riebeeck-Kasteel, oupa Hennie, bakkie">${s.vocab}</textarea>
    <p class="sheet-hint">${t('set.vocabHint')}</p>

    <div class="sheet-move-row" style="margin-top:16px;">
      <button class="sheet-move-btn" id="btnChangePin" type="button">${t('set.changePin')}</button>
      <button class="sheet-move-btn" id="btnExport" type="button">${t('set.export')}</button>
      <button class="sheet-move-btn" id="btnSignout" type="button" style="color:var(--sys-red);">${t('set.signout')}</button>
    </div>
    <p class="sheet-hint" id="setStatus"></p>

    <div class="sheet-actions">
      <button class="sheet-cancel" id="setCancel" type="button">${t('btn.cancel')}</button>
      <button class="sheet-save" id="setSave" type="button">${t('btn.save')}</button>
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
      toast(t('set.saved'));
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
  if (!wanted) { status.textContent = t('pin.needName'); return; }
  if (wanted === settings().username) { status.textContent = t('rename.same'); return; }
  status.textContent = t('pin.working');
  try {
    if (await db.slugFor(wanted)) { status.textContent = t('rename.taken'); return; }
    await db.renameHandle(session.user.id, wanted);
    saveSettings({ username: wanted });
    const lock = getLock();
    if (lock) setLock({ ...lock, user: wanted });
    status.textContent = '';
    toast(t('rename.done', { name: wanted }));
  } catch (e) {
    const msg = String(e?.message || e);
    status.textContent = /duplicate|unique/i.test(msg) ? t('rename.taken')
      : /relation|does not exist|schema cache/i.test(msg) ? t('rename.needsMigration')
      : t('rename.failed', { msg });
  }
}

async function exportAll() {
  try {
    const entries = await db.listEntries({ limit: 5000 });
    const { items } = await import('./tasks.js');
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

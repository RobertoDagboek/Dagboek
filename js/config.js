// Settings that live on this device only (localStorage).
//
// The Supabase URL + anon key are baked in below - both are safe to publish,
// because Row Level Security in Supabase is what actually protects the diary.
//
// The OpenAI key is NOT safe to publish. It is never written into this file and
// never stored in plain text: it is encrypted with a key derived from your PIN
// and only decrypted into memory after you unlock. See crypto.js.

export const BUILT_IN = {
  supabaseUrl: 'https://raufnpdvboljqeowulhy.supabase.co',
  supabaseAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhdWZucGR2Ym9sanFlb3d1bGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzI0NjUsImV4cCI6MjEwMjcwODQ2NX0.0upeOtjHZF17pdjjXRhbEOmqOvHLjH5APEE4_wI5W3Y',
};

const KEY = 'dagboek.settings.v1';
const LOCK_KEY = 'dagboek.lock.v1';
const SECRET_KEY = 'dagboek.secret.v1';
const FAIL_KEY = 'dagboek.fails.v1';

export const MAX_PIN_TRIES = 8;

const DEFAULTS = {
  supabaseUrl: '',
  supabaseAnon: '',
  model: 'gpt-4o-transcribe',
  sttLang: '',          // '' = auto-detect, so Afrikaans + English can mix
  vocab: '',            // names/places you say often - fed to the model as a hint
  lang: 'af',           // UI language
  ownerName: 'Roberto', // used for the greeting on the lock screen
  email: '',            // remembered so you only type it the first time
};

let cache = null;

export function settings() {
  if (cache) return cache;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { stored = {}; }
  cache = { ...DEFAULTS, ...stored };
  if (!cache.supabaseUrl && BUILT_IN.supabaseUrl) cache.supabaseUrl = BUILT_IN.supabaseUrl;
  if (!cache.supabaseAnon && BUILT_IN.supabaseAnon) cache.supabaseAnon = BUILT_IN.supabaseAnon;
  return cache;
}

export function saveSettings(patch) {
  cache = { ...settings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(cache));
  return cache;
}

export function hasProject() {
  const s = settings();
  return Boolean(s.supabaseUrl && s.supabaseAnon);
}

/* ---------------------------- the PIN lock ---------------------------- */

export function getLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch { return null; }
}

export function setLock(lock) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
}

export function hasLock() {
  return Boolean(getLock());
}

/** Wipe the PIN and the encrypted key from this device. Diary data is untouched. */
export function clearLock() {
  localStorage.removeItem(LOCK_KEY);
  localStorage.removeItem(SECRET_KEY);
  localStorage.removeItem(FAIL_KEY);
}

export function failedTries() {
  return Number(localStorage.getItem(FAIL_KEY) || 0);
}

export function bumpFailedTries() {
  const n = failedTries() + 1;
  localStorage.setItem(FAIL_KEY, String(n));
  return n;
}

export function resetFailedTries() {
  localStorage.removeItem(FAIL_KEY);
}

/* ------------------- the OpenAI key, encrypted at rest ------------------ */

export function getSecretBox() {
  try { return JSON.parse(localStorage.getItem(SECRET_KEY) || 'null'); } catch { return null; }
}

export function setSecretBox(box) {
  if (box) localStorage.setItem(SECRET_KEY, JSON.stringify(box));
  else localStorage.removeItem(SECRET_KEY);
}

// Held in memory only, for as long as the tab is open and unlocked.
let openaiKeyMem = '';

export function setOpenAIKey(key) { openaiKeyMem = key || ''; }
export function openAIKey() { return openaiKeyMem; }
export function forgetOpenAIKey() { openaiKeyMem = ''; }

/**
 * Older builds kept the key in plain text. If one is still lying around,
 * hand it back once so it can be encrypted, then scrub it.
 */
export function takeLegacyPlainKey() {
  const s = settings();
  const old = s.openaiKey;
  if (!old) return '';
  delete cache.openaiKey;
  localStorage.setItem(KEY, JSON.stringify(cache));
  return old;
}

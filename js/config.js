// Settings that live on this device only (localStorage).
// The Supabase URL + anon key may also be hard-coded below once you know them,
// so you never have to type them again on a new device.
//
// The anon key is SAFE to publish - Row Level Security in Supabase is what
// protects your diary. The OpenAI key is NOT safe to publish, so it is only
// ever stored in localStorage and never written into this file.

export const BUILT_IN = {
  supabaseUrl: 'https://raufnpdvboljqeowulhy.supabase.co',
  supabaseAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhdWZucGR2Ym9sanFlb3d1bGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzI0NjUsImV4cCI6MjEwMjcwODQ2NX0.0upeOtjHZF17pdjjXRhbEOmqOvHLjH5APEE4_wI5W3Y',
};

const KEY = 'dagboek.settings.v1';

const DEFAULTS = {
  supabaseUrl: '',
  supabaseAnon: '',
  openaiKey: '',
  model: 'gpt-4o-transcribe',
  sttLang: '',          // '' = auto-detect, so Afrikaans + English can mix
  vocab: '',            // names/places you say often - fed to the model as a hint
  lang: 'af',           // UI language
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

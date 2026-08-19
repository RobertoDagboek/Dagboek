import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { settings } from './config.js';

export const BUCKET = 'dagboek';

let client = null;

export function supa() {
  if (client) return client;
  const s = settings();
  if (!s.supabaseUrl || !s.supabaseAnon) throw new Error('Supabase not configured');
  client = createClient(s.supabaseUrl, s.supabaseAnon, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/* ------------------------------ auth ------------------------------ */

export async function getSession() {
  const { data } = await supa().auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(cb) {
  supa().auth.onAuthStateChange((_event, session) => cb(session));
}

export async function sendMagicLink(email) {
  // Strip any leftover ?code=... so the redirect target stays clean.
  const redirectTo = location.origin + location.pathname;
  const { error } = await supa().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  await supa().auth.signOut();
}

/* ----------------------------- entries ---------------------------- */

const ENTRY_COLS = 'id, entry_date, text, audio_path, lat, lng, place, created_at, updated_at';

/** The entry for one date, with its photos. Returns null when nothing is written yet. */
export async function getEntry(date) {
  const { data, error } = await supa()
    .from('entries')
    .select(`${ENTRY_COLS}, entry_photos ( id, path, width, height, taken_at, lat, lng, sort )`)
    .eq('entry_date', date)
    .maybeSingle();
  if (error) throw error;
  if (data?.entry_photos) data.entry_photos.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return data;
}

/** Insert or update the row for a date. `user_id` is filled by a column default. */
export async function upsertEntry(entry) {
  const { data, error } = await supa()
    .from('entries')
    .upsert(entry, { onConflict: 'user_id,entry_date' })
    .select(ENTRY_COLS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  const { error } = await supa().from('entries').delete().eq('id', id);
  if (error) throw error;
}

export async function listEntries({ search = '', limit = 200 } = {}) {
  let q = supa()
    .from('entries')
    .select(`${ENTRY_COLS}, entry_photos ( id, path, sort )`)
    .order('entry_date', { ascending: false })
    .limit(limit);
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    q = q.or(`text.ilike.${term},place.ilike.${term}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------ photos ---------------------------- */

export async function addPhotoRow(row) {
  const { data, error } = await supa().from('entry_photos').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function deletePhotoRow(id) {
  const { error } = await supa().from('entry_photos').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------ files ----------------------------- */

export async function uploadFile(path, blob, contentType) {
  const { error } = await supa().storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: true, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

export async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  await supa().storage.from(BUCKET).remove(list);
}

const urlCache = new Map();

/** Signed URL for a private file, cached for most of its lifetime. */
export async function fileUrl(path, seconds = 3600) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supa().storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + (seconds - 120) * 1000 });
  return data.signedUrl;
}

/** Path prefix that the storage policies check: <user-id>/<date>/ */
export function userPath(userId, date, filename) {
  return `${userId}/${date}/${filename}`;
}

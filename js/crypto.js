// Username + PIN, without ever sending a PIN anywhere.
//
// One PBKDF2 pass over (pin, username) produces 64 bytes, split in two:
//
//   bytes 0-31  -> base64 -> the password Supabase actually stores
//   bytes 32-63 -> an AES-256 key that never leaves this device
//
// So Supabase only ever sees a 44-character high-entropy string. Even if their
// database leaked, the stored hash is of that, not of a 6-digit number.
//
// Honest limit: the PIN is still the only real secret. Someone who knows your
// username can try PINs against the login endpoint - that is slow and rate
// limited, but not impossible. Six digits rather than four is the whole
// difference between 10 000 and 1 000 000 guesses.

const enc = new TextEncoder();
const dec = new TextDecoder();

const ITERATIONS = 300000;
const CHECK_WORD = 'dagboek-ok';
const EMAIL_DOMAIN = 'dagboek.local'; // reserved: mail can never route anywhere

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export const b64 = {
  encode(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (const byte of bytes) s += String.fromCharCode(byte);
    return btoa(s);
  },
  decode(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  },
};

/** Usernames are matched case- and space-insensitively. */
export function slugUser(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * Turn a username + PIN into everything the app needs.
 * @returns {Promise<{user: string, email: string, password: string, localKey: CryptoKey}>}
 */
export async function deriveCredentials(username, pin) {
  const user = slugUser(username);
  if (!user) throw new Error('EMPTY_USER');

  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`dagboek|v2|${user}`), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    512,
  ));

  const password = b64.encode(bits.slice(0, 32));
  const localKey = await crypto.subtle.importKey(
    'raw', bits.slice(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );

  return { user, email: `${user}@${EMAIL_DOMAIN}`, password, localKey };
}

export async function encryptWith(key, text) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: b64.encode(iv), ct: b64.encode(ct) };
}

export async function decryptWith(key, box) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64.decode(box.iv) },
    key,
    b64.decode(box.ct),
  );
  return dec.decode(pt);
}

/** Small encrypted token, so a returning PIN can be checked without a network call. */
export async function makeCheck(key) {
  return encryptWith(key, CHECK_WORD);
}

export async function verifyCheck(key, box) {
  const word = await decryptWith(key, box); // AES-GCM throws on a wrong key
  if (word !== CHECK_WORD) throw new Error('bad pin');
  return true;
}

/** WebCrypto needs a secure context: https, or localhost. */
export function cryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle);
}

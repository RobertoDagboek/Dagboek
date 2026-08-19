// PIN lock built on WebCrypto.
//
// The PIN is never stored - not even hashed in the usual sense. It is stretched
// with PBKDF2 into an AES key, and that key encrypts a known check-word. If the
// check-word decrypts, the PIN was right; AES-GCM refuses to decrypt with the
// wrong key, so a wrong PIN throws instead of returning junk.
//
// The same derived key encrypts your OpenAI API key at rest, so the PIN does
// real work rather than just hiding the screen.
//
// Honest limit: a short numeric PIN can be brute-forced by someone who copies
// this browser's storage off the device. The iteration count makes that slow,
// not impossible. Six digits is meaningfully better than four.

const enc = new TextEncoder();
const dec = new TextDecoder();

const ITERATIONS = 300000;
const CHECK_WORD = 'dagboek-ok';

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

async function deriveKey(pin, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
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

/** Set a brand new PIN. Returns the live key plus the blob to store. */
export async function createLock(pin) {
  const salt = randomBytes(16);
  const key = await deriveKey(pin, salt);
  return {
    key,
    lock: {
      v: 1,
      salt: b64.encode(salt),
      iterations: ITERATIONS,
      check: await encryptWith(key, CHECK_WORD),
    },
  };
}

/** Unlock with a PIN. Throws when the PIN is wrong. */
export async function openLock(pin, lock) {
  const key = await deriveKey(pin, b64.decode(lock.salt), lock.iterations || ITERATIONS);
  const word = await decryptWith(key, lock.check); // throws on a wrong PIN
  if (word !== CHECK_WORD) throw new Error('bad pin');
  return key;
}

/** WebCrypto needs a secure context: https, or localhost. */
export function cryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle);
}

// Face ID / Touch ID unlock, via WebAuthn.
//
// The honest problem: a biometric check returns a yes/no, not a secret. But the
// whole app hangs off the PIN - it derives the Supabase password and the key
// that encrypts your OpenAI key - so "unlock with Face ID" has to end up
// holding the PIN somehow.
//
// Two ways to do that, and which one you get depends on the device:
//
//   STRONG  (iOS 18+, recent Chrome): the WebAuthn PRF extension. The
//           authenticator derives a secret from a salt, and only ever does so
//           after a successful biometric check. That secret encrypts the PIN.
//           Nothing usable is left on disk - without your face, the ciphertext
//           is just noise.
//
//   WEAK    (older devices): no PRF, so the key sits in localStorage next to
//           the ciphertext. Face ID then gates the *app*, not the data.
//           Someone who can read this browser's storage directly could recover
//           the PIN without ever passing the biometric check.
//
// `enrol()` reports which one you got, and the settings screen says so plainly.
// This is a convenience layer over the PIN, never a replacement for it.

const KEY = 'dagboek.bio.v1';
const PRF_SALT = new TextEncoder().encode('dagboek-prf-v1');

const b64 = {
  encode(buf) {
    let s = '';
    for (const byte of new Uint8Array(buf)) s += String.fromCharCode(byte);
    return btoa(s);
  },
  decode(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); },
};

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function write(v) { localStorage.setItem(KEY, JSON.stringify(v)); }

export function isEnrolled() { return Boolean(read()); }
export function enrolmentStrength() { return read()?.prf ? 'strong' : 'weak'; }
export function forget() { localStorage.removeItem(KEY); }

/** Is there a fingerprint reader or Face ID on this device at all? */
export async function isAvailable() {
  try {
    if (!globalThis.PublicKeyCredential) return false;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function aesKeyFrom(rawBytes) {
  const digest = await crypto.subtle.digest('SHA-256', rawBytes);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function seal(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: b64.encode(iv), ct: b64.encode(ct) };
}
async function open(key, box) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64.decode(box.iv) }, key, b64.decode(box.ct),
  );
  return new TextDecoder().decode(pt);
}

/**
 * Register this device and remember the PIN behind the biometric check.
 * Must be called from a tap - browsers refuse WebAuthn without a gesture.
 * @returns {Promise<'strong'|'weak'>}
 */
export async function enrol(pin, username) {
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Dagboek', id: location.hostname },
      user: { id: userId, name: username || 'dagboek', displayName: username || 'Dagboek' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
      extensions: { prf: {} },
    },
  });
  if (!credential) throw new Error('no credential');

  const credentialId = b64.encode(credential.rawId);
  const supportsPrf = Boolean(credential.getClientExtensionResults?.()?.prf?.enabled);

  if (supportsPrf) {
    // Ask for the secret straight away, so a device that claims PRF but will
    // not actually produce one is caught here rather than at unlock time.
    const secret = await prfSecret(credentialId);
    if (secret) {
      write({ credentialId, prf: true, box: await seal(await aesKeyFrom(secret), pin) });
      return 'strong';
    }
  }

  // Fallback: the key lives beside the ciphertext. Obfuscation plus a gate.
  const raw = crypto.getRandomValues(new Uint8Array(32));
  write({
    credentialId,
    prf: false,
    localKey: b64.encode(raw),
    box: await seal(await aesKeyFrom(raw), pin),
  });
  return 'weak';
}

/** Run the biometric check and, if PRF is available, get the secret back. */
async function prfSecret(credentialId) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: b64.decode(credentialId) }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  });
  const first = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}

/**
 * Prompt for Face ID and give back the PIN.
 * Must be called from a tap.
 * @returns {Promise<string>} the PIN
 */
export async function unlock() {
  const saved = read();
  if (!saved) throw new Error('not enrolled');

  if (saved.prf) {
    const secret = await prfSecret(saved.credentialId);
    if (!secret) throw new Error('no prf result');
    return open(await aesKeyFrom(secret), saved.box);
  }

  // No PRF: the assertion is only a gate, so it still has to succeed.
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: b64.decode(saved.credentialId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!assertion) throw new Error('rejected');
  return open(await aesKeyFrom(b64.decode(saved.localKey)), saved.box);
}

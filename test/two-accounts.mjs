/**
 * Two people, one browser.   node test/two-accounts.mjs
 *
 * Reported after sharing the link: a second account signing in on the same
 * browser could not decrypt the first one's stored OpenAI key, and wrote an
 * empty box over it - destroying it. The key is billed to one person, so it
 * must belong to an account, never to the browser.
 *
 * Mirrors the slot rules in js/core/config.js and recoverKey() in js/app.js.
 */
import { deriveCredentials, encryptWith, decryptWith } from '../js/core/crypto.js';

const store = new Map();
const SECRET_LEGACY = 'dagboek.secret.v1';
const slot = slug => 'dagboek.secret.' + slug;

const getSecret = slug => JSON.parse(store.get(slot(slug)) ?? 'null');
const setSecret = (slug, box) => (box ? store.set(slot(slug), JSON.stringify(box)) : store.delete(slot(slug)));
const getLegacy = () => JSON.parse(store.get(SECRET_LEGACY) ?? 'null');

async function recoverKey(slug, localKey) {
  const own = getSecret(slug);
  if (own) { try { return await decryptWith(localKey, own); } catch { /* not ours */ } }
  const legacy = getLegacy();
  if (legacy) {
    try {
      const key = await decryptWith(localKey, legacy);
      if (key) { setSecret(slug, await encryptWith(localKey, key)); store.delete(SECRET_LEGACY); return key; }
    } catch { /* the other account's */ }
  }
  return '';
}

/** What a sign-in does to the stored key. */
async function signIn(slug, pin, typedKey) {
  const { localKey } = await deriveCredentials(slug, pin);
  const key = typedKey || await recoverKey(slug, localKey);
  if (key) setSecret(slug, await encryptWith(localKey, key));
  return key;
}

let fails = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got "${got}"  want "${want}"`}`);
};

const ROBERTO = { slug: 'aa11bb22', pin: '4821' };
const PARTNER = { slug: 'cc33dd44', pin: '9137' };
const KEY = 'sk-roberto-only-key';

console.log('--- the reported case ---');
await signIn(ROBERTO.slug, ROBERTO.pin, KEY);
check('his key is stored', Boolean(getSecret(ROBERTO.slug)), true);

await signIn(PARTNER.slug, PARTNER.pin);
check('she signs in on the same browser: his key survives',
  Boolean(getSecret(ROBERTO.slug)), true);
check('and she gets no key of her own', await signIn(PARTNER.slug, PARTNER.pin), '');

check('he signs back in and still has it',
  await signIn(ROBERTO.slug, ROBERTO.pin), KEY);

console.log('\n--- she must never end up billed to his key ---');
const { localKey: herKey } = await deriveCredentials(PARTNER.slug, PARTNER.pin);
check('his box does not open with her PIN',
  await recoverKey(PARTNER.slug, herKey), '');

console.log('\n--- the old single slot, from before the split ---');
store.clear();
{
  const { localKey } = await deriveCredentials(ROBERTO.slug, ROBERTO.pin);
  store.set(SECRET_LEGACY, JSON.stringify(await encryptWith(localKey, KEY)));
}
check('she signs in first: the old key is left alone',
  await signIn(PARTNER.slug, PARTNER.pin), '');
check('  ...and is still sitting there', Boolean(getLegacy()), true);
check('he signs in: he claims it', await signIn(ROBERTO.slug, ROBERTO.pin), KEY);
check('  ...and the shared slot is emptied', getLegacy(), null);
check('  ...into his own', Boolean(getSecret(ROBERTO.slug)), true);

console.log('\n--- a wrong PIN must not destroy anything ---');
store.clear();
await signIn(ROBERTO.slug, ROBERTO.pin, KEY);
const { localKey: wrongPin } = await deriveCredentials(ROBERTO.slug, '0000');
check('the wrong PIN recovers nothing', await recoverKey(ROBERTO.slug, wrongPin), '');
check('but the key is still there', Boolean(getSecret(ROBERTO.slug)), true);
check('and the right PIN still opens it', await signIn(ROBERTO.slug, ROBERTO.pin), KEY);

console.log(fails ? `\n${fails} FAILED` : '\nall good - one key, one account');
process.exit(fails ? 1 : 0);

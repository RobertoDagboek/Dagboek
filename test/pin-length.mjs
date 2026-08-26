// Mirrors the PIN length rules in app.js and checks the cases that would
// lock someone out of their own diary.
const PIN_LEN = 4;
const PIN_MAX = 8;
const SETTING_PIN = new Set(['create', 'confirm', 'change', 'changeConfirm']);

function pinSlots(mode, lock) {
  if (SETTING_PIN.has(mode)) return PIN_LEN;
  if (mode === 'unlock') return lock?.len || PIN_MAX;
  return PIN_MAX;
}
function accepts(mode, lock, length) {
  const cap = pinSlots(mode, lock);
  if (length > cap) return 'cannot even be typed';
  if (length < 4) return 'rejected: too short';
  if (SETTING_PIN.has(mode) && length !== PIN_LEN) return 'rejected: must be 4';
  return 'accepted';
}
function autoSubmits(mode, lock, length) {
  return mode !== 'signin' && length === pinSlots(mode, lock);
}

let fails = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got "${got}"${ok ? '' : `  want "${want}"`}`);
};

const oldLock = { v: 2 };              // made before this change: no length
const newLock = { v: 2, len: 4 };

console.log('--- the existing 6-digit PIN must keep working ---');
check('unlock on this device, 6 digits', accepts('unlock', oldLock, 6), 'accepted');
check('  ...and does not submit early', autoSubmits('unlock', oldLock, 6), false);
check('sign in on a NEW device, 6 digits', accepts('signin', null, 6), 'accepted');
check('  ...new device never auto-submits', autoSubmits('signin', null, 4), false);

console.log('\n--- new 4-digit PINs ---');
check('unlock with a 4-digit PIN', accepts('unlock', newLock, 4), 'accepted');
check('  ...submits itself on the 4th tap', autoSubmits('unlock', newLock, 4), true);
check('cannot type a 5th digit', accepts('unlock', newLock, 5), 'cannot even be typed');

console.log('\n--- choosing a PIN is always exactly 4 ---');
check('create, 4 digits', accepts('create', null, 4), 'accepted');
check('create, 6 digits refused', accepts('create', null, 6), 'cannot even be typed');
check('change, 4 digits', accepts('change', newLock, 4), 'accepted');
check('confirm auto-advances at 4', autoSubmits('confirm', null, 4), true);

console.log('\n--- nothing shorter than 4, ever ---');
for (const mode of ['unlock', 'signin', 'create', 'change']) {
  check(`${mode}, 3 digits`, accepts(mode, oldLock, 3), 'rejected: too short');
}

console.log(fails ? `\n${fails} FAILED` : '\nall good - no lockout path');
process.exit(fails ? 1 : 0);

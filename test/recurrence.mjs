/**
 * Recurrence rules.   Run with:  node test/recurrence.mjs
 *
 * Mirrors appliesOnDate() from js/planner/planner.js. A mistake here does not
 * throw - it quietly shows a task on the wrong day, or hides it on the right
 * one - so it is worth checking directly.
 */
const parseDateStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function appliesOnDate(t, dateStr) {
  if (t.kind !== 'task') return false;
  if (t.recurring === 'daily') return true;
  if (t.recurring === 'weekdays') { const dow = parseDateStr(dateStr).getDay(); return dow >= 1 && dow <= 5; }
  if (t.recurring === 'days') {
    return Array.isArray(t.repeatDays) && t.repeatDays.includes(parseDateStr(dateStr).getDay());
  }
  if (t.recurring === 'weekly' && t.date) {
    return parseDateStr(dateStr).getDay() === parseDateStr(t.date).getDay();
  }
  return t.date === dateStr;
}

// A known week: 2026-08-24 is a Monday.
const WEEK = {
  Mon: '2026-08-24', Tue: '2026-08-25', Wed: '2026-08-26', Thu: '2026-08-27',
  Fri: '2026-08-28', Sat: '2026-08-29', Sun: '2026-08-30',
};

let fails = 0;
function expect(label, task, wantDays) {
  const got = Object.entries(WEEK).filter(([, d]) => appliesOnDate(task, d)).map(([n]) => n);
  const ok = got.join(',') === wantDays.join(',');
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`        ${got.join(' ') || '(none)'}${ok ? '' : `   want: ${wantDays.join(' ')}`}`);
}

// sanity: the fixture week really is Mon..Sun
const dows = Object.values(WEEK).map(d => parseDateStr(d).getDay());
console.log(`fixture week is ${dows.join(',')} (want 1,2,3,4,5,6,0)`);
if (dows.join(',') !== '1,2,3,4,5,6,0') { console.log('FIXTURE WRONG'); process.exit(1); }

const task = over => ({ kind: 'task', recurring: 'none', date: '', repeatDays: [], ...over });

console.log('\n--- the new one: chosen weekdays ---');
expect('Mon, Wed, Fri', task({ recurring: 'days', repeatDays: [1, 3, 5] }), ['Mon', 'Wed', 'Fri']);
expect('Tue, Thu', task({ recurring: 'days', repeatDays: [2, 4] }), ['Tue', 'Thu']);
expect('Roberto\'s example: Mon Tue Wed Thu',
  task({ recurring: 'days', repeatDays: [1, 2, 3, 4] }), ['Mon', 'Tue', 'Wed', 'Thu']);
expect('weekend only', task({ recurring: 'days', repeatDays: [6, 0] }), ['Sat', 'Sun']);
expect('Sunday alone (day 0, not falsy)', task({ recurring: 'days', repeatDays: [0] }), ['Sun']);
expect('all seven', task({ recurring: 'days', repeatDays: [0, 1, 2, 3, 4, 5, 6] }),
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
expect('none picked shows nothing', task({ recurring: 'days', repeatDays: [] }), []);
expect('missing array does not throw', task({ recurring: 'days', repeatDays: undefined }), []);

console.log('\n--- the old rules still hold ---');
expect('daily', task({ recurring: 'daily' }), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
expect('weekdays', task({ recurring: 'weekdays' }), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
expect('weekly, anchored to a Wednesday',
  task({ recurring: 'weekly', date: '2026-08-19' }), ['Wed']);
expect('one-off on the Thursday', task({ date: WEEK.Thu }), ['Thu']);
expect('one-off elsewhere', task({ date: '2026-07-01' }), []);

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);

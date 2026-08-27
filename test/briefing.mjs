/**
 * Today's ordering, and the once-a-day rule.   node test/briefing.mjs
 *
 * Priority is the Eisenhower quadrant: 1 Do, 2 Schedule, 3 Delegate, 4 Drop.
 *
 * Mirrors todayOrder() from js/planner/planner.js and the gate in
 * js/planner/briefing.js. Both are quiet failures if wrong - the briefing
 * appearing on every refresh would be maddening, and a bad sort just looks
 * like a muddled list - so they are worth checking directly.
 */

function todayOrder(today, mode) {
  const isDone = x => (x.recurring && x.recurring !== 'none' ? x.lastCompletedDate === today : x.completed);
  return (a, b) => {
    const ad = isDone(a), bd = isDone(b);
    if (ad !== bd) return ad ? 1 : -1;
    if (mode === 'priority') {
      const ap = Number(a.priority) || 2, bp = Number(b.priority) || 2;
      if (ap !== bp) return ap - bp;
    } else {
      const af = a.flagged ? 0 : 1, bf = b.flagged ? 0 : 1;
      if (af !== bf) return af - bf;
    }
    return (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order || 0) - (b.order || 0);
  };
}

const TODAY = '2026-08-27';
const task = (title, over = {}) => ({
  title, kind: 'task', recurring: 'none', completed: false,
  flagged: false, priority: 2, time: '', order: 0, ...over,
});

let fails = 0;
const order = (label, list, mode, want) => {
  const got = [...list].sort(todayOrder(TODAY, mode)).map(x => x.title);
  const ok = got.join(' ') === want.join(' ');
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`        ${got.join(' → ')}${ok ? '' : `\n        want ${want.join(' → ')}`}`);
};

const day = [
  task('Invoices', { time: '14:00', priority: 3 }),   // delegate
  task('Open up', { time: '07:00', priority: 2 }),    // schedule
  task('Call bank', { time: '', priority: 1 }),       // do
  task('Sweep', { time: '16:30', priority: 4 }),      // drop
];

console.log('--- by time ---');
order('the clock decides, no time goes last', day, 'time',
  ['Open up', 'Invoices', 'Sweep', 'Call bank']);

console.log('\n--- by priority ---');
order('quadrant order, time breaks ties', day, 'priority',
  ['Call bank', 'Open up', 'Invoices', 'Sweep']);

order('two in the same quadrant stay in clock order',
  [task('B', { time: '11:00', priority: 1 }), task('A', { time: '09:00', priority: 1 })],
  'priority', ['A', 'B']);

order('unset counts as Schedule',
  [task('Drop', { priority: 4 }), task('Unset', { priority: undefined }), task('Do', { priority: 1 })],
  'priority', ['Do', 'Unset', 'Drop']);

console.log('\n--- done always sinks ---');
order('finished work goes to the bottom in either mode',
  [task('Done thing', { completed: true, priority: 1, time: '06:00' }),
   task('Still to do', { priority: 4, time: '18:00' })],
  'priority', ['Still to do', 'Done thing']);

order('and the same by time',
  [task('Done thing', { completed: true, time: '06:00' }), task('Still to do', { time: '18:00' })],
  'time', ['Still to do', 'Done thing']);

console.log('\n--- flags only matter when sorting by time ---');
order('a flag lifts a task when sorting by time',
  [task('Plain', { time: '08:00' }), task('Flagged', { time: '17:00', flagged: true })],
  'time', ['Flagged', 'Plain']);

order('but matrix mode ignores the flag',
  [task('Plain Do', { time: '08:00', priority: 1 }),
   task('Flagged Drop', { time: '17:00', flagged: true, priority: 4 })],
  'priority', ['Plain Do', 'Flagged Drop']);

console.log('\n--- shown once a day, not once a refresh ---');
const briefed = (lastBriefing, today) => lastBriefing === today;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
};
check('first open of the day: show it', briefed('2026-08-26', TODAY), false);
check('opened again the same day: do not', briefed(TODAY, TODAY), true);
check('never briefed before: show it', briefed('', TODAY), false);
check('next morning: show it again', briefed(TODAY, '2026-08-28'), false);

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);

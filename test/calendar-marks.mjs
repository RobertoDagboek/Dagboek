/**
 * What a calendar day shows.   node test/calendar-marks.mjs
 *
 * Mirrors the marker rules in renderMonthGridHtml(). Purely visual, so nothing
 * throws when it is wrong - it just quietly tells you the wrong thing about
 * your day.
 */
const DAY = '2026-08-27';

const isDone = (x, d) =>
  (x.recurring && x.recurring !== 'none' ? x.lastCompletedDate === d : x.completed);

/** The rules, as written in planner.js. */
function marks(dayItems, hasDiary = false) {
  const outstanding = dayItems.filter(x => !isDone(x, DAY));
  const anyDone = outstanding.length < dayItems.length;
  const dots = [...new Set(outstanding.map(x => x.context).filter(Boolean))].slice(0, 3);
  return {
    dots,
    tick: anyDone,
    diary: hasDiary,
    count: outstanding.length || null,
  };
}

const task = (over = {}) => ({ kind: 'task', recurring: 'none', completed: false, context: '', ...over });

let fails = 0;
const check = (label, got, want) => {
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) fails++;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${label}`);
  if (!same) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

console.log('--- what Roberto asked for ---');
check('one done, one still to do: tick beside the colour of the one left',
  marks([task({ completed: true, context: 'Admin' }), task({ context: 'Floor' })]),
  { dots: ['Floor'], tick: true, diary: false, count: 1 });

check('several done: still only one tick',
  marks([task({ completed: true, context: 'Admin' }),
         task({ completed: true, context: 'Floor' }),
         task({ completed: true, context: 'Home' })]),
  { dots: [], tick: true, diary: false, count: null });

console.log('\n--- the plain cases ---');
check('nothing done yet: dots only, no tick',
  marks([task({ context: 'Floor' }), task({ context: 'Admin' })]),
  { dots: ['Floor', 'Admin'], tick: false, diary: false, count: 2 });

check('an empty day shows nothing', marks([]),
  { dots: [], tick: false, diary: false, count: null });

check('a task with no area still counts, it just has no dot',
  marks([task({}), task({ completed: true })]),
  { dots: [], tick: true, diary: false, count: 1 });

console.log('\n--- alongside the other markers ---');
check('a diary entry sits next to the tick',
  marks([task({ completed: true, context: 'Home' })], true),
  { dots: [], tick: true, diary: true, count: null });

check('at most three dots, however many areas',
  marks([task({ context: 'Floor' }), task({ context: 'Admin' }),
         task({ context: 'App' }), task({ context: 'Home' })]),
  { dots: ['Floor', 'Admin', 'App'], tick: false, diary: false, count: 4 });

console.log('\n--- repeating tasks are done per day ---');
check('done today counts as done',
  marks([task({ recurring: 'daily', lastCompletedDate: DAY, context: 'Floor' })]),
  { dots: [], tick: true, diary: false, count: null });

check('done yesterday does not',
  marks([task({ recurring: 'daily', lastCompletedDate: '2026-08-26', context: 'Floor' })]),
  { dots: ['Floor'], tick: false, diary: false, count: 1 });

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);

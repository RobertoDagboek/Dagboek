/**
 * A repeating task is finished per day.   node test/done-per-day.mjs
 *
 * Reported: ticking a task on one day removed the tick from the day before,
 * and showed that earlier day as unfinished again. Completion was a single
 * last_done date, so a repeating task could only ever be done once.
 *
 * Mirrors isDoneOnDate() and toggleCompleteOn() from js/planner/planner.js.
 */

function isDoneOnDate(t, dateStr) {
  if (t.recurring && t.recurring !== 'none') {
    if (Array.isArray(t.doneDates) && t.doneDates.includes(dateStr)) return true;
    return !t.doneDates?.length && t.lastCompletedDate === dateStr;
  }
  return !!t.completed;
}

function toggle(t, dateStr) {
  if (t.recurring && t.recurring !== 'none') {
    const days = new Set(t.doneDates ?? []);
    if (t.lastCompletedDate) days.add(t.lastCompletedDate);
    if (days.has(dateStr)) days.delete(dateStr); else days.add(dateStr);
    t.doneDates = [...days].sort();
    t.lastCompletedDate = t.doneDates.length ? t.doneDates[t.doneDates.length - 1] : null;
  } else {
    t.completed = !t.completed;
  }
  return t;
}

const MON = '2026-08-24', TUE = '2026-08-25', WED = '2026-08-26';

let fails = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `   got ${got}, want ${want}`}`);
};

const daily = (over = {}) => ({ recurring: 'daily', doneDates: [], lastCompletedDate: null, ...over });

console.log('--- the reported bug ---');
{
  const t = daily();
  toggle(t, MON);
  check('Monday is done', isDoneOnDate(t, MON), true);
  toggle(t, TUE);
  check('Tuesday is done', isDoneOnDate(t, TUE), true);
  check('and Monday is STILL done', isDoneOnDate(t, MON), true);
  check('Wednesday is not', isDoneOnDate(t, WED), false);
}

console.log('\n--- unticking only affects that day ---');
{
  const t = daily();
  toggle(t, MON); toggle(t, TUE);
  toggle(t, TUE);
  check('Tuesday unticked', isDoneOnDate(t, TUE), false);
  check('Monday untouched', isDoneOnDate(t, MON), true);
}

console.log('\n--- a tick from before the fix is not lost ---');
{
  const t = daily({ doneDates: [], lastCompletedDate: MON });
  check('the old single date still reads as done', isDoneOnDate(t, MON), true);
  toggle(t, TUE);
  check('after ticking Tuesday, Monday survives', isDoneOnDate(t, MON), true);
  check('  ...and Tuesday is done too', isDoneOnDate(t, TUE), true);
}

console.log('\n--- one-off tasks are unchanged ---');
{
  const once = { recurring: 'none', completed: false };
  toggle(once, MON);
  check('ticked', isDoneOnDate(once, MON), true);
  check('a one-off is done regardless of the day asked about', isDoneOnDate(once, WED), true);
  toggle(once, MON);
  check('and unticks', isDoneOnDate(once, MON), false);
}

console.log('\n--- the most recent tick is still tracked ---');
{
  const t = daily();
  toggle(t, WED); toggle(t, MON);
  check('lastCompletedDate is the latest, not the last touched', t.lastCompletedDate, WED);
  toggle(t, WED);
  check('  ...and falls back when that one is removed', t.lastCompletedDate, MON);
}

console.log(fails ? `\n${fails} FAILED` : '\nall good - each day stands on its own');
process.exit(fails ? 1 : 0);

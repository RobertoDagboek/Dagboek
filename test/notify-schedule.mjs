/**
 * Notification timing.   node test/notify-schedule.mjs
 *
 * These rules fail quietly. A wrong answer is a buzz at two in the morning, or
 * silence on the one day it mattered - never an error anyone would see. So the
 * whole agreed schedule is pinned here, minute by minute.
 *
 *   06:30                          set your order
 *   08:00 .. 20:00 every 2 hours   next up
 *   21:00                          last call, only if something is open
 */
import { due, outstanding, wantsTimeAlert, SLOTS } from '../js/planner/schedule.js';

const DATE = '2026-08-31';
const task = (title, over = {}) => ({
  id: title.toLowerCase().replace(/\W/g, ''), kind: 'task', title,
  recurring: 'none', completed: false, doneDates: [], draft: false,
  time: '', priority: 2, timeLocked: false, ...over,
});

let fails = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};
const kindAt = (now, o = {}) => {
  const r = due({ now, date: DATE, tasks: o.tasks ?? [task('Invoices')], sort: o.sort ?? 'priority',
                  briefed: o.briefed ?? false, sent: o.sent ?? [], unanswered: o.unanswered ?? 0 });
  return r ? r.kind : null;
};

console.log('--- the agreed clock ---');
check('06:30 asks you to set the order', kindAt('06:30'), 'nudge');
check('08:00 fires', kindAt('08:00'), 'nudge');
check('20:00 fires', kindAt('20:00'), 'nudge');
check('21:00 is the last call', kindAt('21:00'), 'last');
check('07:00 is silent', kindAt('07:00'), null);
check('09:00 with nothing timed is silent', kindAt('09:00'), null);
check('22:00 is silent - the day is over', kindAt('22:00'), null);
check('02:00 is silent', kindAt('02:00'), null);
check('every slot is even-houred, 08 to 20',
  SLOTS.join(','), '08:00,10:00,12:00,14:00,16:00,18:00,20:00');

console.log('\n--- nothing outstanding means no buzz ---');
const allDone = [task('Invoices', { completed: true })];
check('06:30 stays quiet', kindAt('06:30', { tasks: allDone }), null);
check('10:00 stays quiet', kindAt('10:00', { tasks: allDone }), null);
check('21:00 stays quiet', kindAt('21:00', { tasks: allDone }), null);

console.log('\n--- once the order is set ---');
check('a slot becomes "next up", not a nudge',
  kindAt('10:00', { briefed: true }), 'slot');
check('06:30 is skipped when already briefed',
  kindAt('06:30', { briefed: true }), null);

console.log('\n--- timed tasks ---');
const nine = [task('Call bank', { time: '09:00' }), task('Invoices')];
check('09:00 fires in time mode', kindAt('09:00', { tasks: nine, sort: 'time' }), 'task');
check('and does NOT in matrix mode', kindAt('09:00', { tasks: nine, sort: 'priority' }), null);
check('unless the override is on',
  kindAt('09:00', { sort: 'priority', tasks: [task('Call bank', { time: '09:00', timeLocked: true })] }), 'task');

console.log('\n--- a timed alert ignores the unanswered cap ---');
check('nudges stop after two unanswered', kindAt('10:00', { unanswered: 2 }), null);
check('but the 09:00 task still fires',
  kindAt('09:00', { tasks: nine, sort: 'time', unanswered: 5 }), 'task');
check('and so does an overridden one',
  kindAt('09:00', { sort: 'priority', unanswered: 9,
                    tasks: [task('Call bank', { time: '09:00', timeLocked: true })] }), 'task');
check('one unanswered is still under the cap', kindAt('10:00', { unanswered: 1 }), 'nudge');

console.log('\n--- nothing is sent twice ---');
check('a slot already sent stays quiet',
  kindAt('10:00', { sent: ['slot::10:00'] }), null);
check('a task already alerted stays quiet',
  kindAt('09:00', { tasks: nine, sort: 'time', sent: ['task:callbank:09:00'] }), null);

console.log('\n--- a finished task drops out ---');
const doneNine = [task('Call bank', { time: '09:00', completed: true }), task('Invoices')];
check('no alert for something already done',
  kindAt('09:00', { tasks: doneNine, sort: 'time' }), null);
check('a repeating task ticked today drops out',
  kindAt('09:00', { sort: 'time', tasks: [task('Open up', { time: '09:00', recurring: 'daily', doneDates: [DATE] })] }), null);
check('but not one ticked yesterday',
  kindAt('09:00', { sort: 'time', tasks: [task('Open up', { time: '09:00', recurring: 'daily', doneDates: ['2026-08-30'] })] }), 'task');

console.log('\n--- untimed tasks queue behind timed ones ---');
const mixed = [task('Anytime'), task('Nine', { time: '09:00' }), task('Seven', { time: '07:00' })];
check('order is 07:00, 09:00, then untimed',
  outstanding(mixed, DATE).map(t => t.title).join(','), 'Seven,Nine,Anytime');
check('drafts never appear',
  outstanding([task('Draft', { draft: true }), task('Real')], DATE).map(t => t.title).join(','), 'Real');

console.log('\n--- what the message says ---');
{
  const r = due({ now: '09:00', date: DATE, tasks: nine, sort: 'time', briefed: true, sent: [], unanswered: 0 });
  check('a timed alert names the task', r.title, '⏰ 09:00 — Call bank');
  check('  ...and says what else is left', r.body.includes('1 more today'), true);
  check('  ...and opens that task', r.url.includes('task=callbank'), true);
}
{
  const r = due({ now: '06:30', date: DATE, tasks: nine, sort: 'time', briefed: false, sent: [], unanswered: 0 });
  check('the nudge opens the briefing', r.url, './?briefing=1');
  check('  ...and is marked as a nudge, not a deadline', r.title.startsWith('\u{1F5D3}'), true);
}

console.log('\n--- wantsTimeAlert on its own ---');
check('no time set, no alert', wantsTimeAlert(task('x'), 'time'), false);
check('time mode alerts', wantsTimeAlert(task('x', { time: '09:00' }), 'time'), true);
check('matrix mode does not', wantsTimeAlert(task('x', { time: '09:00' }), 'priority'), false);
check('matrix mode with override does', wantsTimeAlert(task('x', { time: '09:00', timeLocked: true }), 'priority'), true);

console.log(fails ? `\n${fails} FAILED` : '\nall good - the schedule holds');
process.exit(fails ? 1 : 0);

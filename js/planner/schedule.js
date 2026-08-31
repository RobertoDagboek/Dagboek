// When a notification is due, and what it should say.
//
// Deliberately pure: given the clock, the day's tasks and what has already
// been sent, it returns the notification to send or null. No DOM, no network,
// no clock of its own - everything comes in as an argument. That is what makes
// the rules testable, and these rules are the sort that fail quietly: a wrong
// answer is a buzz at two in the morning, or silence on the one day it
// mattered.
//
// The same file runs in the browser and inside the Supabase function that
// actually sends, so the two can never drift apart.

export const NUDGE_AT = '06:30';                 // "set your order for today"
export const SLOTS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
export const LAST_CALL = '21:00';
export const MAX_UNANSWERED = 2;                 // then the nudging stops

const mins = hhmm => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Was this task finished on this day? Mirrors isDoneOnDate in planner.js. */
export function doneOn(t, date) {
  if (t.recurring && t.recurring !== 'none') {
    if (Array.isArray(t.doneDates) && t.doneDates.includes(date)) return true;
    return !t.doneDates?.length && t.lastCompletedDate === date;
  }
  return !!t.completed;
}

/** Everything still to do today, timed first, then the rest. */
export function outstanding(tasks, date) {
  return tasks
    .filter(t => t.kind === 'task' && !t.draft && !doneOn(t, date))
    .sort((a, b) => {
      // Untimed tasks queue behind everything with a clock time.
      const at = a.time ? mins(a.time) : 1e6;
      const bt = b.time ? mins(b.time) : 1e6;
      return at - bt;
    });
}

/**
 * What, if anything, to send at this minute.
 *
 * @param {object} o
 * @param {string} o.now          'HH:MM'
 * @param {string} o.date         today, YYYY-MM-DD
 * @param {Array}  o.tasks        every planner item
 * @param {string} o.sort         'time' | 'priority'
 * @param {boolean} o.briefed     has the order been set today
 * @param {string[]} o.sent       'HH:MM' slots already sent today
 * @param {number} o.unanswered   nudges sent since the app was last opened
 * @returns {{kind, title, body, at, url}|null}
 */
export function due({ now, date, tasks, sort, briefed, sent = [], unanswered = 0 }) {
  const left = outstanding(tasks, date);

  // A timed task fires at its time no matter what: it was set on purpose, and
  // it is not affected by nudges going unanswered.
  const timed = left.find(t => t.time === now && wantsTimeAlert(t, sort) && !sent.includes(key('task', t.id, now)));
  if (timed) {
    return {
      kind: 'task',
      key: key('task', timed.id, now),
      at: now,
      title: `⏰ ${now} — ${timed.title}`,
      body: bodyFor(timed, left),
      url: `./?task=${encodeURIComponent(timed.id)}`,
    };
  }

  // Nothing left to do means nothing to say. No "all clear" buzz.
  if (!left.length) return null;

  // Past the last call, the day is over.
  if (mins(now) > mins(LAST_CALL)) return null;

  // Everything below is a nudge, and nudges give up after two unanswered.
  if (unanswered >= MAX_UNANSWERED) return null;

  if (now === NUDGE_AT && !briefed && !sent.includes(key('nudge', '', now))) {
    return {
      kind: 'nudge',
      key: key('nudge', '', now),
      at: now,
      title: '\u{1F5D3} Set your order for today',
      body: `${left.length} task${left.length === 1 ? '' : 's'} waiting. Tap to sort them.`,
      url: './?briefing=1',
    };
  }

  if (now === LAST_CALL && !sent.includes(key('last', '', now))) {
    return {
      kind: 'last',
      key: key('last', '', now),
      at: now,
      title: '\u{1F319} Last call',
      body: `${left.length} still open: ${left.slice(0, 3).map(t => t.title).join(', ')}`,
      url: './',
    };
  }

  if (SLOTS.includes(now) && !sent.includes(key('slot', '', now))) {
    const next = left[0];
    return {
      kind: briefed ? 'slot' : 'nudge',
      key: key('slot', '', now),
      at: now,
      title: briefed ? `⏰ Next: ${next.title}` : '\u{1F5D3} Set your order for today',
      body: bodyFor(next, left),
      url: briefed ? `./?task=${encodeURIComponent(next.id)}` : './?briefing=1',
    };
  }

  return null;
}

/**
 * Does this task alert at its own clock time?
 * Always in time mode. In matrix mode only when the override is on - the case
 * where the job is not important but the hour genuinely is.
 */
export function wantsTimeAlert(t, sort) {
  if (!t.time) return false;
  return sort === 'time' || !!t.timeLocked;
}

function bodyFor(task, left) {
  const bits = [];
  if (task.time) bits.push(task.time);
  if (task.context) bits.push(task.context);
  if (task.estimate) bits.push(task.estimate);
  const more = left.length - 1;
  if (more > 0) bits.push(`${more} more today`);
  return bits.join(' · ');
}

function key(kind, id, at) { return `${kind}:${id}:${at}`; }

// Sends the notifications. Runs once a minute from pg_cron.
//
// The rules below are GENERATED from js/planner/schedule.js. Supabase's
// bundler only accepts npm, jsr and esm.sh imports, so the function cannot
// fetch them from our own site and has to carry a copy.
//
//   Change the rules in js/planner/schedule.js, then run:
//     node tools/build-send-push.mjs
//   and paste this file in again. test/function-in-sync.mjs fails if you
//   forget, so the copy cannot quietly fall behind.
//
// Secrets it needs (Edge Functions -> send-push -> Secrets):
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:...),
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// >>> GENERATED FROM js/planner/schedule.js - DO NOT EDIT BELOW
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

const NUDGE_AT = '06:30';                 // "set your order for today"
const SLOTS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const LAST_CALL = '21:00';
const MAX_UNANSWERED = 2;                 // then the nudging stops

const mins = hhmm => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Was this task finished on this day? Mirrors isDoneOnDate in planner.js. */
function doneOn(t, date) {
  if (t.recurring && t.recurring !== 'none') {
    if (Array.isArray(t.doneDates) && t.doneDates.includes(date)) return true;
    return !t.doneDates?.length && t.lastCompletedDate === date;
  }
  return !!t.completed;
}

/** Everything still to do today, timed first, then the rest. */
function outstanding(tasks, date) {
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
function due({ now, date, tasks, sort, briefed, sent = [], unanswered = 0 }) {
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
function wantsTimeAlert(t, sort) {
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
// <<< END GENERATED


const env = (k: string) => Deno.env.get(k) ?? '';

// Configured on first use, not at boot. Doing it at boot meant that a missing
// secret threw before the worker could serve anything at all, and the only
// symptom was a 500 with nothing to go on.
let vapidReady = false;
function configureVapid() {
  if (vapidReady) return;
  const pub = env('VAPID_PUBLIC');
  const priv = env('VAPID_PRIVATE');
  if (!pub || !priv) {
    throw new Error('VAPID_PUBLIC and VAPID_PRIVATE are not set in this function's secrets.');
  }
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:dagboek@example.com', pub, priv);
  vapidReady = true;
}

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

/** 'HH:MM' and 'YYYY-MM-DD' where the person actually is. */
function localNow(offsetMins: number) {
  const d = new Date(Date.now() + offsetMins * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    now: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
  };
}

Deno.serve(async (req) => {
  // Only the scheduler may run this. Without the check, the anon key sitting
  // in the page source would be enough for anyone to notify this account.
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) {
    return new Response('nope', { status: 401 });
  }

  // Say plainly what is missing rather than dying with a 500.
  try { configureVapid(); }
  catch (e) { return Response.json({ ok: false, error: (e as Error).message }, { status: 503 }); }

  const { data: states } = await db.from('notify_state').select('*').eq('enabled', true);
  let sent = 0;

  for (const st of states ?? []) {
    const { now, date } = localNow(st.tz_offset ?? 120);

    // sent_keys belongs to one day; a new day starts empty.
    const already: string[] = st.sent_day === date ? (st.sent_keys ?? []) : [];

    const { data: tasks } = await db.from('planner_items')
      .select('id, kind, title, draft, entry_date, at_time, recurring, repeat_days, completed, last_done, done_dates, priority, context, estimate, time_locked')
      .eq('user_id', st.user_id);

    const todays = (tasks ?? [])
      .map(r => ({
        id: r.id, kind: r.kind, title: r.title, draft: r.draft,
        date: r.entry_date, time: r.at_time ?? '', recurring: r.recurring,
        repeatDays: r.repeat_days ?? [], completed: r.completed,
        lastCompletedDate: r.last_done, doneDates: r.done_dates ?? [],
        priority: r.priority, context: r.context, estimate: r.estimate,
        timeLocked: r.time_locked,
      }))
      .filter(t => appliesToday(t, date));

    const { data: prefs } = await db.from('planner_prefs')
      .select('today_sort, last_briefing').eq('user_id', st.user_id).maybeSingle();

    const msg = due({
      now, date, tasks: todays,
      sort: prefs?.today_sort === 'priority' ? 'priority' : 'time',
      briefed: prefs?.last_briefing === date,
      sent: already,
      unanswered: st.unanswered ?? 0,
    });
    if (!msg) continue;

    const { data: subs } = await db.from('push_subscriptions')
      .select('*').eq('user_id', st.user_id);
    if (!subs?.length) continue;

    const payload = JSON.stringify({
      title: msg.title, body: msg.body, url: msg.url, tag: msg.kind, kind: msg.kind,
    });

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        await db.from('push_subscriptions')
          .update({ last_ok: new Date().toISOString(), failures: 0 }).eq('endpoint', s.endpoint);
        sent++;
      } catch (e) {
        const gone = (e as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away. Keeping it
        // would mean failing forever.
        if (gone === 404 || gone === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        } else {
          await db.rpc('bump_push_failure', { ep: s.endpoint }).catch(() => {});
        }
      }
    }

    // A nudge that goes unanswered counts against the cap. A timed alert never
    // does - it was asked for on purpose.
    await db.from('notify_state').update({
      sent_day: date,
      sent_keys: [...already, msg.key],
      unanswered: msg.kind === 'task' ? st.unanswered : (st.unanswered ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('user_id', st.user_id);
  }

  return Response.json({ ok: true, sent });
});

/** Mirrors appliesOnDate in js/planner/planner.js. */
function appliesToday(t: Record<string, unknown>, date: string) {
  if (t.kind !== 'task' || t.draft) return false;
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  if (t.recurring === 'daily') return true;
  if (t.recurring === 'weekdays') return dow >= 1 && dow <= 5;
  if (t.recurring === 'days') return (t.repeatDays as number[])?.includes(dow) ?? false;
  if (t.recurring === 'weekly' && t.date) {
    return new Date((t.date as string) + 'T00:00:00Z').getUTCDay() === dow;
  }
  return t.date === date;
}

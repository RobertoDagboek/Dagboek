// Sends the notifications. Runs once a minute from pg_cron.
//
// The rules themselves live in js/planner/schedule.js and are imported from
// the live site rather than copied here, so there is only ever one definition
// of when a notification is due.
//
//   NOTE: Deno fetches that import when the function is DEPLOYED, not on every
//   run. Change the rules in schedule.js and this function keeps using the old
//   ones until it is deployed again.
//
// Secrets it needs (Edge Functions -> send-push -> Secrets):
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:...),
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { due } from 'https://robertodagboek.github.io/Dagboek/js/planner/schedule.js';

const env = (k: string) => Deno.env.get(k) ?? '';

webpush.setVapidDetails(
  env('VAPID_SUBJECT') || 'mailto:dagboek@example.com',
  env('VAPID_PUBLIC'),
  env('VAPID_PRIVATE'),
);

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

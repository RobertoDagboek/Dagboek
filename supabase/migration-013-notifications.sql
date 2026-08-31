-- ============================================================
--  Migration 013: notifications
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
-- ============================================================

-- The override: this job may not be important, but the hour is.
alter table public.planner_items
  add column if not exists time_locked boolean not null default false;

-- One row per device that has agreed to be notified. A phone, a laptop; the
-- same account can have several, and each has to be told separately.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  last_ok     timestamptz,
  failures    int not null default 0
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- What the sender needs to remember between runs.
--
--   last_seen   when the app was last opened. The only way to tell being
--               ignored apart from not having looked yet.
--   unanswered  nudges sent since then. Two, and the nudging stops.
--   sent_day    which day sent_keys belongs to, so it resets by itself.
--   sent_keys   what has already gone out today, so nothing is sent twice.
--   tz_offset   minutes ahead of UTC, so 06:30 means 06:30 where you are.
create table if not exists public.notify_state (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  enabled     boolean not null default true,
  last_seen   timestamptz,
  unanswered  int not null default 0,
  sent_day    date,
  sent_keys   text[] not null default '{}',
  tz_offset   int not null default 120,   -- South Africa, UTC+2
  updated_at  timestamptz not null default now()
);
alter table public.notify_state enable row level security;
drop policy if exists notify_own on public.notify_state;
create policy notify_own on public.notify_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Opening the app answers whatever was outstanding.
create or replace function public.mark_seen(offset_mins int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notify_state (user_id, last_seen, unanswered, tz_offset)
    values (auth.uid(), now(), 0, coalesce(offset_mins, 120))
  on conflict (user_id) do update
    set last_seen = now(),
        unanswered = 0,
        tz_offset = coalesce(offset_mins, public.notify_state.tz_offset),
        updated_at = now();
end $$;

revoke all on function public.mark_seen(int) from public;
grant execute on function public.mark_seen(int) to authenticated;

-- The sender has to know how you asked for the day to be sorted, and whether
-- you have set it yet. Both lived only in the browser, where nothing on the
-- server can see them.
create table if not exists public.planner_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  today_sort    text not null default 'time',
  last_briefing date,
  updated_at    timestamptz not null default now()
);
alter table public.planner_prefs enable row level security;
drop policy if exists prefs_own on public.planner_prefs;
create policy prefs_own on public.planner_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A push that fails for a reason other than "gone" is counted, not deleted:
-- one bad night on the network should not cost you your notifications.
create or replace function public.bump_push_failure(ep text)
returns void language sql security definer set search_path = public as $$
  update public.push_subscriptions set failures = failures + 1 where endpoint = ep;
$$;
revoke all on function public.bump_push_failure(text) from public;

-- ============================================================
--  Migration 012: a repeating task is done per day, not once
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  last_done held a single date, so ticking a daily task on Tuesday erased
--  Monday: the calendar lost the earlier tick and showed that day as unfinished
--  again. Completion is a set of days, not the most recent one.
--
--  last_done is left in place and still written as the most recent tick, so
--  nothing depending on it breaks. Reads use done_dates.
-- ============================================================

alter table public.planner_items
  add column if not exists done_dates date[] not null default '{}';

-- Carry over whatever single tick each task already had.
update public.planner_items
   set done_dates = array[last_done]
 where last_done is not null
   and coalesce(array_length(done_dates, 1), 0) = 0;

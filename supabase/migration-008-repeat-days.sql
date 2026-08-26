-- ============================================================
--  Migration 008: repeat on chosen weekdays
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  recurring = 'days' means "these weekdays, every week". Which ones lives
--  here as day numbers, 0 = Sunday through 6 = Saturday - the same numbering
--  JavaScript's getDay() uses, so no conversion is needed anywhere.
-- ============================================================

alter table public.planner_items
  add column if not exists repeat_days int[];

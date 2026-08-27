-- ============================================================
--  Migration 010: priority
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  1 = high, 2 = normal, 3 = low. Low numbers sort first, so ordering is a
--  plain ascending sort with no lookup table in between. Everything that
--  already exists becomes normal.
-- ============================================================

alter table public.planner_items
  add column if not exists priority int not null default 2;

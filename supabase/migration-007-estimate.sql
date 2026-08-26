-- ============================================================
--  Migration 007: time estimate on planner items
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  Stored as the text the picker produces ("2-3 days", "1 hour"), not as a
--  number, because that is what the planner shows and compares. Keeping it as
--  written avoids inventing a unit conversion nobody asked for.
-- ============================================================

alter table public.planner_items
  add column if not exists estimate text;

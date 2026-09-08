-- ============================================================
--  Migration 014: checklist mode
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
-- ============================================================

-- A task's description is either free text (as before) or a shopping-list
-- style checklist - never both at once, so one flag says which the row
-- should be read as.
alter table public.planner_items
  add column if not exists notes_mode text not null default 'text' check (notes_mode in ('text', 'checklist')),
  add column if not exists checklist jsonb not null default '[]'::jsonb;

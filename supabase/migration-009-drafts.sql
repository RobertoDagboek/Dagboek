-- ============================================================
--  Migration 009: reminders caught while dictating
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  Saying "remind me to ..." in a diary entry creates a planner item that is
--  not finished yet - a draft, waiting the way an unsent mail waits. It stays
--  out of the real lists until you confirm it, so a misheard sentence can
--  never quietly become a task you think you wrote.
-- ============================================================

alter table public.planner_items
  add column if not exists draft boolean not null default false,
  add column if not exists source text,        -- 'diary' when caught while dictating
  add column if not exists heard text;         -- the sentence it came from

create index if not exists planner_drafts_idx
  on public.planner_items (user_id)
  where draft;

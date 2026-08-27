-- ============================================================
--  Migration 011: priority becomes the Eisenhower matrix
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  Was a single scale (1 high, 2 normal, 3 low). Now it is the quadrant, in
--  the order the matrix is normally read:
--
--    1  Do        urgent      and important
--    2  Schedule  not urgent  but important
--    3  Delegate  urgent      but not important
--    4  Delete    neither
--
--  Still a plain ascending sort. Only the meaning changed, so old rows carry
--  over: high -> Do, normal -> Schedule, and low -> Delete rather than
--  Delegate, since "low" meant unimportant, not someone else's job.
-- ============================================================

update public.planner_items set priority = 4 where priority = 3;

alter table public.planner_items
  alter column priority set default 2;

alter table public.planner_items
  drop constraint if exists planner_priority_check;

alter table public.planner_items
  add constraint planner_priority_check check (priority between 1 and 4);

-- ============================================================
--  Dagboek migrasie 005: die beplanner
--  Migration 005: the planner (tasks, ongoing projects, goals)
--
--  Plak in: Supabase → SQL Editor → New query → Run
--  Veilig om meer as een keer te loop / safe to run more than once.
--
--  Een tabel hou al drie soorte, net soos die oorspronklike app se een lys:
--    task     - iets wat op 'n dag gedoen word (kan herhaal)
--    ongoing  - 'n projek wat aanhou; jy teken vordering aan
--    goal     - iets met 'n sperdatum
-- ============================================================

create table if not exists public.planner_items (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('task', 'ongoing', 'goal')),
  title        text not null default '',
  notes        text default '',

  -- task
  entry_date   date,
  at_time      text,
  recurring    text default 'none',
  flagged      boolean default false,
  context      text,
  completed    boolean default false,
  last_done    date,
  goal_id      text,

  -- ongoing
  started_date date,
  touched_date date,

  -- goal
  deadline     date,

  -- both ongoing and goal
  finished       boolean default false,
  finished_date  date,

  sort_order   bigint default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists planner_user_kind_idx on public.planner_items (user_id, kind);
create index if not exists planner_user_date_idx on public.planner_items (user_id, entry_date);

alter table public.planner_items enable row level security;

drop policy if exists "own planner" on public.planner_items;
create policy "own planner" on public.planner_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.planner_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists planner_touch on public.planner_items;
create trigger planner_touch
  before update on public.planner_items
  for each row execute function public.planner_touch();

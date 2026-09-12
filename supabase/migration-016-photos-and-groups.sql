-- ============================================================
--  Migration 016: photos on tasks, and named groups for sharing
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
-- ============================================================

-- ---------- photos on tasks ----------
--
-- Not entry_photos: that table's entry_id is uuid (diary entries have
-- uuid ids), planner_items.id is text - they can't share a table. This
-- is a trimmed entry_photos - images only, no video/duration/poster_path,
-- since nothing here asked for video attachments on a task.

create table if not exists public.planner_item_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    text not null references public.planner_items (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path       text not null,
  width      int,
  height     int,
  bytes      bigint,
  mime       text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists planner_item_photos_item_idx on public.planner_item_photos (item_id);

alter table public.planner_item_photos enable row level security;

-- Same "who can touch this" rule the item itself already uses -
-- planner_role() is the security-definer function from migration 015.
drop policy if exists "see photos on items you belong to" on public.planner_item_photos;
create policy "see photos on items you belong to" on public.planner_item_photos
  for select
  using (public.planner_role(item_id) is not null);

drop policy if exists "add photos if you can edit the item" on public.planner_item_photos;
create policy "add photos if you can edit the item" on public.planner_item_photos
  for insert
  with check (public.planner_role(item_id) in ('owner', 'editor'));

drop policy if exists "remove photos if you can edit the item" on public.planner_item_photos;
create policy "remove photos if you can edit the item" on public.planner_item_photos
  for delete
  using (public.planner_role(item_id) in ('owner', 'editor'));

-- ---------- storage: task photos live under tasks/<item_id>/... ----------
--
-- Not the existing <user-id>/<date>/... convention (schema.sql) - that
-- one, and its policies, scope access to the uploader alone. A shared
-- task's photos need to be visible to every current member, not just
-- whoever uploaded them, so this is a distinct prefix with its own
-- policies keyed by item membership instead of by uploader.

drop policy if exists "task photos read" on storage.objects;
create policy "task photos read" on storage.objects
  for select using (
    bucket_id = 'dagboek'
    and (storage.foldername(name))[1] = 'tasks'
    and public.planner_role((storage.foldername(name))[2]) is not null
  );

drop policy if exists "task photos write" on storage.objects;
create policy "task photos write" on storage.objects
  for insert with check (
    bucket_id = 'dagboek'
    and (storage.foldername(name))[1] = 'tasks'
    and public.planner_role((storage.foldername(name))[2]) in ('owner', 'editor')
  );

drop policy if exists "task photos delete" on storage.objects;
create policy "task photos delete" on storage.objects
  for delete using (
    bucket_id = 'dagboek'
    and (storage.foldername(name))[1] = 'tasks'
    and public.planner_role((storage.foldername(name))[2]) in ('owner', 'editor')
  );

-- ---------- named groups, for sharing with several people at once ----------
--
-- A personal address book, not a new sharing primitive: sending to a
-- group just fans out to one ordinary invite per current member,
-- through the exact same accept/decline flow every invite already goes
-- through. Nothing here touches planner_item_members, planner_role(), or
-- respond_to_invite() - teaching the membership model itself about
-- "groups" would ripple through every policy built for sharing, for no
-- benefit an address book needs.

create table if not exists public.planner_groups (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists planner_groups_owner_idx on public.planner_groups (owner_user_id);

alter table public.planner_groups enable row level security;
drop policy if exists "own groups" on public.planner_groups;
create policy "own groups" on public.planner_groups
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- username is a snapshot for display only - the stored user_id is what
-- actually gets invited, so a later rename (or that name being reused by
-- someone else) can never misdirect a future send.
create table if not exists public.planner_group_members (
  group_id   uuid not null references public.planner_groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  username   text not null default '',
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.planner_group_members enable row level security;
-- References a *different* table (planner_groups), not itself - no
-- recursion risk, unlike planner_item_members' own select policy.
drop policy if exists "own group members" on public.planner_group_members;
create policy "own group members" on public.planner_group_members
  for all
  using (exists (select 1 from public.planner_groups g where g.id = group_id and g.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.planner_groups g where g.id = group_id and g.owner_user_id = auth.uid()));

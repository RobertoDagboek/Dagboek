-- ============================================================
--  Migration 015: sharing tasks between accounts
--
--  Paste into: Supabase -> SQL Editor -> New query -> Run
--  Safe to run more than once.
--
--  Before this, every table was locked to `auth.uid() = user_id` - accounts
--  were fully isolated islands. This migration moves planner_items from
--  "only its creator" to a proper membership model: who can see and change
--  each item, and at what level, lives in planner_item_members. Sharing
--  itself goes through an accept/decline invite (planner_invites) rather
--  than taking effect the moment it's sent - nothing lands on someone's
--  account without them saying yes.
--
--  Known gap, not fixed here: supabase/functions/send-push still schedules
--  reminder nudges by planner_items.user_id (the original creator) alone -
--  it does not know about planner_item_members. So a fully delegated task
--  will still nudge the person who gave it away, not the new owner, until
--  that function is taught to look up members instead. Sharing itself
--  (visibility, editing, the accept/decline flow) is unaffected; only the
--  scheduled "it's time" push reminders have this blind spot.
-- ============================================================

-- ---------- who can touch each item, and how ----------
--
--   owner   made it (or was delegated it away from - see 'delegate' below).
--           Full control, including managing who else has it.
--   editor  can edit and complete it, cannot delete it or manage sharing.
--   viewer  can see it and its progress, cannot change anything.

create table if not exists public.planner_item_members (
  item_id    text not null references public.planner_items (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists planner_members_user_idx on public.planner_item_members (user_id);
create index if not exists planner_members_item_idx on public.planner_item_members (item_id);

-- Backfill: every item that already exists gets its creator as owner.
insert into public.planner_item_members (item_id, user_id, role)
select id, user_id, 'owner' from public.planner_items
on conflict (item_id, user_id) do nothing;

alter table public.planner_item_members enable row level security;

-- A policy on planner_item_members cannot query planner_item_members itself
-- in its own USING clause - Postgres detects that as infinite recursion and
-- refuses to run it (this is what broke the first version of this migration:
-- "infinite recursion detected in policy for relation planner_item_members").
-- Routing the membership check through a security-definer function sidesteps
-- it: the function runs as its owner, who (being the table's owner too) is
-- exempt from RLS, so the check inside it does not re-trigger the policy.
-- Every other policy below that needs to know "am I on this item, and as
-- what" goes through the same function, for the same reason.
create or replace function public.planner_role(item_id_in text)
returns text
language sql security definer stable set search_path = public
as $$
  select role from public.planner_item_members
  where item_id = item_id_in and user_id = auth.uid();
$$;

revoke all on function public.planner_role(text) from public;
grant execute on function public.planner_role(text) to authenticated;

-- Only select is exposed to clients directly - who has an item and at what
-- role goes through respond_to_invite() below, never a raw insert/update
-- from the browser. That is what stops one account handing itself another
-- person's task, or downgrading someone else's access.
drop policy if exists "see members of your items" on public.planner_item_members;
create policy "see members of your items" on public.planner_item_members
  for select
  using (
    user_id = auth.uid()
    or public.planner_role(item_id) is not null
  );

-- ---------- planner_items: membership replaces "only its creator" ----------

drop policy if exists "own planner" on public.planner_items;

drop policy if exists "planner select" on public.planner_items;
create policy "planner select" on public.planner_items
  for select
  using (public.planner_role(id) is not null);

drop policy if exists "planner insert" on public.planner_items;
create policy "planner insert" on public.planner_items
  for insert
  with check (user_id = auth.uid());

drop policy if exists "planner update" on public.planner_items;
create policy "planner update" on public.planner_items
  for update
  using (public.planner_role(id) in ('owner', 'editor'))
  with check (public.planner_role(id) in ('owner', 'editor'));

drop policy if exists "planner delete" on public.planner_items;
create policy "planner delete" on public.planner_items
  for delete
  using (public.planner_role(id) = 'owner');

-- Creating an item makes you its owner automatically - the client never
-- writes planner_item_members directly.
create or replace function public.planner_items_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.planner_item_members (item_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (item_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists planner_items_after_insert on public.planner_items;
create trigger planner_items_after_insert
  after insert on public.planner_items
  for each row execute function public.planner_items_after_insert();

-- ---------- finding someone to share with, by name only ----------
-- Same shape as slug_for() in migration 004: you have to already know the
-- exact username, and there is no way to list or browse accounts.

create or replace function public.user_id_for_handle(name text)
returns uuid
language sql security definer stable set search_path = public
as $$
  select h.user_id
  from public.handles h
  where h.username = lower(btrim(name))
  limit 1;
$$;

revoke all on function public.user_id_for_handle(text) from public;
grant execute on function public.user_id_for_handle(text) to authenticated;

-- ---------- notifications for invite events ----------
-- Not a push sent right away from the browser - a row here that the
-- existing once-a-minute cron job also flushes, the same pipeline already
-- delivering reminders. Nothing here is client-writable: it only fills up
-- via triggers/security-definer functions, and is only ever read by the
-- send-push function using the service role.

create table if not exists public.notification_outbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  url        text not null default './',
  created_at timestamptz not null default now(),
  sent       boolean not null default false
);
create index if not exists notification_outbox_unsent_idx on public.notification_outbox (user_id) where not sent;

alter table public.notification_outbox enable row level security;
-- Deliberately no policies at all: nobody needs to read their own outbox,
-- and the only writers are security-definer functions/triggers.

-- ---------- invites: sharing waits for an accept ----------

-- item_title/from_username/to_username are a snapshot taken the moment the
-- invite is sent (see the trigger below) - not a live join. A recipient has
-- no membership row yet (that only exists once they accept), so without a
-- snapshot they could not even see what they were being asked to accept.
create table if not exists public.planner_invites (
  id            uuid primary key default gen_random_uuid(),
  item_id       text not null references public.planner_items (id) on delete cascade,
  item_title    text not null default '',
  from_user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_username text not null default '',
  to_user_id    uuid not null references auth.users (id) on delete cascade,
  to_username   text not null default '',
  share_kind    text not null check (share_kind in ('delegate', 'collaborate', 'view')),
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
create index if not exists planner_invites_to_idx on public.planner_invites (to_user_id, status);
create index if not exists planner_invites_from_idx on public.planner_invites (from_user_id);

-- One pending invite per (item, recipient) at a time - a double-tap on
-- "Send invite" (or resending while one is still waiting) would otherwise
-- quietly create two, both showing up in their Inbox for the same task.
-- Once answered, the row's status changes and this stops applying, so a
-- fresh invite can always be sent after a decline.
create unique index if not exists planner_invites_one_pending_idx
  on public.planner_invites (item_id, to_user_id)
  where status = 'pending';

create or replace function public.planner_invites_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select title into new.item_title from public.planner_items where id = new.item_id;
  select username into new.from_username from public.handles where user_id = new.from_user_id;
  select username into new.to_username from public.handles where user_id = new.to_user_id;
  return new;
end $$;

drop trigger if exists planner_invites_before_insert on public.planner_invites;
create trigger planner_invites_before_insert
  before insert on public.planner_invites
  for each row execute function public.planner_invites_before_insert();

alter table public.planner_invites enable row level security;

drop policy if exists "see your own invites" on public.planner_invites;
create policy "see your own invites" on public.planner_invites
  for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "send invites for items you own" on public.planner_invites;
create policy "send invites for items you own" on public.planner_invites
  for insert
  with check (
    from_user_id = auth.uid()
    and to_user_id <> auth.uid()
    and public.planner_role(item_id) = 'owner'
  );

-- Cancelling is just deleting your own still-pending invite.
drop policy if exists "cancel your pending invite" on public.planner_invites;
create policy "cancel your pending invite" on public.planner_invites
  for delete
  using (from_user_id = auth.uid() and status = 'pending');

-- Accept/decline is deliberately not a plain client update: it has to also
-- grant (and for delegate, revoke) access in planner_item_members, and that
-- has to happen as one all-or-nothing step.
create or replace function public.respond_to_invite(invite_id uuid, accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  inv public.planner_invites;
begin
  select * into inv from public.planner_invites where id = invite_id for update;
  if not found then raise exception 'invite not found'; end if;
  if inv.to_user_id <> auth.uid() then raise exception 'not your invite'; end if;
  if inv.status <> 'pending' then raise exception 'invite already answered'; end if;

  update public.planner_invites
    set status = case when accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = invite_id;

  if accept then
    if inv.share_kind = 'delegate' then
      -- A full transfer, not just a downgrade: the delegate becomes the new
      -- owner, because it is genuinely theirs now (they need to be able to
      -- delete it or hand it off again). Leaving no one as owner would make
      -- the item permanently stuck - nobody able to ever delete or re-share
      -- it again, since both of those require role = 'owner'.
      update public.planner_item_members set role = 'viewer'
        where item_id = inv.item_id and user_id = inv.from_user_id;
      insert into public.planner_item_members (item_id, user_id, role)
        values (inv.item_id, inv.to_user_id, 'owner')
        on conflict (item_id, user_id) do update set role = excluded.role;
    else
      insert into public.planner_item_members (item_id, user_id, role)
        values (inv.item_id, inv.to_user_id, case when inv.share_kind = 'view' then 'viewer' else 'editor' end)
        on conflict (item_id, user_id) do update set role = excluded.role;
    end if;
  end if;

  insert into public.notification_outbox (user_id, title, body, url)
  values (
    inv.from_user_id,
    (case when accept then coalesce(nullif(inv.to_username, ''), 'Someone') || ' accepted'
          else coalesce(nullif(inv.to_username, ''), 'Someone') || ' declined' end),
    coalesce(nullif(inv.item_title, ''), 'a task'),
    './?task=' || inv.item_id
  );
end $$;

revoke all on function public.respond_to_invite(uuid, boolean) from public;
grant execute on function public.respond_to_invite(uuid, boolean) to authenticated;

create or replace function public.planner_invites_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  verb text;
begin
  verb := case new.share_kind
    when 'delegate' then 'wants to delegate'
    when 'collaborate' then 'wants to collaborate on'
    else 'wants to share' end;

  insert into public.notification_outbox (user_id, title, body, url)
  values (
    new.to_user_id,
    coalesce(nullif(new.from_username, ''), 'Someone') || ' ' || verb,
    coalesce(nullif(new.item_title, ''), 'a task'),
    './?invite=1'
  );
  return new;
end $$;

drop trigger if exists planner_invites_after_insert on public.planner_invites;
create trigger planner_invites_after_insert
  after insert on public.planner_invites
  for each row execute function public.planner_invites_after_insert();

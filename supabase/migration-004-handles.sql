-- ============================================================
--  Dagboek migrasie 004: gebruikersname wat jy kan verander
--  Migration 004: renameable usernames
--
--  Plak in: Supabase → SQL Editor → New query → Run
--  Veilig om meer as een keer te loop / safe to run more than once.
--
--  WAAROM / WHY
--  Die aanmeld-e-pos was <naam>@dagboek.local, so 'n naamverandering het 'n
--  e-posverandering beteken - en Supabase weier dit ronduit op hierdie projek.
--  Nou kry elke rekening 'n vaste "slug" wat nooit verander nie. Die e-pos en
--  wagwoord kom van die slug af; die gebruikersnaam wys net daarheen. Naam
--  verander = een ry opdateer.
-- ============================================================

create table if not exists public.handles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username   text not null unique,
  slug       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.handles enable row level security;

drop policy if exists "own handle" on public.handles;
create policy "own handle" on public.handles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- naam -> slug, sonder om die tabel oop te maak ----------
-- Jy moet die naam reeds ken om iets te kry. Niemand kan 'n lys trek nie,
-- want die tabel self bly toe vir anon.

create or replace function public.slug_for(name text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select h.slug
  from public.handles h
  where h.username = lower(btrim(name))
  limit 1;
$$;

revoke all on function public.slug_for(text) from public;
grant execute on function public.slug_for(text) to anon, authenticated;

-- ---------- hou name netjies ----------

create or replace function public.handles_before_write()
returns trigger language plpgsql as $$
begin
  new.username := lower(btrim(new.username));
  new.updated_at := now();
  if new.username = '' then
    raise exception 'username may not be empty';
  end if;
  return new;
end $$;

drop trigger if exists handles_before_write on public.handles;
create trigger handles_before_write
  before insert or update on public.handles
  for each row execute function public.handles_before_write();

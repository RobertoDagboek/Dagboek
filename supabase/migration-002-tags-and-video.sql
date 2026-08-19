-- ============================================================
--  Dagboek migrasie 002: etikette (tags), beter soek, en videos
--  Migration 002: tags, better search, and video
--
--  Plak in: Supabase → SQL Editor → New query → Run
--  Veilig om meer as een keer te loop / safe to run more than once.
-- ============================================================

-- ---------- 1. etikette op elke inskrywing ----------

alter table public.entries
  add column if not exists tags text[] not null default '{}';

create index if not exists entries_tags_idx
  on public.entries using gin (tags);

-- ---------- 2. een kolom om in te soek ----------
-- Teks + plek + etikette saam in een veld, sodat een soektog alles dek.
-- Dit word deur die sneller hieronder onderhou, nie deur die app nie.

alter table public.entries
  add column if not exists search_blob text;

create extension if not exists pg_trgm;

create index if not exists entries_search_idx
  on public.entries using gin (search_blob gin_trgm_ops);

create or replace function public.entries_before_write()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.search_blob := lower(
    coalesce(new.text, '') || ' ' ||
    coalesce(new.place, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end $$;

drop trigger if exists entries_touch      on public.entries;
drop trigger if exists entries_before_write on public.entries;

create trigger entries_before_write
  before insert or update on public.entries
  for each row execute function public.entries_before_write();

-- Vul bestaande rye in / backfill what is already there.
update public.entries set updated_at = updated_at;

-- ---------- 3. videos langs die fotos ----------
-- entry_photos hou nou beide. `kind` se watter een dit is.

alter table public.entry_photos
  add column if not exists kind text not null default 'photo',
  add column if not exists duration real,
  add column if not exists poster_path text,
  add column if not exists bytes bigint;

alter table public.entry_photos
  drop constraint if exists entry_photos_kind_check;

alter table public.entry_photos
  add constraint entry_photos_kind_check check (kind in ('photo', 'video'));

-- ---------- 4. hoeveel plek gebruik jy? ----------
-- Die gratis Supabase-plan gee 1GB. Hierdie wys wat reeds op is.

create or replace function public.storage_used()
returns bigint
language sql
security invoker
stable
as $$
  select coalesce(sum(bytes), 0)::bigint
  from public.entry_photos
  where user_id = auth.uid();
$$;

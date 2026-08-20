-- ============================================================
--  Dagboek migrasie 003: onderwerpe + groot videos
--  Migration 003: topics per entry + videos larger than 50MB
--
--  Plak in: Supabase → SQL Editor → New query → Run
--  Loop migrasie 002 eers as jy dit nog nie gedoen het nie.
--  Veilig om meer as een keer te loop / safe to run more than once.
-- ============================================================

-- ---------- 1. elke dag se inskrywing in onderwerpe ----------
-- { "werk": "...", "gevoel": "...", ... }  - sleutels kom uit js/topics.js

alter table public.entries
  add column if not exists sections jsonb not null default '{}'::jsonb;

-- ---------- 2. soek moet ook die onderwerpe dek ----------

create or replace function public.entries_before_write()
returns trigger language plpgsql as $$
declare
  section_text text;
begin
  new.updated_at := now();

  select coalesce(string_agg(value, ' '), '')
    into section_text
    from jsonb_each_text(coalesce(new.sections, '{}'::jsonb));

  new.search_blob := lower(
    coalesce(new.text, '') || ' ' ||
    coalesce(new.place, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
    section_text
  );
  return new;
end $$;

drop trigger if exists entries_before_write on public.entries;
create trigger entries_before_write
  before insert or update on public.entries
  for each row execute function public.entries_before_write();

-- Vul bestaande rye in / backfill.
update public.entries set updated_at = updated_at;

-- ---------- 3. videos groter as 50MB ----------
-- Supabase se gratis plan laat 50MB per lêer toe. 'n Groter video word in
-- stukke gestoor (path, path.p1, path.p2 ...) en weer heel gemaak wanneer jy
-- dit speel. part_count = 1 beteken 'n gewone enkele lêer.

alter table public.entry_photos
  add column if not exists part_count int not null default 1,
  add column if not exists mime text;

alter table public.entry_photos
  drop constraint if exists entry_photos_parts_check;

alter table public.entry_photos
  add constraint entry_photos_parts_check check (part_count >= 1);

-- `bytes` is die volle grootte van die video, nie een stuk nie, so
-- storage_used() bly korrek.

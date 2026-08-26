-- ============================================================
--  Dagboek migrasie 006: presiese plekke
--  Migration 006: precise locations, and a location per photo
--
--  Plak in: Supabase → SQL Editor → New query → Run
--  Veilig om meer as een keer te loop / safe to run more than once.
-- ============================================================

-- Hoe akkuraat was die GPS-lesing, in meter. Sonder dit weet jy nie of
-- "Riebeeck-Kasteel" op 8 meter of op 2 kilometer af was nie.
alter table public.entries
  add column if not exists accuracy int;

-- 'n Foto kan sy eie plek hê, los van die dag s'n: waar die foto geneem is,
-- nie waar jy was toe jy die inskrywing geskryf het nie.
alter table public.entry_photos
  add column if not exists place text,
  add column if not exists accuracy int;

create index if not exists photos_latlng_idx
  on public.entry_photos (user_id)
  where lat is not null;

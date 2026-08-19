-- ============================================================
--  Dagboek - Supabase skema
--  Plak hierdie hele lêer in: Supabase → jou projek → SQL Editor → Run
--  Paste this whole file into: Supabase → your project → SQL Editor → Run
-- ============================================================

-- ---------- tabelle ----------

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date  date not null,
  text        text,
  audio_path  text,
  lat         double precision,
  lng         double precision,
  place       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table if not exists public.entry_photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id   uuid not null references public.entries (id) on delete cascade,
  path       text not null,
  width      int,
  height     int,
  taken_at   timestamptz,
  lat        double precision,
  lng        double precision,
  sort       int default 0,
  created_at timestamptz not null default now()
);

create index if not exists entries_user_date_idx on public.entries (user_id, entry_date desc);
create index if not exists photos_entry_idx      on public.entry_photos (entry_id);

-- ---------- row level security: net jy sien jou eie dagboek ----------

alter table public.entries       enable row level security;
alter table public.entry_photos  enable row level security;

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own photos" on public.entry_photos;
create policy "own photos" on public.entry_photos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- storage: private bucket vir klank + fotos ----------

insert into storage.buckets (id, name, public)
values ('dagboek', 'dagboek', false)
on conflict (id) do nothing;

-- Lêerpaaie is altyd <user-id>/<datum>/<naam>, so die eerste vouer moet
-- die aangemelde gebruiker se id wees.
drop policy if exists "dagboek read own"   on storage.objects;
drop policy if exists "dagboek write own"  on storage.objects;
drop policy if exists "dagboek update own" on storage.objects;
drop policy if exists "dagboek delete own" on storage.objects;

create policy "dagboek read own" on storage.objects
  for select using (
    bucket_id = 'dagboek' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dagboek write own" on storage.objects
  for insert with check (
    bucket_id = 'dagboek' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dagboek update own" on storage.objects
  for update using (
    bucket_id = 'dagboek' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dagboek delete own" on storage.objects
  for delete using (
    bucket_id = 'dagboek' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- updated_at outomaties ----------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch
  before update on public.entries
  for each row execute function public.touch_updated_at();

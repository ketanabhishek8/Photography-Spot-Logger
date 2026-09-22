-- Photography Spot Logger — database schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.

-- PostGIS powers the "spots near me" radius search in Phase 6.
create extension if not exists postgis;

create table if not exists spots (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  latitude    double precision not null check (latitude  between  -90 and  90),
  longitude   double precision not null check (longitude between -180 and 180),
  photo_path  text not null,              -- object path inside the spot-photos bucket
  best_time   text,                       -- e.g. 'Golden hour', 'Blue hour'
  attribution text,                       -- required by the CC licenses on seeded photos
  license     text,
  source_url  text,
  is_seed     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Derived geography column so proximity search is a real spatial query, not
-- a bounding-box approximation done in JavaScript. STORED keeps it in sync
-- automatically whenever latitude/longitude change.
alter table spots drop column if exists geog;
alter table spots add column geog geography(Point, 4326)
  generated always as (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) stored;

create index if not exists spots_geog_idx    on spots using gist (geog);
create index if not exists spots_created_idx on spots (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Public read and public insert (the app has no sign-in), but deliberately NO
-- update or delete policy: with RLS on, anything without a policy is denied,
-- so an anonymous visitor cannot wipe or vandalise the seeded spots.
alter table spots enable row level security;

drop policy if exists "public read"   on spots;
drop policy if exists "public insert" on spots;

create policy "public read"   on spots for select to anon, authenticated using (true);
create policy "public insert" on spots for insert to anon, authenticated with check (true);

-- Table-level grants. Projects created with "Automatically expose new tables"
-- turned off (the more secure setting) do not grant these by default, and
-- without them RLS policies above are never even reached - Postgres checks
-- the grant first. Explicit here so the schema works regardless of that
-- project setting. Deliberately no update/delete grant, matching the
-- policies above.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert on spots to anon, authenticated;

-- service_role bypasses RLS but still needs the base table grant when
-- "Automatically expose new tables" was off at project creation - it is used
-- server-side by scripts/seed.mjs and app/api/spots/route.ts for writes.
grant all on spots to service_role;

-- ---------------------------------------------------------------------------
-- Proximity search
-- ---------------------------------------------------------------------------
-- Returns spots within radius_m metres of (lat, lng), nearest first.
-- Exposed to the browser via supabase.rpc('spots_within_radius', {...}).
create or replace function spots_within_radius(
  lat      double precision,
  lng      double precision,
  radius_m double precision
)
returns setof spots
language sql
stable
as $$
  select *
  from spots
  where ST_DWithin(geog, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radius_m)
  order by ST_Distance(geog, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography);
$$;

-- Function privileges are separate from table grants above - needed for the
-- same reason (works with "Automatically expose new tables" off).
grant execute on function spots_within_radius(double precision, double precision, double precision)
  to anon, authenticated;

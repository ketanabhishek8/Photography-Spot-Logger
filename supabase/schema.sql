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

-- Identifies which browser created a spot, so that same browser (no account
-- needed) can edit/delete it later. Set server-side only from an httpOnly
-- cookie - client JS never reads or sends it directly. Must never be
-- readable through the public anon/authenticated role: RLS is row-level
-- only, so the column-level grant below (not a policy) is what actually
-- keeps it private - same "grants vs RLS" gotcha as the table-level one
-- further down, one level deeper.
-- `if not exists` here (rather than inside the CREATE TABLE above) because
-- that block only runs for a brand-new table - existing deployments need
-- this to run as its own statement to pick up the column.
alter table spots add column if not exists owner_token text;

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

-- No update/delete policy: with RLS on, anything without a policy is
-- denied, so an anonymous visitor cannot wipe or vandalise spots directly.
-- Edit/delete of your own spot goes through app/api/spots/[id]/route.ts,
-- which uses the service_role key (bypasses RLS entirely) and does the
-- ownership check itself by matching owner_token - see that file.

-- Table-level grants. Projects created with "Automatically expose new tables"
-- turned off (the more secure setting) do not grant these by default, and
-- without them RLS policies above are never even reached - Postgres checks
-- the grant first. Explicit here so the schema works regardless of that
-- project setting.
grant usage on schema public to anon, authenticated, service_role;
grant insert on spots to anon, authenticated;

-- Revoke the old whole-table select grant before installing the narrower
-- one below - GRANT is additive, so without this explicit revoke, the
-- broader grant this same file applied on an earlier run would still let
-- anon/authenticated read owner_token regardless of the column list below.
revoke select on spots from anon, authenticated;

-- Column-level select grant, deliberately omitting owner_token. RLS is
-- row-level only - it doesn't hide a column within a visible row - so
-- without this, anyone with the (public, shipped-in-the-bundle) anon key
-- could read every owner_token straight from the REST API
-- (…/rest/v1/spots?select=owner_token) and forge ownership of any spot.
-- `geog` is included even though it's not part of the app's Spot type: it
-- isn't sensitive (derived from the already-public lat/long), and
-- spots_within_radius() below needs SELECT on it to evaluate ST_DWithin,
-- even though it never appears in that function's actual output.
grant select (
  id, name, description, latitude, longitude, photo_path, best_time,
  attribution, license, source_url, is_seed, created_at, geog
) on spots to anon, authenticated;

-- service_role bypasses RLS and column grants but still needs the base
-- table grant when "Automatically expose new tables" was off at project
-- creation - it is used server-side by scripts/seed.mjs and every route in
-- app/api/spots/ for writes (including reading owner_token to authorize
-- edit/delete, which anon/authenticated deliberately cannot do above).
grant all on spots to service_role;

-- ---------------------------------------------------------------------------
-- Proximity search
-- ---------------------------------------------------------------------------
-- Returns spots within radius_m metres of (lat, lng), nearest first.
-- Exposed to the browser via supabase.rpc('spots_within_radius', {...}).
-- Explicit output columns (rather than the old `returns setof spots`)
-- deliberately exclude owner_token: this runs as the caller (anon), and
-- `create or replace` can't change a function's return type in place, so a
-- drop is needed when moving off `setof spots`.
drop function if exists spots_within_radius(double precision, double precision, double precision);

create function spots_within_radius(
  lat      double precision,
  lng      double precision,
  radius_m double precision
)
returns table (
  id          uuid,
  name        text,
  description text,
  latitude    double precision,
  longitude   double precision,
  photo_path  text,
  best_time   text,
  attribution text,
  license     text,
  source_url  text,
  is_seed     boolean,
  created_at  timestamptz
)
language sql
stable
as $$
  select id, name, description, latitude, longitude, photo_path, best_time,
         attribution, license, source_url, is_seed, created_at
  from spots
  where ST_DWithin(geog, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radius_m)
  order by ST_Distance(geog, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography);
$$;

-- Function privileges are separate from table grants above - needed for the
-- same reason (works with "Automatically expose new tables" off).
grant execute on function spots_within_radius(double precision, double precision, double precision)
  to anon, authenticated;

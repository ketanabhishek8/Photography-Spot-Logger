# Mumbai Photo Spots

**Live:** [photography-spot-logger.vercel.app](https://photography-spot-logger.vercel.app)

A photography-spot logger: browse photogenic locations on a map, and log new ones
with a photo and coordinates.

Built as a cloud mini-project, so each tier maps onto a distinct cloud service:

| Tier | Service | What it holds |
|---|---|---|
| Object storage | Supabase Storage (`spot-photos` bucket) | the photo for each spot |
| Database | Supabase Postgres + PostGIS | name, description, latitude/longitude, attribution |
| Frontend | Next.js 16 + React 19 + Leaflet/OpenStreetMap | the map UI |

The app ships with **14 real Mumbai spots** pre-loaded — Gateway of India, Marine Drive,
CSMT, Elephanta, Kanheri and more — seeded with freely-licensed photographs from Wikimedia
Commons.

---

## Architecture

```
                    ┌───────────────────────────────┐
  Browser  ────────▶│  Next.js (App Router)         │
  Leaflet map       │                               │
                    │  app/page.tsx  (Server Comp.) │──┐ anon key, RLS-checked read
                    │  app/api/spots (Route Handler)│  │
                    └───────────────┬───────────────┘  │
                                    │ service-role key │
                                    │ (server only)    │
                                    ▼                  ▼
                      ┌───────────────────┐   ┌──────────────────┐
                      │ Supabase Storage  │   │ Supabase Postgres│
                      │   spot-photos/    │   │   spots + PostGIS│
                      └───────────────────┘   └──────────────────┘
```

Reads use the public anon key and pass through Row Level Security. Writes go through the
server route handler, so the service-role key never reaches the browser.

---

## Setup

### 1. Create a Supabase project

Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and create a project.

### 2. Run the schema

Open **SQL Editor → New query**, paste in the contents of [`supabase/schema.sql`](supabase/schema.sql)
and run it. That creates the `spots` table, the PostGIS geography column, the RLS policies
and the `spots_within_radius()` function.

### 3. Create the storage bucket

**Storage → New bucket**, name it `spot-photos`, and tick **Public bucket**.

### 4. Add your keys

```bash
cp .env.example .env.local
```

Fill it in from **Project Settings → API Keys**:

| Variable | Where it's used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser reads (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** — uploads and inserts |

> Newer Supabase projects label these `publishable` / `secret` (`sb_publishable_…`,
> `sb_secret_…`) rather than `anon` / `service_role`. Either works.
>
> Never prefix the service-role key with `NEXT_PUBLIC_` — that would publish an
> admin database key to every visitor.

### 5. Seed the Mumbai spots

Check the manifest downloads cleanly first (no Supabase needed):

```bash
npm run seed:check
```

Then write it to your project:

```bash
npm run seed
```

Expect 14 `ok` lines. Re-running is safe — `name` is unique and the script upserts.

### 6. Run it

```bash
npm run dev
```

Open <http://localhost:3000>.

---

## How it works

**Browsing.** `app/page.tsx` is a Server Component that reads every spot with the anon key
and hands them to `MapExperience`. Leaflet touches `window` at import time, so the map is
loaded through `dynamic(..., { ssr: false })` from inside a Client Component — `ssr: false`
is not permitted in a Server Component in the App Router.

**Logging a spot.** Click *Log a spot*, then either drop a pin manually or just choose a
photo — `AddSpotForm.tsx` reads GPS EXIF data from the file (via `exifr`) and pre-fills the
pin automatically if it finds any, falling back to a manual map click otherwise. The browser
then POSTs multipart form data to `app/api/spots/route.ts`, which validates (type, 8 MB cap,
coordinate range), uploads the image to Storage, then inserts the row. If the insert fails,
the just-uploaded object is deleted so no orphan is left behind.

**Near me.** The *Near me* button asks the browser for your location and calls the
`spots_within_radius` Postgres function, which uses PostGIS `ST_DWithin` against a GiST
index — the proximity search runs in the database, not in JavaScript.

**Search/filter.** The sidebar's search box and best-time dropdown filter the
already-loaded spots client-side (combines with "Near me"). The dropdown's options are
derived from whatever `best_time` values are actually present in the data, not from the
add-form's shorter preset list — the seeded spots use values like "Sunset" that aren't
in that list.

**Attribution.** The seeded photos are CC BY / CC BY-SA / CC0 / FAL licensed and all require
credit, so the seeder stores the author and licence per row and the detail page displays them.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build + typecheck |
| `npm run seed` | download Commons photos → Storage → Postgres |
| `npm run seed:check` | dry run: verify the manifest without writing |
| `npm run lint` | eslint |

---

## Notes and limits

- **No authentication.** Anyone can add a spot. RLS allows public `select` and `insert` but
  grants no `update` or `delete`, so the seeded spots cannot be edited or wiped anonymously.
- **Map tiles** come from MapTiler (`NEXT_PUBLIC_TILE_URL`/`NEXT_PUBLIC_TILE_ATTRIBUTION` —
  see `.env.example`), free tier, no credit card, key restricted by HTTP origin. Falls back
  to OpenStreetMap's own tile server if those env vars are unset, so cloning the repo
  without a MapTiler key still works, just plainer. Whichever provider is active, the URL
  is swappable with no code change.
- **Uploads** are capped at 8 MB, then downscaled server-side to 1600px wide with `sharp`
  before being stored (EXIF-oriented first, so re-encoded photos don't come out sideways).
- **Rate limiting** on `/api/spots` is a best-effort in-memory counter (10 requests per
  caller per 10 minutes) — see the comment in `lib/rateLimit.ts` for why this isn't a real
  distributed guarantee on Vercel's serverless functions, and what to reach for
  (`@upstash/ratelimit`) if that's ever actually needed.

## Deploying

Deployed on Vercel from the GitHub repo, with the three environment variables set in
project settings (`SUPABASE_SERVICE_ROLE_KEY` as a plain, non-`NEXT_PUBLIC_` variable — no
Vercel↔Supabase marketplace integration needed, since the app just reads plain env vars).
Seeding only ran once, locally, against the shared Supabase project — Vercel serves
whatever is already in that project, it doesn't need its own seed run.

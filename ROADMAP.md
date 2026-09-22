# Roadmap

Where the app stands and what's left, in the order we'll tackle it. Each stage has a
"done when" so we know when to move on. Check items off as we go.

**Current state:** app builds and lints clean, all pages/routes/components exist, the
seed manifest is verified against Wikimedia (14/14 photos fetch correctly), and the map,
add-spot form and API validation have all been exercised in-browser. Nothing has touched
a real Supabase project yet — that's Stage 0.

---

## Stage 0 — Get a real Supabase project connected
*Blocks everything below. Needs your Supabase account.*

- [ ] Create the Supabase project at supabase.com/dashboard
- [ ] Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor
- [ ] Create the `spot-photos` public storage bucket
- [ ] Copy `.env.example` → `.env.local`, fill in the three keys
- [ ] `npm run seed` — write all 14 Mumbai spots for real
- [ ] `npm run dev` — confirm the map opens populated, not the setup guide

**Done when:** the map shows 14 real markers over Mumbai with working photo thumbnails.

---

## Stage 1 — End-to-end verification against the real project
*Everything in the last session was tested against placeholder/mock data. This re-checks it for real.*

- [ ] Open a few spot popups — thumbnails load from the actual Supabase public URL
- [ ] Eyeball the 4 spots whose coordinates I estimated rather than pulled from
      Wikipedia (Flora Fountain, Bandra Fort, Dhobi Ghat, Worli Fort) — confirm the pins
      land on the right landmarks, nudge coordinates in `scripts/mumbai-spots.json` and
      re-run `npm run seed` if not
- [ ] Add a real spot end-to-end (pick location, upload a photo, save) — confirm it
      appears on the map and in Postgres/Storage
- [ ] Try "Near me" with real geolocation — confirm the PostGIS radius query returns
      sensible results
- [ ] Re-run the key-leak check (`grep -rl SUPABASE_SERVICE_ROLE_KEY .next/static/`)
      after a real build, now that real keys are in play

**Done when:** every feature has been used against live data, not mocks.

---

## Stage 2 — Deploy it somewhere reachable
*Right now it only runs on localhost.*

- [ ] Push the repo to GitHub
- [ ] Import into Vercel, set the three env vars (service-role key as a plain server var)
- [ ] Confirm the deployed build shows the same 14 spots (seeding is a one-time local
      step against the shared Supabase project — no need to re-seed from Vercel)
- [ ] Smoke-test add-a-spot on the deployed URL, not just localhost

**Done when:** you have a public URL you can hand to someone else.

---

## Stage 3 — Harden it
*Things that are fine for a demo but would bite in real use.*

- [ ] **Image compression on upload.** User photos go into Storage unmodified today
      (capped at 8 MB but not resized). Add `sharp` in `app/api/spots/route.ts` to
      downscale to ~1600px, matching what the seeder already does for Commons photos.
- [ ] **Rate-limit `/api/spots`.** Nothing currently stops someone from scripting
      hundreds of inserts — there's no auth and no throttle. Options: Vercel's built-in
      rate limiting, or a simple per-IP counter.
- [ ] **OSM tile usage.** `SpotMap.tsx` hits `tile.openstreetmap.org` directly, which is
      fine at demo traffic but violates OSM's usage policy at any real scale. Move to a
      hosted provider (MapTiler, Carto) before sharing widely.
- [ ] **Error boundaries.** A failed Supabase call in `MapExperience` currently just
      shows a note in the sidebar; a thrown error elsewhere would show Next's default
      error page. Add an `app/error.tsx`.

**Done when:** the app survives someone actively poking at it, not just the happy path.

---

## Stage 4 — Feature backlog
*Roughly in order of value for effort. Pick and choose.*

- [ ] **EXIF auto-fill.** Read GPS coordinates out of an uploaded photo (via `exifr`) and
      pre-fill the map pin instead of requiring a manual click. The most
      "photography-native" feature on this list.
- [ ] **Gallery/list view.** A grid toggle alongside the map, useful once spot count grows
      past what's comfortable to scan in the sidebar list.
- [ ] **Marker clustering.** Not needed at 14 spots; worth adding once user-submitted
      spots push the count into the hundreds (`react-leaflet-cluster` or similar).
- [ ] **Edit/delete own spots.** Currently impossible for anyone, including the person who
      logged it — RLS only grants `select` + `insert`. Needs either a signed
      edit-token-per-spot scheme, or real auth (see below).
- [ ] **Search/filter.** By name, best-time-of-day, or distance from a searched place.

---

## Stage 5 — Optional: add real auth
*Explicitly skipped in the original build ("open logging"). Only do this if you actually
want per-user ownership — it's a bigger change than anything above.*

- [ ] Supabase email/password (or OAuth) auth
- [ ] `user_id` column on `spots`, RLS policies keyed to `auth.uid()`
- [ ] Update/delete policies scoped to the owning user
- [ ] Sign-in screen, session-aware UI (show "delete" only on your own spots)

**Done when:** users can only edit/delete spots they logged, and everything else still
works for anonymous browsers.

---

## Not planned (explicit non-goals for now)

- Multi-city support beyond Mumbai — the manifest/seed approach generalizes easily if
  this becomes wanted later, but it's not in scope yet.
- Native mobile app — the web app is responsive and works on phone browsers already.
- Offline support / PWA.

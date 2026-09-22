# Roadmap

Where the app stands and what's left, in the order we'll tackle it. Each stage has a
"done when" so we know when to move on. Check items off as we go.

**Current state:** Stage 0 is done — a real Supabase project is live and seeded with all
14 Mumbai spots, verified in-browser (correct thumbnails, correct pin locations across
greater Mumbai). Now on Stage 1: re-verifying the rest of the app against that real data.

---

## Stage 0 — Get a real Supabase project connected ✅
*Done. Project: `fmfweurpxxqhbwoghvsh` (South Asia/Mumbai region).*

- [x] Create the Supabase project at supabase.com/dashboard
- [x] Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor
- [x] Create the `spot-photos` public storage bucket
- [x] Copy `.env.example` → `.env.local`, fill in the three keys
- [x] `npm run seed` — 14/14 Mumbai spots written for real

**Hit along the way:** `service_role` had no table grants because "Automatically expose
new tables" was off at project creation — RLS policies alone weren't enough, Postgres
denies at the grant check before RLS is even considered. Fixed by adding explicit
`grant all on spots to service_role` to `schema.sql` (now idempotent/re-runnable).

**Done when:** the map shows 14 real markers over Mumbai with working photo thumbnails. ✅
Confirmed in-browser at both desktop width (full map) and narrow width (list view) —
thumbnails render correctly and pins sit in plausible real locations across the city.

---

## Stage 1 — End-to-end verification against the real project ✅
*Everything in the last session was tested against placeholder/mock data. This re-checks it for real.*

- [x] Open a few spot popups — thumbnails load from the actual Supabase public URL
- [x] Eyeball the 4 spots whose coordinates I estimated rather than pulled from
      Wikipedia. Cross-checked all 4 against Nominatim geocoding: Flora Fountain and
      Bandra Fort were close (<150m); **Worli Fort was off by ~2.6km** (had guessed a
      point on the mainland instead of Worli Koliwada) and Dhobi Ghat by ~450m. Updated
      `scripts/mumbai-spots.json` with geocoded coordinates and re-seeded; confirmed the
      corrected values persisted via a direct read of the live table.
- [x] Add a real spot end-to-end. The Browser pane has no OS file-picker control, so
      exercised the identical code path (validate → Storage upload → Postgres insert)
      via a direct POST to `/api/spots` with a real JPEG - same handler the form calls.
      Confirmed the row in Postgres, the object in Storage, and "15 spots logged" with
      the new spot listed first, live in the running app. Also re-tested the duplicate-
      name 409 path against the real DB and confirmed the orphan-cleanup logic actually
      leaves no leftover Storage object. Test spot then deleted to restore the clean 14.
- [x] Tried "Near me" - the Browser pane denies geolocation automatically, which
      exercised the "Location permission denied" error path correctly. Verified the
      underlying PostGIS query directly instead: from a Colaba coordinate, 5km radius
      returned exactly the 5 South Mumbai spots, correctly sorted nearest-first, with
      Elephanta/Kanheri correctly excluded.
- [x] Re-ran the key-leak check against a real production build with the real keys
      loaded (not placeholders this time): service-role secret absent from
      `.next/static/`, anon/publishable key present as expected (it's meant to be public).

**Done when:** every feature has been used against live data, not mocks.

---

## Stage 2 — Deploy it somewhere reachable ✅
*Live at **[photography-spot-logger.vercel.app](https://photography-spot-logger.vercel.app)**.*

- [x] Push the repo to GitHub — [ketanabhishek8/Photography-Spot-Logger](https://github.com/ketanabhishek8/Photography-Spot-Logger)
- [x] Import into Vercel, set the three env vars (service-role key as a plain server var,
      no Vercel↔Supabase marketplace integration — not needed since the app just reads
      plain env vars, and that integration would push toward per-branch databases which
      works against the single-shared-project design here)
- [x] Confirm the deployed build shows the same 14 spots — verified in-browser, map and
      list both render correctly with working thumbnails
- [x] Smoke-test add-a-spot on the deployed URL — POSTed a real photo to the production
      `/api/spots`, confirmed the 201, confirmed it appeared live ("15 spots logged"),
      then cleaned it up back to 14
- [x] Re-ran the key-leak check against the actual deployed JS bundles (not just the
      local build this time) — downloaded all script chunks Vercel serves, confirmed the
      real service-role secret is absent, anon key present as expected

**Done when:** you have a public URL you can hand to someone else. ✅

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

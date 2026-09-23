# Roadmap

Where the app stands and what's left, in the order we'll tackle it. Each stage has a
"done when" so we know when to move on. Check items off as we go.

**Current state:** Stages 0-3 done in full; Stage 4 done except marker clustering and
edit/delete, both explicitly deferred (clustering isn't needed yet at 14 spots,
edit/delete needs real accounts and is deferred to Stage 5). Stage 5 (auth) not
started, not currently planned. Two fixes landed outside the stage sequence since: an
invisible-input-text bug on dark-mode browsers, and
a switch from OpenStreetMap to MapTiler tiles - see "Post-Stage-4 fixes" below.

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

**Gotcha hit mid-Stage-3:** two pushed commits sat as **Blocked** in Vercel's deployment
list instead of going live, with the reason "Vercel couldn't find a Git account for the
commit author - Hobby teams do not support collaboration." The repo's local git identity
had been auto-generated as `tsurai@<hostname>.local` (not a real address), which doesn't
match any GitHub account, so Vercel's Hobby-plan check treated pushes as coming from an
unrecognized collaborator and refused to auto-promote them - even though the very first
deployment (the one made by manually clicking Deploy during Vercel's import wizard) had
gone through fine, since that path doesn't run the same check. Fixed by setting this
repo's `git config user.email` to the real GitHub-linked noreply address
(`<id>+<username>@users.noreply.github.com`, visible on any commit made through GitHub's
own web UI) and pushing a fresh commit - Vercel checks the pushed commit's own author, not
its ancestors, so this was enough without rewriting history. Worth knowing if a future
push ever silently stops reaching production: check the Deployments tab for "Blocked"
before assuming the push itself failed.

**Resolved:** the identity-corrected commit deployed and was promoted to Production
automatically. Re-verified Stage 3 directly against the live URL afterward (not just
trusting the dashboard's "Ready" label) - uploaded a real 4000x3000 JPEG through the
production `/api/spots` and confirmed the stored object came back 1600x1200, proving
`sharp` genuinely runs on Vercel's serverless runtime, then cleaned up all test spots
back to the real 14.

---

## Stage 3 — Harden it ✅
*Things that are fine for a demo but would bite in real use.*

- [x] **Image compression on upload.** Added `sharp` in `app/api/spots/route.ts`:
      auto-orients via EXIF then downscales to 1600px wide (`withoutEnlargement`, so
      small photos are untouched), matching what the seeder already does for Commons
      photos. Tested with a real 5472x3648 / 2.6MB JPEG - stored object came back
      1600x1067 / 404KB. Verified a 400x300 photo was *not* upscaled.
- [x] **Rate-limit `/api/spots`.** Added `lib/rateLimit.ts` - an in-memory sliding
      window, 10 requests per caller (by IP) per 10 minutes. Tested live: 10 requests
      succeeded, the 11th got `429` with a correct `Retry-After` header. **Caveat, noted
      in the code:** this is best-effort on Vercel's serverless functions, since the Map
      lives in one instance's memory and isn't shared across instances or survives cold
      starts. It reliably throttles a single script hammering the endpoint (very likely
      to hit the same warm instance) but isn't a real distributed guarantee. A
      production deployment that actually needs one should put this behind Upstash
      Redis (`@upstash/ratelimit`) or Vercel's own Firewall rate limiting - both need a
      new account, so left as a follow-up rather than done now.
- [x] **OSM tile usage.** `SpotMap.tsx` now reads `NEXT_PUBLIC_TILE_URL` /
      `NEXT_PUBLIC_TILE_ATTRIBUTION` with the OSM tile server as the default fallback -
      switching to a hosted provider (MapTiler, Carto) before sharing widely is now an
      env var away, no code change, once you have a key for one (documented in
      `.env.example`).
- [x] **Error boundaries.** Added `app/error.tsx` (catches errors below the root layout)
      and `app/global-error.tsx` (catches errors in the root layout itself, per Next's
      App Router convention - it needs its own `<html>`/`<body>` since it replaces the
      whole document). Verified live by temporarily forcing a throw in `page.tsx` -
      showed the styled "Something went wrong" screen with a working "Try again" button.

**Done when:** the app survives someone actively poking at it, not just the happy path. ✅

---

## Stage 4 — Feature backlog
*Roughly in order of value for effort. Pick and choose - user chose EXIF auto-fill and
search/filter for this pass; the rest stay in the backlog.*

- [x] **EXIF auto-fill.** `AddSpotForm.tsx` reads GPS out of the selected photo via
      `exifr` (dynamically imported, so it doesn't bloat the initial bundle) and calls
      back up to set the map pin automatically - only when no pin has been placed yet, so
      it never overrides a deliberate manual pick. Verified for real, not just by
      reading the code: generated a JPEG with actual GPS EXIF tags, injected it into the
      live file input via a real `change` event (the Browser pane can't drive an OS file
      picker, but this exercises the exact same React code path), and confirmed the pin
      landed at the exact embedded coordinates with the "📍 Filled in..." message shown.
      Also verified the no-GPS path shows the right fallback message instead of erroring.
- [x] **Gallery/list view.** A two-icon toggle next to the spot count switches the
      sidebar between the original single-column list and a 2-column photo grid
      (bigger square thumbnails, same click-to-fly-map behaviour). Map and filters are
      unaffected - only the sidebar's content changes, matching the original framing of
      "a grid toggle alongside the map." Shares the same empty-state message and
      filtering logic as the list, extracted once rather than duplicated. Toggle hides
      during "Log a spot" (irrelevant there) and the chosen view persists across
      add/cancel. Verified live: switched views, confirmed the active-state styling
      (`aria-pressed` + highlight) tracks correctly, confirmed the empty-state message
      renders in gallery mode too, confirmed the toggle correctly hides/reappears
      around the add-spot flow.
- [ ] **Marker clustering.** Skipped - not needed at 14 spots, per the note below.
      Worth adding once user-submitted spots push the count into the hundreds
      (`react-leaflet-cluster` or similar). *Explicitly deferred again rather than
      built ahead of need, when re-asked.*
- [ ] **Edit/delete own spots.** Skipped for now - deferred to Stage 5, when real
      accounts exist. A token-based no-auth workaround was considered and declined:
      it'd mean redoing this properly once auth exists anyway, and a client-side-only
      token isn't real per-user security. Currently impossible for anyone, including
      the person who logged it - RLS only grants `select` + `insert`.
- [x] **Search/filter.** Sidebar now has a text search (matches name + description) and a
      best-time dropdown, both client-side over the already-loaded spots (combines with
      "Near me"). Caught a real bug while building this: the dropdown initially reused
      the add-form's curated 6-option list (`BEST_TIME_OPTIONS`), which can't reach 5 of
      the 11 actual values in the seed data (`Sunset`, `Morning`, `Mid morning`, etc.) -
      switched it to derive options from the live spots data instead, so it always covers
      what's actually filterable. **Place-name search to re-center the map was
      intentionally left out** - it would mean embedding a live Nominatim geocoding call
      in the app for every visitor, subject to the same usage-policy concern already
      flagged for OSM tiles in Stage 3, rather than the handful of one-off calls used
      during Stage 1's coordinate verification.

**Verified live on Vercel** after pushing (deployed cleanly this time - the git identity
fix from Stage 3 held): confirmed the search input is actually present in production's
HTML and re-ran the search test directly against the deployed URL ("elephanta" -> "1 of
14 spots" -> Elephanta Caves).

---

## Post-Stage-4 fixes
*User-reported and user-requested, landed between the numbered stages.*

- [x] **Invisible input text on dark-mode browsers.** Every input/select forced
      `bg-white` but the app had no `color-scheme` declared, so a dark-mode browser
      painted native form controls with light text - unreadable against the forced
      white background. Root cause was a vestigial `prefers-color-scheme: dark` swap
      inherited from the create-next-app starter template; the rest of the UI never
      implemented a real dark theme. Fixed by declaring `color-scheme: light` and
      dropping the dead block. Verified by emulating both colour schemes in the Browser
      pane against both localhost and the live deployment.
- [x] **OpenStreetMap → MapTiler tiles.** User asked about Google Maps; the real ask
      turned out to be "free, no billing account, nicer than plain OSM." First attempt
      (Carto's free basemaps) was wrong - verified only by HTTP status/size, and it
      turned out every Carto style now shows an "API KEY REQUIRED" watermark at every
      zoom level, a real policy change. Reverted before committing. MapTiler's free
      tier genuinely needs no card (verified against their own plans page), and the
      correct current raster tile URL format was cross-checked against their live docs
      (`streets-v4` with a `/256/` tile-size segment - an earlier guess at `streets-v2`
      was already stale). The key is a `NEXT_PUBLIC_` var by design, restricted by
      HTTP origin (`localhost:3000`, the production domain) rather than kept secret,
      the same pattern Google Maps keys use. Verified live on both localhost and
      production by fetching real Mumbai tiles directly and confirming the app's own
      attribution text updates. Along the way, also caught and fixed the Supabase
      service-role key being stored as Vercel's "Config" type instead of "Secret".
- [x] **Seed photos weren't compressed - the actual cause of the slow map load.**
      User asked whether map load time could be improved. Measured it directly (Resource
      Timing API + real `fetch`/`HEAD` checks against the live Supabase Storage objects)
      instead of guessing, and found the 14 seed photos totalled **9.9 MB** at up to
      1920px/1.5 MB each - full Commons downloads, rendered at 56px in the list and in a
      2-column gallery grid. Root cause: `scripts/seed.mjs` uploaded straight to Storage,
      bypassing the `sharp` downscale-and-recompress pipeline that `app/api/spots/route.ts`
      already applies to user-submitted photos (Stage 3). Fixed by routing seed photos
      through the identical pipeline (auto-rotate, resize to 1600px, mozjpeg quality 82) -
      total dropped to **~4.6 MB** (about half), verified by re-fetching the actual
      re-seeded objects from Storage (1600px, 551 KB for the largest one, confirmed
      pixel dimensions via `createImageBitmap`). Also gave every upload (seed and
      user-submitted) an explicit `cacheControl: "31536000"` on the Storage upload call -
      both paths are immutable in practice (a seed path is only ever overwritten by a
      deliberate re-seed; a user upload path is a fresh UUID) - Supabase's unset default
      is only 1 hour, so repeat visits were re-downloading the same ~1 MB images every hour
      for nothing. Re-seeded the live Supabase project; confirmed 14 spots still render
      correctly in both list and gallery view after the change.
- [x] **Vercel function running in the wrong region - the actual "map loads slowly" fix.**
      User clarified the image-weight fix above wasn't what they meant - the map itself felt
      slow. Measured with `curl -w` and the `x-vercel-id` response header (format
      `<edge-pop>::<function-region>::<id>`): every request showed `bom1::iad1::...` - the
      edge network correctly routed to Mumbai, but the actual Next.js serverless function
      (which does the Supabase query behind `force-dynamic`) ran in `iad1` (US East,
      Vercel's default), a continent away from the Supabase project's own South Asia/Mumbai
      region. Steady-state TTFB was a consistent ~490-500ms - almost exactly a US↔India
      round trip - on every single page load, before the browser had any HTML to even start
      loading the map from. Fixed with a `vercel.json` pinning `"regions": ["bom1"]` so the
      function runs next to the database. Verified for real, not just deployed and assumed:
      polled `x-vercel-id` until it read `bom1::bom1::...`, then re-measured TTFB - dropped
      to as low as 115ms, averaging ~258ms across 8 requests (previously a hard floor of
      ~490ms). Confirmed the app still renders correctly post-deploy. The map's own client
      bundle (~73KB) and tile requests (14-15ms once mounted) were never the bottleneck -
      it was the server round-trip that has to finish before the map can even begin loading.

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

# Roadmap

Where the app stands and what's left, in the order we'll tackle it. Each stage has a
"done when" so we know when to move on. Check items off as we go.

**Current state:** Stages 0-4 done. Edit/delete own spots shipped without real
accounts - session-owned via an anonymous cookie, not Stage 5's auth (the user
explicitly chose to skip accounts; Stage 5 is now a non-goal, not a future stage).
The seed set has grown from 14 to **22** real Mumbai spots. Marker clustering remains
deferred (not needed yet at this count). Several fixes landed outside the stage
sequence: invisible input text on dark-mode browsers, a switch from OpenStreetMap to
MapTiler tiles, seed-photo compression, and a Vercel function-region fix for the
actual "map loads slowly" cause - see "Post-Stage-4 fixes", "Edit/delete own spots"
and "More seed spots" below.

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
- [ ] **Marker clustering.** Skipped - not needed at 14 spots, per the note below
      (still true at 22, after "More seed spots" below).
      Worth adding once user-submitted spots push the count into the hundreds
      (`react-leaflet-cluster` or similar). *Explicitly deferred again rather than
      built ahead of need, when re-asked.*
- [x] **Edit/delete own spots.** Initially deferred to Stage 5 - a token-based no-auth
      workaround was considered and declined at the time. Revisited when the user
      decided against Stage 5 entirely and asked for it session-owned instead; see
      "Edit/delete own spots" below for the actual (properly secured, this time)
      implementation.
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

## Edit/delete own spots — shipped, without Stage 5's real auth
*User's call: skip accounts entirely ("let's not keep auth, let's keep it session
owned"), so this landed as its own thing rather than depending on Stage 5.*

- [x] **Session-owned edit/delete.** Every browser gets an anonymous, random
      `pit_owner_token` cookie on first visit (`proxy.ts` - Next.js 16 renamed the
      `middleware.ts` file convention to `proxy.ts`; confirmed genuine via the docs
      shipped in `node_modules/next/dist/docs`, not just the deprecation warning, and
      migrated properly rather than leaving the deprecated name in place). httpOnly, so
      client JS never touches it - the browser just attaches it automatically to every
      same-origin request. A spot's `owner_token` column is set from that cookie at
      creation time; `app/api/spots/[id]/route.ts` (new) only lets a PATCH/DELETE through
      when the request's cookie matches the row's stored token, checked with the
      service-role client (the only role that can even read that column). No login, no
      password, no user table - "yours" just means "created from this browser."
- [x] **Closed the leak this design would otherwise have.** RLS is row-level only, and
      the anon key is public (shipped in the JS bundle) - so if `owner_token` were
      selectable like every other column, anyone could read every row's token straight
      from the REST API and forge ownership of any spot. Fixed with a **column-level**
      grant (`grant select (id, name, ..., geog) on spots to anon` - `owner_token`
      deliberately left out), on top of RLS, in `supabase/schema.sql`. Also had to
      explicitly `revoke select on spots from anon, authenticated` first, since GRANT is
      additive - the old whole-table grant from every earlier run of this file would
      otherwise still have applied on top of the new narrower one.
- [x] **`spots_within_radius()` rewritten** to return explicit columns instead of
      `setof spots`, for the same reason (the "Near me" RPC runs as the calling role, so
      it was one more path that could have surfaced `owner_token`).
- [x] **Caught a real self-inflicted outage while verifying the migration.** After
      tightening the grant, `fetchSpots()` and the spot detail page both broke with
      "permission denied for table spots" - they still called `.select("*")`, and
      Postgres denies a bare wildcard select outright for a role with only column-level
      privileges rather than silently narrowing it. Fixed by naming the safe columns
      explicitly everywhere the anon client reads (`PUBLIC_SPOT_COLUMNS` in
      `lib/types.ts`), caught immediately because the very next reload showed "0 spots
      logged" instead of 14 - not something that slipped through.
- [x] **Verified for real, not just by reading the code:** created a spot through the
      actual UI (draft pin on the map, an injected `File` through the real input, a real
      POST), confirmed edit/delete icons appeared only on that spot and not on any seed
      spot, edited it through the UI, then ran the security-relevant checks directly
      against the API: a `DELETE` with the ownership cookie stripped (`credentials:
      "omit"`) got a 403, a raw REST call selecting `owner_token` with the public anon
      key got a permission-denied error (not just an empty result), and the real `DELETE`
      with the cookie present succeeded and removed both the Postgres row and the
      Storage object. Confirmed the count was back to 14 afterward. Also re-ran the
      "Near me" RPC directly against the new function signature to make sure the rewrite
      didn't break it (still returns the expected 4 South Mumbai spots for a 5 km radius
      around Gateway of India).

**Editable fields are deliberately narrower than creation:** name, description and best
time only - not the photo or pin location. Both of those would mean re-running the
upload/sharp/orphan-cleanup path `AddSpotForm`/`app/api/spots/route.ts` already does;
"delete, then re-log with the right photo/pin" covers that without duplicating it.

**What this is not:** real accounts. Clearing cookies/site data, or opening the same
browser in a different profile, means those spots are no longer editable from there -
there's nothing to log back into. That trade-off was the explicit point of choosing this
over Stage 5.

---

## More seed spots — 14 → 22
*User asked to add more, once the roadmap itself was otherwise done.*

- [x] **8 new real Mumbai spots**, same standard as the original 14: real coordinates
      (Nominatim geocoding, not guessed), a real CC-licensed Wikimedia Commons photo per
      spot, checked before adding rather than after. Added: Siddhivinayak Temple, Rajabai
      Clock Tower, Chhatrapati Shivaji Maharaj Vastu Sangrahalaya (the museum formerly
      called Prince of Wales Museum), Hanging Gardens, Girgaon Chowpatty, Juhu Beach,
      Horniman Circle Garden and Mount Mary Church - `scripts/mumbai-spots.json` now
      holds 22 entries.
- [x] **Verified each photo actually shows its subject before adding it to the
      manifest**, not just that the Commons API returned a 200 and a plausible license -
      the same discipline as [[verify-tile-api-by-content]], applied here to content
      instead of an API response. Worth it: the first pick for Horniman Circle Garden
      ("Horniman circle garden mumbai.jpg") turned out to be a street-corner building
      shot with no garden in it at all, caught by actually looking at the downloaded
      image and swapped for "A bench in Horniman Circle Garden, Mumbai.jpg" instead,
      which genuinely shows the garden.
- [x] **Also hit real Wikimedia API rate limits while doing this research** (curl
      returning literal Wikimedia "too many requests" HTML pages, and separately a 400
      from a hand-guessed thumbnail URL that wasn't actually rate limiting - both had to
      be diagnosed from the raw response, not assumed) - paced requests and retried
      rather than dismissing failures as one-offs.
- [x] `npm run seed --dry-run` confirmed all 22 entries (14 existing + 8 new) fetch and
      compress cleanly - largest new photo 432 KB after the sharp pipeline, consistent
      with the existing set - before writing anything to the live project.
- [x] Seeded for real: `22/22 seeded. Table now holds 22 spots.` Verified live in the
      Browser pane - correct thumbnails, correct count, new pins land in geographically
      sensible places (Juhu Beach north of Bandra, the Fort-area cluster - Rajabai,
      CSMVS, Horniman - tight together as expected), and the best-time filter picked up
      "Evening" (a new value none of the original 14 used) automatically, confirming the
      Stage-4 fix that derives filter options from live data instead of a fixed list is
      still doing its job.

---

## Not planned (explicit non-goals for now)

- **Stage 5's original scope (Supabase email/OAuth auth, a real user table, sign-in
  UI).** Superseded by session-owned edit/delete above - the user explicitly chose to
  skip accounts rather than build them, so this is a deliberate non-goal now, not a
  future stage.
- Multi-city support beyond Mumbai — the manifest/seed approach generalizes easily if
  this becomes wanted later, but it's not in scope yet.
- Native mobile app — the web app is responsive and works on phone browsers already.
- Offline support / PWA.

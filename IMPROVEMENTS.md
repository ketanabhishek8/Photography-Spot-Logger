# Improvements

What this project still needs, in priority order. Each item names the problem, why it
matters and where the fix goes. Checked against the code on 2026-09-23, not written
from memory.

---

## P0 — Security holes

### 1. Close the direct anon insert path ✅ done
**Problem.** `supabase/schema.sql` still has the `public insert` RLS policy and
`grant insert on spots to anon, authenticated`. The anon key ships in the JS bundle, so
anyone can `POST` straight to `…/rest/v1/spots` and skip everything in
`app/api/spots/route.ts`: validation, rate limiting, `sharp` compression and orphan
cleanup.

**Why it matters.** A direct insert can set `is_seed = true`. A row like that can never
be edited or deleted through the app, because the API route refuses seed rows, so spam
sticks. It can also point `photo_path` anywhere or fake an `attribution`.

**Fix.** The app never uses this path. Every write goes through the service-role key.
Remove it:
```sql
drop policy if exists "public insert" on spots;
revoke insert on spots from anon, authenticated;
```
Update `schema.sql` to match and remove the "public insert" line from its comments.

**Done:** dropped the `"public insert"` policy, added
`revoke insert, update, delete on spots from anon, authenticated` (revoke, not just
removing the old grant line, since GRANT is additive across re-runs). Needs the updated
`schema.sql` re-run in the Supabase SQL editor to take effect on the live project - see
below.

### 2. Mark the ownership cookie `secure` ✅ done
**Problem.** `pit_owner_token` is set with `httpOnly` and `sameSite: "lax"` but no
`secure` flag, in both `proxy.ts` and the fallback in `app/api/spots/route.ts`.

**Why it matters.** This cookie is the only proof of ownership, so treat it like a
session credential. Without `secure`, the browser will also send it over plain HTTP.

**Fix.** Add `secure: process.env.NODE_ENV === "production"` to both `cookies.set`
calls. Localhost runs over HTTP, so the flag has to stay off in dev. Better still, move
the cookie options into one shared constant so the two copies can't drift apart.

**Done:** `proxy.ts` now exports `OWNER_TOKEN_COOKIE_OPTIONS` (with
`secure: process.env.NODE_ENV === "production"`), used by both `cookies.set` call
sites so they can't drift apart.

### 3. Enforce length limits on the server ✅ done
**Problem.** `name` (120) and `description` (600) are capped only by `maxLength` on the
form inputs. Neither `POST /api/spots` nor `PATCH /api/spots/[id]` checks length.

**Why it matters.** Client-side limits are advice, not enforcement. A direct request can
store megabytes of text that every visitor then downloads with the page.

**Fix.** In both routes, reject `name.length > 120` and `description.length > 600`, and
give `best_time` a sensible cap too. Better: add `check (char_length(name) <= 120)`
constraints in `schema.sql` so the database enforces the limits whatever the caller.

**Done:** `MAX_NAME_LENGTH`/`MAX_DESCRIPTION_LENGTH`/`MAX_BEST_TIME_LENGTH` added to
`lib/types.ts`, checked in both `POST /api/spots` and `PATCH /api/spots/[id]` - verified
live with direct `fetch` calls past the client (a 200-char name, a 700-char description),
both correctly rejected with 400. Also added `not valid` `CHECK` constraints in
`schema.sql` as the DB-level backstop (needs the SQL re-run - see below).

---

## P1 — Reliability

### 4. Add automated tests ✅ done
**Problem.** No test runner, no `test` script, not one test file. Every check so far was
done by hand in a browser.

**Why it matters.** The riskiest logic here is exactly what hand checks miss on the next
change. That means the ownership match in `app/api/spots/[id]/route.ts`, the
column-level grant hiding `owner_token`, and the seed-row guard. The `select("*")`
outage was caught by luck on a reload, not by a check.

**Fix.** Add Vitest and start with:
- API route tests: PATCH/DELETE with the wrong cookie → 403, no cookie → 403, a seed
  row → 403, the right cookie → 200.
- POST validation: bad MIME type, oversize file, out-of-range coordinates, missing name.
- One integration test against a Supabase branch or local stack: selecting
  `owner_token` with the anon key must fail.

**Done:** Vitest added (`vitest.config.mts`), 29 tests across three files -
`app/api/spots/route.test.ts` (POST validation, no DB needed - all rejected before the
route ever calls Supabase), `app/api/spots/[id]/route.test.ts` (PATCH/DELETE validation,
plus real ownership tests against the live project: wrong token → 403, right token →
200 and the row genuinely changes, a seed row → 403 even with a token that matches),
and `tests/security.test.ts` (the anon key itself: `owner_token` unselectable, a direct
insert/update rejected). Credential-gated tests skip via `describe.skipIf` when
Supabase creds aren't set, rather than failing - `server-only` (which throws outside an
actual Next.js build) is stubbed via a vitest resolve alias so route handlers can be
imported directly.

Caught a real bug in the test suite itself while writing it: the anon-insert-rejection
test initially set `Prefer: return=representation`, which makes PostgREST try to read
the row back as part of the same statement - and that read fails for the unrelated
reason `owner_token` is column-restricted, masking whether the insert itself was
rejected. The test passed even while a real `curl` proved a plain anon insert still
succeeded. Fixed by dropping that header so the test isolates the actual privilege
being checked, then re-ran it - **at that point it correctly failed**, since this
project's live database hadn't had the P0 #1 migration applied yet. That's the honest
current state as of this writing: `npm test` shows one real, expected failure
(`a direct anon insert is rejected`) until the schema.sql migration from the quick-wins
section above is run in the SQL editor - a good sign the test is trustworthy, not a bug
to paper over.

### 5. Add CI ✅ done
**Problem.** No `.github/workflows`. Lint, typecheck and build only run when someone
remembers to run them locally.

**Fix.** A GitHub Actions workflow on push/PR that runs `npm ci`, `npm run lint`,
`npm run build` and the tests from #4.

**Done:** `.github/workflows/ci.yml`. Lint/build/test run on every push and PR to
`main`. Confirmed `npm run build` succeeds with zero env vars present (temporarily moved
`.env.local` aside and rebuilt), so CI needs no secrets just to build - Next.js never
touches Supabase during a `force-dynamic` page's build, only at request time. `npm test`
also needs no secrets to run (the credential-gated tests just skip), but the workflow
wires up `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` from repo secrets if added, so the full suite - including
the live-project ownership and grant checks - runs automatically once they're
configured.

### 6. Stop hiding read failures as "0 spots" ✅ done
**Problem.** `fetchSpots()` in `lib/supabase/server.ts` logs any error and returns `[]`.
When the grant change broke reads, the site just showed "0 spots logged" and looked
empty instead of broken.

**Fix.** Throw on a real error so `app/error.tsx` shows its "Something went wrong"
screen. Keep returning `null` only for the "not configured yet" case the setup guide
needs.

**Done:** `fetchSpots()` now throws on a query error instead of logging and returning
`[]`; still returns `null` for the unconfigured case. Verified the happy path still
renders all 22 spots after the change.

### 7. Rate limiting that actually holds
**Problem.** `lib/rateLimit.ts` keeps counts in memory. On Vercel, requests spread
across function instances, and each instance keeps its own counter.

**Fix.** Replace it with `@upstash/ratelimit` (free tier) or Vercel Firewall rate rules.
Also cover `PATCH`/`DELETE`, not just `POST`.

### 8. Real database migrations
**Problem.** Every schema change means re-running the whole of `schema.sql` in the SQL
editor. That drops and rebuilds the `geog` column and its index each time. Nothing
records which changes have been applied.

**Fix.** Move to Supabase CLI migrations (`supabase/migrations/NNNN_*.sql`), one file per
change, applied with `supabase db push`. Keep `schema.sql` as a generated snapshot or
delete it.

---

## P2 — Performance

### 9. Serve thumbnails, not 1600px originals ✅ done
**Problem.** The list shows 56px thumbnails and the gallery shows ~170px tiles, but both
load the full 1600px photo, up to ~670 KB each. That's about 7 MB across 22 spots.

**Fix.** Generate a ~400px `thumb/` copy next to each photo in the same `sharp` step, in
both `app/api/spots/route.ts` and `scripts/seed.mjs`. Store its path, or derive it from
`photo_path`, and use it in the list, gallery and popups. Keep the full-size image for
the detail page. (Supabase's on-the-fly image transforms would also work, but they need
a paid plan.)

**Done:** derived rather than a new column - `thumbPath()` in `lib/types.ts` maps
`user/abc.jpg` -> `user/abc-thumb.jpg`, so no migration needed. `app/api/spots/route.ts`
now encodes both sizes from the same decoded source in parallel
(`THUMBNAIL_TARGET_WIDTH = 400`) and uploads both; delete removes both. `scripts/seed.mjs`
duplicates the same width/path logic (it runs as a plain node script, can't import the
`.ts` file - same reason `TARGET_WIDTH` was already duplicated there before this).
`photoThumbUrl()` added to `lib/supabase/client.ts`; the list, gallery and map popup
(`MapExperience.tsx`, `SpotMap.tsx`) now request it instead of the full `photoUrl()` -
the detail page keeps the full size, the one place it's actually worth it. Re-ran
`npm run seed` to backfill `-thumb` objects for all 22 already-seeded spots (upload is
`upsert: true`, so this only added the missing thumbs, didn't disturb the existing
full-size objects). Verified live: 22 spots still render correctly in list and gallery
view, thumbnails genuinely smaller than the originals, detail page unaffected.

### 10. Add image dimensions - checked, not actually needed
**Problem (as originally rated).** The `<img>` tags have no `width`/`height`, so the list
jumps around as photos load.

**Fix (as originally rated).** Give the thumbnails fixed dimensions (they're already
square via CSS), or store each photo's width and height at upload time.

**On inspection, this wasn't a real bug.** Every image sits inside a box with a fixed
Tailwind size independent of the image's own intrinsic dimensions - `h-14 w-14` in the
list, `aspect-square` in the gallery, `h-32 w-full` in the map popup - so there's no
layout shift for `width`/`height` attributes to prevent; the box holds its size before
the image ever loads. Correcting the original rating rather than adding a no-op
`width`/`height` pair just to check the box.

### 11. Marker clustering, once it's needed
Still unnecessary at 22 spots. Add `react-leaflet-cluster` when user-added spots push the
count toward ~100, when overlapping pins in the Fort/Colaba area start hiding each other.

---

## P3 — UX and polish

### 12. Replace `window.confirm` / `window.alert`
Delete uses the browser's built-in pop-ups (`MapExperience.tsx`, `handleDelete`). Use an
inline confirm on the row ("Delete? Yes / No") and show errors inline, the same way the
forms already do.

### 13. Adjustable "Near me" radius ✅ done
`RADIUS_M` is hard-coded to 5000 in `MapExperience.tsx`. The original plan had a radius
slider. Offer 1 / 5 / 10 km as a small segmented control.

**Done:** a 1/5/10 km segmented control next to the Near me button. Changing it while a
search is already active re-queries with the stored coordinates instead of asking the
browser for location again - only the first click needs a fresh permission
prompt/GPS lock. Verified live via the accessibility tree (`aria-pressed` on each
option) after ruling out a stale-HMR false alarm (a hard reload fixed it, confirming the
underlying code was correct all along).

### 14. Edit form can silently change `best_time` ✅ done
`EditSpotForm.tsx` only offers the 6 `BEST_TIME_OPTIONS`. If a spot's value isn't one of
them (possible for anything inserted outside the form), the `<select>` falls back to the
first option, and saving quietly overwrites the real value. Add the spot's current value
as an extra option when it isn't already in the list.

**Done:** `EditSpotForm.tsx` now injects the spot's current `best_time` as an extra
`<option>` when it isn't already in `BEST_TIME_OPTIONS`. Verified live: created a spot
with `best_time: "Sunset"` (not in the list), opened its edit form, and confirmed the
dropdown showed "Sunset" selected rather than silently falling back to "Golden hour" -
this affects most of the 22 seeded spots, whose `best_time` values were never
constrained to the 6-option list in the first place (Stage 4's own filter fix already
had to account for the same mismatch).

### 15. Per-spot page titles and share previews
`app/spots/[id]/page.tsx` has no `generateMetadata`, so every spot page shares the
site-wide title and has no Open Graph image. Add a title and use the spot's photo as the
`og:image`, so shared links show a proper preview.

### 16. Accessible map markers ✅ done
Leaflet pins show up in the accessibility tree as unlabelled buttons (confirmed with
`read_page`). Give each marker the spot name as its title/alt, e.g. via Leaflet's
`title` option on `Marker`.

**Done:** `alt`/`title` added to each `<Marker>` in `SpotMap.tsx`. Verified with
`read_page`: all 22 markers now read as `button "Gateway of India"`,
`button "Mount Mary Church"`, etc., where before every one of the 22 was an unlabelled
`button` with no accessible name.

### 17. Edit photo and location
Editing currently covers name, description and best time only. Letting people replace
the photo or move the pin means reusing the upload + `sharp` + orphan-cleanup path from
`POST`. Worth doing only if people actually ask for it; delete-and-re-add covers it
today.

---

## P4 — Documentation

### 18. Split ROADMAP.md
`ROADMAP.md` has become a build diary: long narrative entries covering what broke and
how it was checked. That history is useful, but it buries current status. Move the
narrative to `CHANGELOG.md` or `docs/history.md` and keep the roadmap to a short
checklist of done / not planned / next.

---

## Quick wins ✅ all done (2026-09-23)

These were done in one sitting and fix the most important problems:

| # | Item | Effort |
|---|---|---|
| 1 | Remove the anon insert path | 2 lines of SQL |
| 2 | Add `secure` to the ownership cookie | 2 lines |
| 3 | Server-side length limits | ~10 lines + a `CHECK` constraint |
| 6 | Throw on read errors instead of showing "0 spots" | ~5 lines |
| 14 | Keep unknown `best_time` values in the edit form | ~5 lines |

Items 1 and 3's database half (the revoke and the `CHECK` constraints) need
`supabase/schema.sql` re-run in the Supabase SQL editor to take effect on the live
project - the app code is deployed, but the database side is a manual step, same as
every other schema change this project has made.

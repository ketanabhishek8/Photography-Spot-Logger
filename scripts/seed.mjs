/**
 * Seeds the app with real Mumbai photography spots.
 *
 *   node --env-file=.env.local scripts/seed.mjs
 *
 * For each entry in mumbai-spots.json it:
 *   1. asks the Wikimedia Commons API for the photo's direct URL + license metadata
 *   2. downloads the bytes
 *   3. uploads them to the `spot-photos` bucket in Supabase Storage
 *   4. upserts the row (with attribution) into Postgres
 *
 * Re-running is safe: `name` is unique and both the upload and the insert upsert.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "spot-photos";
// Commons originals run to 20 MB+. Ask Wikimedia's thumbnailer for a web-sized
// rendition instead: far kinder to the Supabase free tier and to page loads.
const TARGET_WIDTH = 1600;
// Wikimedia blocks requests with a generic or absent User-Agent, so identify properly.
const USER_AGENT =
  "PhotoSpotLogger/1.0 (educational cloud mini-project; contact: local dev)";

const here = path.dirname(fileURLToPath(import.meta.url));

// --dry-run fetches and verifies every Commons photo but writes nothing,
// which is useful for checking the manifest before Supabase exists.
const dryRun = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!url || !serviceKey)) {
  console.error(
    "\n  Missing Supabase credentials.\n" +
      "  Copy .env.example to .env.local, fill it in, then run:\n" +
      "    node --env-file=.env.local scripts/seed.mjs\n",
  );
  process.exit(1);
}

const supabase = dryRun
  ? null
  : createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

/** Commons returns Artist as an HTML anchor; reduce it to a plain name. */
function cleanArtist(html) {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    // Some uploaders put their email in the Artist field - don't store it.
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikimedia rate-limits bursts of requests with HTTP 429. Retry those (and
 * transient 5xx) with exponential backoff rather than failing the seed.
 */
async function fetchWithRetry(target, attempts = 4) {
  let wait = 1000;
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(target, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) return res; // genuine error
    if (i === attempts) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : wait);
    wait *= 2;
  }
  throw new Error("unreachable");
}

/** Look up one Commons file: direct download URL, license, author, description page. */
async function fetchCommonsMeta(fileName) {
  const api =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: String(TARGET_WIDTH),
      titles: `File:${fileName}`,
    });

  const res = await fetchWithRetry(api);
  if (!res.ok) throw new Error(`Commons API returned ${res.status}`);

  const data = await res.json();
  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`no such file on Commons: ${fileName}`);

  const meta = info.extmetadata ?? {};
  return {
    // thumburl is the resized rendition; fall back to the original if Wikimedia
    // cannot thumbnail this particular file.
    downloadUrl: info.thumburl ?? info.url,
    descriptionUrl: info.descriptionurl ?? null,
    license: meta.LicenseShortName?.value ?? "See source",
    artist: cleanArtist(meta.Artist?.value) ?? "Unknown author",
  };
}

async function seedOne(spot) {
  const meta = await fetchCommonsMeta(spot.commons_file);

  const imgRes = await fetchWithRetry(meta.downloadUrl);
  if (!imgRes.ok) throw new Error(`photo download failed (${imgRes.status})`);

  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await imgRes.arrayBuffer());

  const ext = contentType.includes("png") ? "png" : "jpg";
  const photoPath = `seed/${spot.slug}.${ext}`;

  if (dryRun) {
    return { photoPath, kb: Math.round(bytes.length / 1024), license: meta.license };
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(photoPath, bytes, { contentType, upsert: true });
  if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

  const { error: dbError } = await supabase.from("spots").upsert(
    {
      name: spot.name,
      description: spot.description,
      latitude: spot.latitude,
      longitude: spot.longitude,
      photo_path: photoPath,
      best_time: spot.best_time,
      attribution: `${meta.artist} via Wikimedia Commons`,
      license: meta.license,
      source_url: meta.descriptionUrl,
      is_seed: true,
    },
    { onConflict: "name" },
  );
  if (dbError) throw new Error(`insert failed: ${dbError.message}`);

  return { photoPath, kb: Math.round(bytes.length / 1024), license: meta.license };
}

const spots = JSON.parse(await readFile(path.join(here, "mumbai-spots.json"), "utf8"));

console.log(
  `\n${dryRun ? "Checking" : "Seeding"} ${spots.length} Mumbai photography spots...\n`,
);

let ok = 0;
const failures = [];

for (const spot of spots) {
  try {
    const { photoPath, kb, license } = await seedOne(spot);
    ok++;
    console.log(`  ok  ${spot.name.padEnd(38)} ${String(kb).padStart(5)} KB  ${license}`);
    console.log(`      -> ${BUCKET}/${photoPath}`);
  } catch (err) {
    failures.push({ name: spot.name, message: err.message });
    console.log(`  FAIL ${spot.name.padEnd(37)} ${err.message}`);
  }
  await sleep(350); // be a polite client rather than relying on retries
}

let count = null;
if (!dryRun) {
  ({ count } = await supabase.from("spots").select("*", { count: "exact", head: true }));
}

console.log(
  dryRun
    ? `\n${ok}/${spots.length} photos fetched OK (dry run - nothing written).`
    : `\n${ok}/${spots.length} seeded. Table now holds ${count ?? "?"} spots.`,
);

if (failures.length) {
  console.log("\nFailed:");
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}

if (dryRun) {
  console.log("Manifest looks good. Re-run without --dry-run to write to Supabase.\n");
} else {
  console.log("Done. Run `npm run dev` and open http://localhost:3000\n");
}

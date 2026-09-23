import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "@/lib/types";

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until .env.local is filled in; the UI shows a setup guide instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return Boolean(URL_ENV && ANON_ENV);
}

let cached: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client, created lazily so that an unconfigured project
 * renders a setup screen rather than throwing at import time.
 *
 * The anon key is public by design: what it may do is governed by RLS plus
 * the column-level grant in supabase/schema.sql - public select only
 * (excluding owner_token); every write goes through app/api/spots/ instead.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured - see .env.example");
  }
  cached ??= createClient(URL_ENV!, ANON_ENV!);
  return cached;
}

/**
 * Public CDN URL for a stored object. Built by string template rather than via
 * the SDK so that <img> sources work even in Server Components.
 */
export function photoUrl(photoPath: string): string {
  return `${URL_ENV}/storage/v1/object/public/${PHOTO_BUCKET}/${photoPath}`;
}

/**
 * Every upload (app/api/spots/route.ts, scripts/seed.mjs) stores a small
 * companion thumbnail next to the full photo, at the same path with
 * `-thumb` inserted before the extension - no separate DB column needed,
 * the path is derived. Use this anywhere a photo renders small (the
 * sidebar list, the gallery grid, the map popup): those only ever displayed
 * a 56-224px box, but were downloading the full 1600px original (up to
 * ~670 KB) to do it. The detail page is the one place that's still worth
 * the full-size photoUrl().
 */
export function photoThumbUrl(photoPath: string): string {
  return photoUrl(thumbPath(photoPath));
}

function thumbPath(photoPath: string): string {
  const dot = photoPath.lastIndexOf(".");
  if (dot === -1) return `${photoPath}-thumb`;
  return `${photoPath.slice(0, dot)}-thumb${photoPath.slice(dot)}`;
}

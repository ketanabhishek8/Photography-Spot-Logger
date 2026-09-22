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
 * The anon key is public by design: what it may do is governed by the RLS
 * policies in supabase/schema.sql (select + insert on `spots`, nothing more).
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

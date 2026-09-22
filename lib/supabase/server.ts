import { createClient } from "@supabase/supabase-js";
import type { Spot } from "@/lib/types";

/**
 * Read-only fetch of every spot, used by Server Components.
 * Uses the anon key and therefore goes through the same RLS policies the
 * browser would - a good sanity check that "public read" actually works.
 *
 * Returns null when Supabase is not configured yet so the page can render a
 * setup guide instead of a stack trace.
 */
export async function fetchSpots(): Promise<Spot[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchSpots]", error.message);
    return [];
  }
  return (data ?? []) as Spot[];
}

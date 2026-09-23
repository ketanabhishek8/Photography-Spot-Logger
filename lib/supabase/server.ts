import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_SPOT_COLUMNS, type Spot } from "@/lib/types";

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

  // anon only has column-level SELECT (supabase/schema.sql), not whole-table -
  // Postgres denies a bare `select *` outright rather than silently narrowing
  // it to the granted columns, so this has to name them explicitly.
  const { data, error } = await supabase
    .from("spots")
    .select(PUBLIC_SPOT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchSpots]", error.message);
    return [];
  }
  return (data ?? []) as Spot[];
}

/**
 * Which spots this browser is allowed to edit/delete, keyed by its
 * `pit_owner_token` cookie (see proxy.ts). anon/authenticated have no
 * column-level SELECT on owner_token (supabase/schema.sql), so this has to
 * run with the service-role client - never exposed to the browser, only
 * used here to compute a plain array of ids that IS safe to send down.
 */
export async function fetchOwnedIds(ownerToken: string | undefined): Promise<string[]> {
  if (!ownerToken) return [];

  try {
    const { data, error } = await createAdminClient()
      .from("spots")
      .select("id")
      .eq("owner_token", ownerToken)
      .eq("is_seed", false);

    if (error) {
      console.error("[fetchOwnedIds]", error.message);
      return [];
    }
    return (data ?? []).map((row) => row.id as string);
  } catch (err) {
    console.error("[fetchOwnedIds]", err instanceof Error ? err.message : err);
    return [];
  }
}

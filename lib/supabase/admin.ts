import "server-only"; // build fails loudly if a Client Component ever imports this
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS, so it must never reach the browser —
 * that is what the "server-only" import above enforces.
 *
 * Used for the two write paths: the seed script and POST /api/spots.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase keys.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

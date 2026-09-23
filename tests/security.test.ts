import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * These hit the live Supabase project's public REST API directly with the
 * anon key - not mocks, and not through the app's own API routes, because
 * the whole point is to check what the anon key itself can and can't do,
 * independent of anything app-level. The anon key is meant to be public (it
 * ships in the browser bundle already), so this is safe to run anywhere,
 * including a public CI run - skipped only when NEXT_PUBLIC_SUPABASE_URL
 * isn't configured at all.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasAnonCreds = !!url && !!anonKey;
const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function restHeaders() {
  return { apikey: anonKey!, Authorization: `Bearer ${anonKey}` };
}

describe.skipIf(!hasAnonCreds)("owner_token column-level grant", () => {
  it("selecting owner_token via the anon key is rejected, not just empty", async () => {
    // A working-as-intended response here is a permission-denied ERROR, not
    // a 200 with an empty/redacted array - the whole security property this
    // project relies on (see supabase/schema.sql) is that anon literally
    // cannot ask for this column, full stop. If this test ever starts
    // seeing 200, the grant has regressed and every spot's owner_token -
    // the only thing standing between "yours" and "anyone's" for
    // edit/delete - is readable by anyone with the public anon key.
    const res = await fetch(`${url}/rest/v1/spots?select=owner_token&limit=1`, { headers: restHeaders() });
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(String(body.message ?? body.error ?? "")).toMatch(/permission denied/i);
  });

  it("selecting public columns via the anon key still works", async () => {
    const res = await fetch(`${url}/rest/v1/spots?select=id,name&limit=1`, { headers: restHeaders() });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

describe.skipIf(!hasAnonCreds)("no direct anon writes", () => {
  it("a direct anon insert is rejected", async () => {
    const probeName = `vitest anon-insert probe ${Date.now()}`;
    // Deliberately NOT setting Prefer: return=representation. That would
    // make PostgREST build the response by reading the row back (like a
    // RETURNING clause), which needs its own SELECT privilege - and would
    // fail for that reason even if the INSERT itself were still allowed,
    // silently turning this into a test of the wrong thing. Plain
    // return=minimal (the default) isolates exactly the privilege this
    // test means to check.
    const res = await fetch(`${url}/rest/v1/spots`, {
      method: "POST",
      headers: { ...restHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        name: probeName,
        latitude: 19.0,
        longitude: 72.8,
        photo_path: "test/should-not-exist.jpg",
      }),
    });

    try {
      // This is the fix for IMPROVEMENTS.md #1: the app writes exclusively
      // through app/api/spots/route.ts using the service-role key, so the
      // anon key should have no insert privilege on this table at all.
      expect(res.ok).toBe(false);
    } finally {
      // Defense in depth for the test itself, regardless of what res.ok
      // said: delete-by-name is harmless if nothing was actually created,
      // and cheap insurance if the grant turned out to still allow it.
      if (hasServiceRole) {
        await createAdminClient().from("spots").delete().eq("name", probeName);
      }
    }
  });

  it("a direct anon update is rejected", async () => {
    // Read one real id via the public surface first, then try to write to it.
    const listRes = await fetch(`${url}/rest/v1/spots?select=id&limit=1`, { headers: restHeaders() });
    const [row] = await listRes.json();
    if (!row) return; // nothing seeded yet in this environment - nothing to probe

    const res = await fetch(`${url}/rest/v1/spots?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { ...restHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ name: "vandalised by vitest" }),
    });
    expect(res.ok).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, PATCH } from "./route";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_BEST_TIME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from "@/lib/types";
import { OWNER_TOKEN_COOKIE } from "@/proxy";

const hasCreds = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

function req(method: "PATCH" | "DELETE", id: string, opts: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest(`http://localhost:3000/api/spots/${id}`, {
    method,
    headers: {
      ...(opts.cookie ? { cookie: `${OWNER_TOKEN_COOKIE}=${opts.cookie}` } : {}),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH/DELETE /api/spots/[id] validation (no DB)", () => {
  // A syntactically plausible id is enough here - every one of these cases
  // is rejected before the route ever queries Supabase.
  const fakeId = "00000000-0000-0000-0000-000000000000";

  it("PATCH without the ownership cookie is rejected", async () => {
    const res = await PATCH(req("PATCH", fakeId, { body: { name: "x" } }), params(fakeId));
    expect(res.status).toBe(403);
  });

  it("DELETE without the ownership cookie is rejected", async () => {
    const res = await DELETE(req("DELETE", fakeId), params(fakeId));
    expect(res.status).toBe(403);
  });

  it("PATCH rejects an empty name", async () => {
    const res = await PATCH(req("PATCH", fakeId, { cookie: "any-token", body: { name: "   " } }), params(fakeId));
    expect(res.status).toBe(400);
  });

  it("PATCH rejects a name over the length limit", async () => {
    const res = await PATCH(
      req("PATCH", fakeId, { cookie: "any-token", body: { name: "A".repeat(MAX_NAME_LENGTH + 1) } }),
      params(fakeId),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH rejects a description over the length limit", async () => {
    const res = await PATCH(
      req("PATCH", fakeId, {
        cookie: "any-token",
        body: { name: "ok", description: "B".repeat(MAX_DESCRIPTION_LENGTH + 1) },
      }),
      params(fakeId),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH rejects a best_time over the length limit", async () => {
    const res = await PATCH(
      req("PATCH", fakeId, {
        cookie: "any-token",
        body: { name: "ok", best_time: "C".repeat(MAX_BEST_TIME_LENGTH + 1) },
      }),
      params(fakeId),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH rejects malformed JSON", async () => {
    const badReq = new NextRequest(`http://localhost:3000/api/spots/${fakeId}`, {
      method: "PATCH",
      headers: { cookie: `${OWNER_TOKEN_COOKIE}=any-token`, "content-type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(badReq, params(fakeId));
    expect(res.status).toBe(400);
  });
});

// These exercise the real ownership check against the live Supabase
// project, the same "verify against real data, not mocks" discipline the
// rest of this project has used throughout - skipped automatically when
// SUPABASE_SERVICE_ROLE_KEY isn't available (e.g. a CI run with no repo
// secrets configured), same pattern as scripts/seed.mjs's --dry-run guard.
describe.skipIf(!hasCreds)("PATCH/DELETE /api/spots/[id] ownership (real Supabase)", () => {
  // Declared here but only assigned inside beforeAll(), which respects
  // skipIf - describe()'s own callback body runs during Vitest's collection
  // phase regardless of skipIf, so calling createAdminClient() (which
  // throws without credentials) at this level would blow up collection
  // itself even when hasCreds is false, defeating the skip entirely.
  let supabase: ReturnType<typeof createAdminClient>;
  const ownerToken = `vitest-owner-${crypto.randomUUID()}`;
  const wrongToken = `vitest-wrong-${crypto.randomUUID()}`;
  let spotId: string;
  let seedSpotId: string;

  beforeAll(async () => {
    supabase = createAdminClient();
    const { data, error } = await supabase
      .from("spots")
      .insert({
        name: `vitest ownership test ${Date.now()}`,
        latitude: 19.0,
        longitude: 72.8,
        photo_path: "test/vitest-fake.jpg",
        is_seed: false,
        owner_token: ownerToken,
      })
      .select("id")
      .single();
    if (error) throw error;
    spotId = data.id;

    // A row with is_seed = true but a real owner_token - simulating "what
    // if a seed row somehow had a token" to prove the route's own is_seed
    // guard is what blocks it, not just the token happening not to match
    // (a real seeded row's owner_token is always null, so it never matches
    // anything on its own).
    const { data: seedData, error: seedError } = await supabase
      .from("spots")
      .insert({
        name: `vitest seed-guard test ${Date.now()}`,
        latitude: 19.0,
        longitude: 72.8,
        photo_path: "test/vitest-fake-seed.jpg",
        is_seed: true,
        owner_token: ownerToken,
      })
      .select("id")
      .single();
    if (seedError) throw seedError;
    seedSpotId = seedData.id;
  });

  afterAll(async () => {
    await supabase.from("spots").delete().in("id", [spotId, seedSpotId].filter(Boolean));
  });

  it("rejects PATCH with the wrong owner token", async () => {
    const res = await PATCH(req("PATCH", spotId, { cookie: wrongToken, body: { name: "Hijacked" } }), params(spotId));
    expect(res.status).toBe(403);
  });

  it("rejects DELETE with the wrong owner token", async () => {
    const res = await DELETE(req("DELETE", spotId, { cookie: wrongToken }), params(spotId));
    expect(res.status).toBe(403);
  });

  it("rejects PATCH on a seed row even when the token matches", async () => {
    const res = await PATCH(
      req("PATCH", seedSpotId, { cookie: ownerToken, body: { name: "Should not work" } }),
      params(seedSpotId),
    );
    expect(res.status).toBe(403);
  });

  it("rejects DELETE on a seed row even when the token matches", async () => {
    const res = await DELETE(req("DELETE", seedSpotId, { cookie: ownerToken }), params(seedSpotId));
    expect(res.status).toBe(403);
  });

  it("accepts PATCH with the correct owner token and actually updates the row", async () => {
    const res = await PATCH(
      req("PATCH", spotId, {
        cookie: ownerToken,
        body: { name: "Renamed by vitest", description: "updated", best_time: "Sunset" },
      }),
      params(spotId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spot.name).toBe("Renamed by vitest");
    expect(body.spot.best_time).toBe("Sunset");
    expect(body.spot.owner_token).toBeUndefined(); // PUBLIC_SPOT_COLUMNS must never include it
  });

  it("accepts DELETE with the correct owner token and actually removes the row", async () => {
    const res = await DELETE(req("DELETE", spotId, { cookie: ownerToken }), params(spotId));
    expect(res.status).toBe(200);

    const { data } = await supabase.from("spots").select("id").eq("id", spotId).maybeSingle();
    expect(data).toBeNull();
  });
});

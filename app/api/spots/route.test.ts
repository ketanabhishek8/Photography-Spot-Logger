import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import {
  MAX_BEST_TIME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TAGS,
  MAX_UPLOAD_BYTES,
  SPOT_TAGS,
} from "@/lib/types";

const URL = "http://localhost:3000/api/spots";

// Each test gets its own fake caller IP so lib/rateLimit.ts's in-memory
// counter (shared module state across every test in this file, since
// vitest runs a file in one process) never trips the 10-per-10-min limit
// and turns an expected 400 into an unexpected 429.
let ipCounter = 0;
function post(form: FormData) {
  ipCounter += 1;
  return POST(
    new NextRequest(URL, {
      method: "POST",
      body: form,
      headers: { "x-forwarded-for": `10.0.0.${ipCounter}` },
    }),
  );
}

/** A minimal valid form, so each test only has to override what it's testing. */
function validForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("name", overrides.name ?? "Test Spot");
  form.set("description", overrides.description ?? "A test description.");
  form.set("best_time", overrides.best_time ?? "Golden hour");
  form.set("latitude", overrides.latitude ?? "19.0");
  form.set("longitude", overrides.longitude ?? "72.8");
  return form;
}

describe("POST /api/spots validation", () => {
  // These all return before the route ever calls createAdminClient(), so
  // none of them touch Supabase - they're pure input validation, and stay
  // fast and deterministic without any mocking.

  it("rejects a missing name", async () => {
    const form = validForm();
    form.delete("name");
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name is required/i);
  });

  it("rejects a name over the length limit", async () => {
    const res = await post(validForm({ name: "A".repeat(MAX_NAME_LENGTH + 1) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name/i);
  });

  it("accepts a name at exactly the length limit (boundary)", async () => {
    // Not a full success case (no photo attached) - just confirms the
    // length check itself doesn't reject the boundary value, by checking
    // the error is about the photo, not the name.
    const res = await post(validForm({ name: "A".repeat(MAX_NAME_LENGTH) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/photo/i);
  });

  it("rejects a description over the length limit", async () => {
    const res = await post(validForm({ description: "B".repeat(MAX_DESCRIPTION_LENGTH + 1) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/description/i);
  });

  it("rejects a best_time over the length limit", async () => {
    const res = await post(validForm({ best_time: "C".repeat(MAX_BEST_TIME_LENGTH + 1) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/best time/i);
  });

  it("rejects an unknown tag", async () => {
    const form = validForm();
    form.append("tags", "beach");
    form.append("tags", "volcano");
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown tag: volcano/i);
  });

  it("rejects more than MAX_TAGS tags", async () => {
    const form = validForm();
    for (const tag of SPOT_TAGS.slice(0, MAX_TAGS + 1)) form.append("tags", tag);
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at most/i);
  });

  it("accepts valid tags (fails later, on the missing photo)", async () => {
    const form = validForm();
    form.append("tags", "fort");
    form.append("tags", "heritage");
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/photo/i);
  });

  it("rejects an out-of-range latitude", async () => {
    const res = await post(validForm({ latitude: "91" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/latitude/i);
  });

  it("rejects an out-of-range longitude", async () => {
    const res = await post(validForm({ longitude: "-181" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/longitude/i);
  });

  it("rejects a non-numeric coordinate", async () => {
    const res = await post(validForm({ latitude: "not-a-number" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/latitude/i);
  });

  it("rejects a missing photo", async () => {
    const res = await post(validForm());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/photo is required/i);
  });

  it("rejects a disallowed file type", async () => {
    const form = validForm();
    form.set("photo", new File(["not an image"], "test.txt", { type: "text/plain" }));
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/jpeg, png or webp/i);
  });

  it("rejects an oversize photo", async () => {
    const form = validForm();
    const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    form.set("photo", new File([oversized], "big.jpg", { type: "image/jpeg" }));
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/under 8 MB/i);
  });
});

describe("POST /api/spots rate limiting", () => {
  it("returns 429 after too many requests from the same caller", async () => {
    const sameIp = "10.99.99.99";
    let lastRes: Response | undefined;
    for (let i = 0; i < 11; i++) {
      lastRes = await POST(
        new NextRequest(URL, {
          method: "POST",
          body: validForm(), // missing photo -> would 400 if it got that far
          headers: { "x-forwarded-for": sameIp },
        }),
      );
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).toBeTruthy();
  });
});

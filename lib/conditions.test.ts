import { describe, expect, it } from "vitest";
import { classify, fetchConditions, summarize, type Forecast } from "./conditions";

/** Two days of hourly data for Mumbai (UTC+5:30), overridable per hour. */
function forecast(overrides: Record<string, [cloud: number, visM: number, rain: number]> = {}): Forecast {
  const time: string[] = [];
  const cloud_cover: number[] = [];
  const visibility: number[] = [];
  const precipitation_probability: number[] = [];
  for (const day of ["2026-09-25", "2026-09-26"]) {
    for (let h = 0; h < 24; h++) {
      const t = `${day}T${String(h).padStart(2, "0")}:00`;
      const [c, v, r] = overrides[t] ?? [10, 20_000, 0];
      time.push(t);
      cloud_cover.push(c);
      visibility.push(v);
      precipitation_probability.push(r);
    }
  }
  return {
    utc_offset_seconds: 19_800,
    daily: {
      time: ["2026-09-25", "2026-09-26"],
      sunrise: ["2026-09-25T06:27", "2026-09-26T06:28"],
      sunset: ["2026-09-25T18:32", "2026-09-26T18:31"],
    },
    hourly: { time, cloud_cover, visibility, precipitation_probability },
  };
}

/** A UTC instant from a Mumbai local time. */
const ist = (local: string) => new Date(Date.parse(`${local}:00+05:30`));

describe("classify", () => {
  it.each([
    [10, 20, 0, "Clear"],
    [40, 20, 0, "Partly cloudy"],
    [10, 3, 0, "Hazy"],
    [40, 3, 0, "Hazy"], // haze beats a few clouds
    [80, 3, 0, "Overcast"], // overcast beats haze
    [80, 20, 60, "Rain likely"], // rain beats everything
    [34, 20, 49, "Clear"], // just under every threshold
  ] as const)("cloud %i%%, vis %i km, rain %i%% -> %s", (c, v, r, expected) => {
    expect(classify(c, v, r)).toBe(expected);
  });
});

describe("summarize", () => {
  it("picks today's sunrise and sunset in the early morning", () => {
    const { sunrise, sunset } = summarize(forecast(), ist("2026-09-25T05:00"));
    expect(sunrise).toMatchObject({ time: "06:27", day: "today", verdict: "Clear" });
    expect(sunset).toMatchObject({ time: "18:32", day: "today" });
  });

  it("rolls sunrise over to tomorrow once it has passed", () => {
    const { sunrise, sunset } = summarize(forecast(), ist("2026-09-25T12:00"));
    expect(sunrise).toMatchObject({ time: "06:28", day: "tomorrow" });
    expect(sunset).toMatchObject({ time: "18:32", day: "today" });
  });

  it("rolls both over after sunset", () => {
    const { sunrise, sunset } = summarize(forecast(), ist("2026-09-25T20:00"));
    expect(sunrise?.day).toBe("tomorrow");
    expect(sunset).toMatchObject({ time: "18:31", day: "tomorrow" });
  });

  it("reads the hourly slot nearest the event (18:32 -> 19:00)", () => {
    const f = forecast({ "2026-09-25T19:00": [90, 20_000, 10], "2026-09-25T18:00": [0, 20_000, 0] });
    const { sunset } = summarize(f, ist("2026-09-25T12:00"));
    expect(sunset).toMatchObject({ cloudCover: 90, verdict: "Overcast" });
  });

  it("converts visibility to km", () => {
    const f = forecast({ "2026-09-25T06:00": [10, 3_400, 0] });
    const { sunrise } = summarize(f, ist("2026-09-25T05:00"));
    expect(sunrise).toMatchObject({ visibilityKm: 3.4, verdict: "Hazy" });
  });

  it("returns null when there's no later event in the forecast", () => {
    expect(summarize(forecast(), ist("2026-09-26T21:00"))).toEqual({ sunrise: null, sunset: null });
  });

  it("returns null for an event whose hourly data is missing", () => {
    const f = forecast();
    const i = f.hourly.time.indexOf("2026-09-25T19:00");
    f.hourly.cloud_cover[i] = null;
    expect(summarize(f, ist("2026-09-25T12:00")).sunset).toBeNull();
  });
});

describe("fetchConditions", () => {
  it("returns null instead of throwing when the forecast API is unreachable", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    try {
      // Coordinates no other test uses, so the module cache can't answer.
      await expect(fetchConditions(1.23, 4.56)).resolves.toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("returns null on a non-OK response", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(new Response("rate limited", { status: 429 }))) as typeof fetch;
    try {
      await expect(fetchConditions(7.89, 1.01)).resolves.toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

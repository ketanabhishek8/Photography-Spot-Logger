import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lightBucket } from "./light";

describe("lightBucket", () => {
  it.each([
    ["Sunrise", "sunrise"],
    ["Early morning", "sunrise"],
    ["Monsoon mornings", "sunrise"],
    ["Morning", "day"],
    ["Mid morning", "day"],
    ["Late morning", "day"],
    ["Midday", "day"],
    ["Golden hour", "golden"],
    ["Sunset", "golden"],
    ["Evening", "golden"],
    ["Blue hour", "night"],
    ["Night", "night"],
    ["  NIGHT  ", "night"],
  ])("%s -> %s", (input, expected) => {
    expect(lightBucket(input)).toBe(expected);
  });

  it("returns null for empty or unrecognised values", () => {
    expect(lightBucket(null)).toBeNull();
    expect(lightBucket("")).toBeNull();
    expect(lightBucket("whenever")).toBeNull();
  });

  it("buckets every best_time used by the seeded spots", () => {
    const spots = JSON.parse(
      readFileSync(path.join(__dirname, "../scripts/mumbai-spots.json"), "utf8"),
    ) as { name: string; best_time: string }[];
    const unbucketed = spots.filter((s) => lightBucket(s.best_time) === null).map((s) => s.name);
    expect(unbucketed).toEqual([]);
  });
});

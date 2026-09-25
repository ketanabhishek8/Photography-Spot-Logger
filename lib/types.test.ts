import { describe, expect, it } from "vitest";
import { MAX_TAGS, parseTags, SPOT_TAGS } from "./types";

describe("parseTags", () => {
  it("normalises case and whitespace, and dedupes", () => {
    expect(parseTags([" Beach", "beach", "FORT", ""])).toEqual({ tags: ["beach", "fort"] });
  });

  it("accepts an empty list", () => {
    expect(parseTags([])).toEqual({ tags: [] });
  });

  it("rejects unknown tags, naming them", () => {
    expect(parseTags(["beach", "volcano"])).toEqual({ error: "Unknown tag: volcano." });
  });

  it("rejects more than MAX_TAGS, counting after dedupe", () => {
    expect(parseTags(SPOT_TAGS.slice(0, MAX_TAGS + 1))).toHaveProperty("error");
    expect(parseTags([...SPOT_TAGS.slice(0, MAX_TAGS), SPOT_TAGS[0]])).toHaveProperty("tags");
  });

  it("rejects non-arrays", () => {
    expect(parseTags("beach")).toHaveProperty("error");
    expect(parseTags(null)).toHaveProperty("error");
  });
});

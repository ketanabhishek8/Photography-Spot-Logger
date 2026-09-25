/**
 * Groups the free-text `best_time` values into four kinds of light, so the
 * map can colour pins by them and the sidebar can filter by them. The data
 * has a dozen spellings ("Early morning", "Mid morning", "Monsoon mornings",
 * "Evening"...) and users can type anything, so this matches on keywords
 * rather than a fixed list.
 *
 * Colours are pin fills. Each is at least 3:1 against MapTiler's light
 * street tiles (the white pin border does the separating on dark tiles).
 */
export type LightBucket = "sunrise" | "day" | "golden" | "night";

export const LIGHT_BUCKETS: { id: LightBucket; label: string; short: string; color: string }[] = [
  { id: "sunrise", label: "Sunrise", short: "Sunrise", color: "#b7791f" },
  { id: "day", label: "Daytime", short: "Day", color: "#3f8f5a" },
  { id: "golden", label: "Golden & sunset", short: "Golden", color: "#c1502e" },
  { id: "night", label: "Blue hour & night", short: "Night", color: "#6d5bd0" },
];

/** Pin colour for spots whose best_time doesn't fit any bucket (or is empty). */
export const UNBUCKETED_COLOR = "#8a8171";

// Order matters: "early morning" and "monsoon mornings" must be caught as
// sunrise before the plain "morning" rule claims them as daytime.
const RULES: [RegExp, LightBucket][] = [
  [/sunrise|dawn|early morning|monsoon morning/, "sunrise"],
  [/golden|sunset|evening|dusk/, "golden"],
  [/blue hour|night/, "night"],
  [/morning|midday|noon|afternoon|daytime/, "day"],
];

export function lightBucket(bestTime: string | null | undefined): LightBucket | null {
  if (!bestTime) return null;
  const t = bestTime.toLowerCase();
  for (const [re, bucket] of RULES) if (re.test(t)) return bucket;
  return null;
}

export function lightColor(bucket: LightBucket | null): string {
  return LIGHT_BUCKETS.find((b) => b.id === bucket)?.color ?? UNBUCKETED_COLOR;
}

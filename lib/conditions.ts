/**
 * "Is it worth going out?" - sky conditions at the next sunrise and sunset
 * for a spot, from Open-Meteo (free, no API key, CC BY 4.0 - the detail page
 * credits it). Split into a fetch with a cache, and a pure summarize() that
 * the tests exercise with fixture data.
 */

export type Verdict = "Clear" | "Partly cloudy" | "Hazy" | "Overcast" | "Rain likely";

export type SkyEvent = {
  kind: "sunrise" | "sunset";
  /** Local time at the spot, "HH:MM" (24h). */
  time: string;
  day: "today" | "tomorrow";
  cloudCover: number; // %
  visibilityKm: number;
  rainChance: number; // %
  verdict: Verdict;
};

export type Conditions = { sunrise: SkyEvent | null; sunset: SkyEvent | null };

/** The subset of Open-Meteo's /v1/forecast response this module reads. */
export type Forecast = {
  utc_offset_seconds: number;
  daily: { time: string[]; sunrise: string[]; sunset: string[] };
  hourly: {
    time: string[];
    cloud_cover: (number | null)[];
    visibility: (number | null)[];
    precipitation_probability: (number | null)[];
  };
};

/**
 * Thresholds are checked in order, worst first: rain beats everything, a
 * mostly-covered sky beats haze, and haze (Mumbai's usual problem - the
 * light is there but everything past a few km goes flat and grey) beats a
 * few clouds, which often make a sunset better rather than worse.
 */
export function classify(cloudCover: number, visibilityKm: number, rainChance: number): Verdict {
  if (rainChance >= 50) return "Rain likely";
  if (cloudCover >= 75) return "Overcast";
  if (visibilityKm < 5) return "Hazy";
  if (cloudCover >= 35) return "Partly cloudy";
  return "Clear";
}

// Open-Meteo returns local times with no offset ("2026-09-25T18:32").
// Parsing them as if they were UTC keeps every comparison and difference
// consistent without needing the spot's timezone rules.
const asUtc = (local: string) => Date.parse(`${local}Z`);

function eventAt(
  kind: SkyEvent["kind"],
  times: string[],
  forecast: Forecast,
  localNow: number,
  today: string,
): SkyEvent | null {
  const next = times.find((t) => asUtc(t) > localNow);
  if (!next) return null;

  // Nearest hourly slot to the event itself (sunset at 18:32 reads 19:00).
  const { hourly } = forecast;
  let best = -1;
  let bestDiff = Infinity;
  hourly.time.forEach((t, i) => {
    const diff = Math.abs(asUtc(t) - asUtc(next));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  if (best === -1 || bestDiff > 90 * 60_000) return null;

  const cloudCover = hourly.cloud_cover[best];
  const visibility = hourly.visibility[best];
  const rainChance = hourly.precipitation_probability[best] ?? 0;
  if (cloudCover == null || visibility == null) return null;

  const visibilityKm = Math.round(visibility / 100) / 10;
  return {
    kind,
    time: next.slice(11, 16),
    day: next.slice(0, 10) === today ? "today" : "tomorrow",
    cloudCover,
    visibilityKm,
    rainChance,
    verdict: classify(cloudCover, visibilityKm, rainChance),
  };
}

/** The next sunrise and next sunset after `now`, each with its conditions. */
export function summarize(forecast: Forecast, now: Date): Conditions {
  const localNow = now.getTime() + forecast.utc_offset_seconds * 1000;
  const today = new Date(localNow).toISOString().slice(0, 10);
  return {
    sunrise: eventAt("sunrise", forecast.daily.sunrise, forecast, localNow, today),
    sunset: eventAt("sunset", forecast.daily.sunset, forecast, localNow, today),
  };
}

/*
 * The spot page is force-dynamic (so edits show immediately), and in this
 * Next version that forces every fetch() on it to no-store - a
 * `next: { revalidate }` option would be silently ignored. So cache here
 * instead: per server instance, keyed by rounded coordinates (Open-Meteo's
 * grid is ~9 km anyway, so nearby spots share an entry). Forecasts only
 * update hourly, so 30 minutes loses nothing.
 */
const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; forecast: Forecast }>();

/** Conditions for a spot, or null if the forecast can't be fetched right now. */
export async function fetchConditions(lat: number, lng: number): Promise<Conditions | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return summarize(hit.forecast, new Date());

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: "cloud_cover,visibility,precipitation_probability",
    daily: "sunrise,sunset",
    timezone: "auto",
    forecast_days: "2",
  }).toString();

  try {
    // A slow forecast must never hold up the page - it's a nice-to-have.
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const forecast = (await res.json()) as Forecast;
    cache.set(key, { at: Date.now(), forecast });
    return summarize(forecast, new Date());
  } catch {
    return null;
  }
}

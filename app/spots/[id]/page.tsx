import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import ShareButton from "@/components/ShareButton";
import SpotMiniMap from "@/components/SpotMiniMap";
import ThemeToggle from "@/components/ThemeToggle";
import { fetchConditions, type SkyEvent } from "@/lib/conditions";
import { lightBucket, lightColor } from "@/lib/light";
import { photoUrl } from "@/lib/supabase/client";
import { PUBLIC_SPOT_COLUMNS, type Spot } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getSpot(id: string): Promise<Spot | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // anon only has column-level SELECT (supabase/schema.sql), not whole-table -
  // a bare select("*") gets denied outright rather than narrowed.
  const { data } = await supabase
    .from("spots")
    .select(PUBLIC_SPOT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as Spot) ?? null;
}

export default async function SpotPage({ params }: PageProps<"/spots/[id]">) {
  const { id } = await params;
  const spot = await getSpot(id);
  if (!spot) notFound();

  const bucket = lightBucket(spot.best_time);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`;

  return (
    <main className="min-h-dvh pb-10">
      {/* ------------------------------------------------------------ hero */}
      <header className="relative h-[55vh] min-h-80 w-full overflow-hidden bg-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl(spot.photo_path)}
          alt={spot.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Text sits on the photo in white in both themes, so the gradient
            (not the theme) is what guarantees contrast behind it. */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-black/30" />

        <nav className="absolute inset-x-0 top-0 mx-auto flex max-w-3xl items-center justify-between px-5 pt-4">
          <Link
            href="/"
            className="rounded-full bg-paper/85 px-3 py-1.5 text-sm font-medium text-ink shadow-sm backdrop-blur transition hover:bg-paper"
          >
            &larr; Map
          </Link>
          <div className="rounded-lg bg-paper/85 shadow-sm backdrop-blur">
            <ThemeToggle />
          </div>
        </nav>

        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-5 pb-6">
          <div className="flex flex-wrap gap-1.5">
            {spot.best_time && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full ring-1 ring-white/70"
                  style={{ background: lightColor(bucket) }}
                />
                Best at {spot.best_time.toLowerCase()}
              </span>
            )}
            {spot.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs capitalize text-white backdrop-blur"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight text-white drop-shadow sm:text-4xl">
            {spot.name}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5">
        {/* --------------------------------------------------------- actions */}
        <div className="mt-5 flex gap-2">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 14.5s-4.5-4.2-4.5-7.7a4.5 4.5 0 0 1 9 0c0 3.5-4.5 7.7-4.5 7.7Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="6.8" r="1.6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Directions
          </a>
          <ShareButton
            title={spot.name}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm text-ink transition hover:bg-accent-soft"
          />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_15rem]">
          <div className="min-w-0">
            {spot.description && <p className="leading-relaxed text-ink">{spot.description}</p>}

            <Suspense fallback={<ConditionsSkeleton />}>
              <SkyConditions lat={spot.latitude} lng={spot.longitude} bucket={bucket} />
            </Suspense>
          </div>

          {/* -------------------------------------------------------- where */}
          <aside>
            <div className="h-48 overflow-hidden rounded-xl border border-line">
              <SpotMiniMap lat={spot.latitude} lng={spot.longitude} bestTime={spot.best_time} />
            </div>
            <p className="mt-2 font-mono text-xs text-muted">
              {spot.latitude.toFixed(5)}, {spot.longitude.toFixed(5)}
            </p>
          </aside>
        </div>

        {/* CC licences require attribution, so it is stored per spot and shown here. */}
        <footer className="mt-8 border-t border-line pt-4 text-xs text-muted">
          {spot.attribution && (
            <p>
              Photo: {spot.attribution}
              {spot.license && ` (${spot.license})`}
              {spot.source_url && (
                <>
                  {" "}
                  &middot;{" "}
                  <a href={spot.source_url} className="underline" target="_blank" rel="noreferrer">
                    source
                  </a>
                </>
              )}
            </p>
          )}
          <p className="mt-1">Added {new Date(spot.created_at).toLocaleDateString()}</p>
        </footer>
      </div>
    </main>
  );
}

/**
 * Next sunrise and sunset with the forecast sky, highlighting whichever one
 * matches the spot's kind of light. Renders nothing if the forecast is
 * unavailable - it's a bonus, not something the page depends on.
 */
async function SkyConditions({ lat, lng, bucket }: { lat: number; lng: number; bucket: ReturnType<typeof lightBucket> }) {
  const conditions = await fetchConditions(lat, lng);
  if (!conditions || (!conditions.sunrise && !conditions.sunset)) return null;

  const highlight = bucket === "sunrise" ? "sunrise" : bucket === "golden" || bucket === "night" ? "sunset" : null;
  const events = [conditions.sunrise, conditions.sunset].filter((e): e is SkyEvent => e !== null);

  return (
    <section className="mt-6" aria-labelledby="sky-heading">
      <h2 id="sky-heading" className="font-display text-lg font-semibold text-ink">
        Sky forecast
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {events.map((e) => (
          <SkyCard key={e.kind} event={e} highlighted={e.kind === highlight} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Forecast by{" "}
        <a href="https://open-meteo.com/" className="underline" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0), updated hourly.
      </p>
    </section>
  );
}

function SkyCard({ event, highlighted }: { event: SkyEvent; highlighted: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlighted ? "border-accent/60 bg-accent-soft/60" : "border-line"
      }`}
    >
      <p className="text-xs text-muted">
        {event.kind === "sunrise" ? "Sunrise" : "Sunset"} &middot; {event.day} {to12h(event.time)}
      </p>
      <p className="mt-0.5 font-display text-lg font-semibold text-ink">{event.verdict}</p>
      <p className="mt-0.5 text-xs text-muted">
        {event.cloudCover}% cloud &middot; {event.visibilityKm} km visibility
        {event.rainChance >= 20 && <> &middot; {event.rainChance}% rain</>}
      </p>
      {highlighted && (
        <p className="mt-1.5 text-[11px] font-medium text-accent-text">Best light for this spot</p>
      )}
    </div>
  );
}

function ConditionsSkeleton() {
  return (
    <div className="mt-6" aria-hidden="true">
      <div className="h-5 w-32 rounded bg-line" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="h-24 animate-pulse rounded-xl bg-line/60" />
        <div className="h-24 animate-pulse rounded-xl bg-line/60" />
      </div>
    </div>
  );
}

/** "18:32" -> "6:32 pm" */
function to12h(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ThemeToggle from "@/components/ThemeToggle";
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

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-start justify-between gap-2">
        <Link href="/" className="text-sm text-accent-text underline">
          &larr; Back to the map
        </Link>
        <ThemeToggle />
      </div>

      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
        {spot.name}
      </h1>

      <p className="mt-1 font-mono text-xs text-muted">
        {spot.latitude.toFixed(5)}, {spot.longitude.toFixed(5)}
        {spot.best_time && <span className="font-sans"> &middot; best at {spot.best_time}</span>}
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl(spot.photo_path)}
        alt={spot.name}
        className="mt-5 w-full rounded-xl bg-line object-cover"
      />

      {spot.description && (
        <p className="mt-5 leading-relaxed text-ink">{spot.description}</p>
      )}

      {/* CC licences require attribution, so it is stored per spot and shown here. */}
      {spot.attribution && (
        <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
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

      <p className="mt-2 text-xs text-muted">
        Added {new Date(spot.created_at).toLocaleDateString()}
      </p>
    </main>
  );
}

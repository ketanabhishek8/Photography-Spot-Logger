"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AddSpotForm from "@/components/AddSpotForm";
import { getSupabase, photoUrl } from "@/lib/supabase/client";
import type { Spot } from "@/lib/types";

/**
 * Leaflet touches `window` at import time, so the map must never be server
 * rendered. `ssr: false` is only allowed inside a Client Component, which is
 * why this wrapper exists between the Server Component page and SpotMap.
 */
const SpotMap = dynamic(() => import("@/components/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-stone-100 text-sm text-stone-400">
      Loading map...
    </div>
  ),
});

const RADIUS_M = 5000;

export default function MapExperience({ spots }: { spots: Spot[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draftPin, setDraftPin] = useState<[number, number] | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [nearbyIds, setNearbyIds] = useState<string[] | null>(null);
  const [nearbyNote, setNearbyNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [bestTimeFilter, setBestTimeFilter] = useState("");

  const visible = useMemo(() => {
    let list = nearbyIds ? spots.filter((s) => nearbyIds.includes(s.id)) : spots;

    if (bestTimeFilter) list = list.filter((s) => s.best_time === bestTimeFilter);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q),
      );
    }

    return list;
  }, [spots, nearbyIds, search, bestTimeFilter]);

  const filtering = search.trim() !== "" || bestTimeFilter !== "";

  // Derived from the actual data rather than the add-form's curated preset
  // list (lib/types.ts BEST_TIME_OPTIONS) - the seeded spots use values like
  // "Sunset" and "Early morning" that aren't in that shorter list, and the
  // filter needs to be able to reach everything that's actually there.
  const availableBestTimes = useMemo(
    () =>
      Array.from(new Set(spots.map((s) => s.best_time).filter((t): t is string => Boolean(t)))).sort(),
    [spots],
  );

  function startAdding() {
    setAdding(true);
    setPicking(true);
  }

  function resetAdding() {
    setAdding(false);
    setPicking(false);
    setDraftPin(null);
  }

  /**
   * Proximity search runs in Postgres via the PostGIS ST_DWithin function
   * rather than filtering in JavaScript - see spots_within_radius in schema.sql.
   */
  async function findNearby() {
    if (nearbyIds) {
      setNearbyIds(null);
      setNearbyNote(null);
      return;
    }
    if (!navigator.geolocation) {
      setNearbyNote("This browser has no geolocation.");
      return;
    }
    setNearbyNote("Locating...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const { data, error } = await getSupabase().rpc("spots_within_radius", {
            lat: latitude,
            lng: longitude,
            radius_m: RADIUS_M,
          });
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as Spot[];
          setNearbyIds(rows.map((r) => r.id));
          setFlyTarget([latitude, longitude]);
          setNearbyNote(`${rows.length} spot${rows.length === 1 ? "" : "s"} within 5 km`);
        } catch (err) {
          setNearbyNote(err instanceof Error ? err.message : "Nearby search failed.");
        }
      },
      () => setNearbyNote("Location permission denied."),
    );
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ------------------------------------------------------------- panel */}
      <aside className="flex w-full shrink-0 flex-col border-b border-stone-200 bg-white lg:h-full lg:w-88 lg:border-b-0 lg:border-r">
        <header className="border-b border-stone-200 px-5 py-4">
          <h1 className="text-lg font-semibold tracking-tight text-stone-900">
            Mumbai Photo Spots
          </h1>
          <p className="mt-0.5 text-xs text-stone-500">
            {visible.length === spots.length
              ? `${spots.length} spot${spots.length === 1 ? "" : "s"} logged`
              : `${visible.length} of ${spots.length} spots`}
          </p>

          <div className="mt-3 flex gap-2">
            {!adding && (
              <button
                onClick={startAdding}
                className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-700"
              >
                Log a spot
              </button>
            )}
            <button
              onClick={findNearby}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                nearbyIds
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-stone-300 text-stone-600 hover:bg-stone-50"
              }`}
            >
              {nearbyIds ? "Show all" : "Near me"}
            </button>
          </div>

          {nearbyNote && <p className="mt-2 text-xs text-stone-500">{nearbyNote}</p>}

          {!adding && (
            <div className="mt-3 flex gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spots..."
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm
                           outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
              <select
                value={bestTimeFilter}
                onChange={(e) => setBestTimeFilter(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-600
                           outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              >
                <option value="">Any time</option>
                {availableBestTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {adding ? (
            <div className="p-5">
              {picking && !draftPin && (
                <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  Click anywhere on the map to drop your pin.
                </p>
              )}
              <AddSpotForm
                draftPin={draftPin}
                onRequestPick={() => {
                  setPicking(true);
                  setDraftPin(null);
                }}
                onCancel={resetAdding}
                onCreated={() => {
                  resetAdding();
                  router.refresh(); // re-runs the Server Component fetch
                }}
                onExifLocation={(lat, lng) => {
                  setDraftPin([lat, lng]);
                  setPicking(false);
                  setFlyTarget([lat, lng]); // the photo's location is likely off-screen
                }}
              />
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {visible.map((spot) => (
                <li key={spot.id}>
                  <button
                    onClick={() => setFlyTarget([spot.latitude, spot.longitude])}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-stone-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl(spot.photo_path)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-md bg-stone-200 object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-900">
                        {spot.name}
                      </span>
                      {spot.best_time && (
                        <span className="block text-xs text-stone-500">{spot.best_time}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-stone-400">
                  {filtering ? (
                    <>
                      No spots match.{" "}
                      <button
                        onClick={() => {
                          setSearch("");
                          setBestTimeFilter("");
                        }}
                        className="text-orange-700 underline"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    "No spots to show."
                  )}
                </li>
              )}
            </ul>
          )}
        </div>
      </aside>

      {/* --------------------------------------------------------------- map */}
      <div className="h-[60vh] min-h-0 flex-1 lg:h-full">
        <SpotMap
          spots={visible}
          draftPin={draftPin}
          pickingLocation={picking}
          flyTarget={flyTarget}
          onPick={(lat, lng) => {
            setDraftPin([lat, lng]);
            setPicking(false);
          }}
        />
      </div>
    </div>
  );
}

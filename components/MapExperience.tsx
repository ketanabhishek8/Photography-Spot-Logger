"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AddSpotForm from "@/components/AddSpotForm";
import EditSpotForm from "@/components/EditSpotForm";
import ThemeToggle from "@/components/ThemeToggle";
import { getSupabase, photoThumbUrl } from "@/lib/supabase/client";
import type { Spot } from "@/lib/types";

/**
 * Leaflet touches `window` at import time, so the map must never be server
 * rendered. `ssr: false` is only allowed inside a Client Component, which is
 * why this wrapper exists between the Server Component page and SpotMap.
 */
const SpotMap = dynamic(() => import("@/components/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-paper text-sm text-muted">
      Loading map...
    </div>
  ),
});

const RADIUS_OPTIONS_KM = [1, 5, 10] as const;
const DEFAULT_RADIUS_KM = 5;

export default function MapExperience({ spots, ownedIds }: { spots: Spot[]; ownedIds: string[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draftPin, setDraftPin] = useState<[number, number] | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [nearbyIds, setNearbyIds] = useState<string[] | null>(null);
  const [nearbyNote, setNearbyNote] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  // Kept so changing the radius re-queries with the same location fix
  // rather than asking the browser for permission/a GPS lock all over again.
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [search, setSearch] = useState("");
  const [bestTimeFilter, setBestTimeFilter] = useState("");
  const [view, setView] = useState<"list" | "gallery">("list");
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Which spots this browser logged and can therefore edit/delete - computed
  // server-side (app/page.tsx) from the pit_owner_token cookie, since only
  // the service-role client can read owner_token at all (see schema.sql).
  const ownedSet = useMemo(() => new Set(ownedIds), [ownedIds]);
  const editing = adding || editingSpot !== null;

  async function handleDelete(spot: Spot) {
    if (!window.confirm(`Delete "${spot.name}"? This can't be undone.`)) return;
    setDeletingId(spot.id);
    try {
      const res = await fetch(`/api/spots/${spot.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Could not delete the spot.");
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeletingId(null);
    }
  }

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
  async function runNearbySearch(lat: number, lng: number, km: number) {
    try {
      const { data, error } = await getSupabase().rpc("spots_within_radius", {
        lat,
        lng,
        radius_m: km * 1000,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Spot[];
      setNearbyIds(rows.map((r) => r.id));
      setNearbyNote(`${rows.length} spot${rows.length === 1 ? "" : "s"} within ${km} km`);
    } catch (err) {
      setNearbyNote(err instanceof Error ? err.message : "Nearby search failed.");
    }
  }

  function findNearby() {
    if (nearbyIds) {
      setNearbyIds(null);
      setNearbyNote(null);
      setUserCoords(null);
      return;
    }
    if (!navigator.geolocation) {
      setNearbyNote("This browser has no geolocation.");
      return;
    }
    setNearbyNote("Locating...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserCoords([latitude, longitude]);
        setFlyTarget([latitude, longitude]);
        runNearbySearch(latitude, longitude, radiusKm);
      },
      () => setNearbyNote("Location permission denied."),
    );
  }

  function changeRadius(km: number) {
    setRadiusKm(km);
    if (userCoords) runNearbySearch(userCoords[0], userCoords[1], km);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ------------------------------------------------------------- panel */}
      <aside className="flex w-full shrink-0 flex-col border-b border-line bg-paper lg:h-full lg:w-88 lg:border-b-0 lg:border-r">
        <header className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
              Mumbai Photo Spots
            </h1>
            <ThemeToggle />
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <p className="text-xs text-muted">
              {visible.length === spots.length
                ? `${spots.length} spot${spots.length === 1 ? "" : "s"} logged`
                : `${visible.length} of ${spots.length} spots`}
            </p>
            {!editing && (
              <div className="flex overflow-hidden rounded-md border border-line">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  aria-pressed={view === "list"}
                  aria-label="List view"
                  title="List view"
                  className={`px-1.5 py-1 transition ${
                    view === "list" ? "bg-tide text-white" : "text-muted hover:bg-accent-soft"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M2 4h12M2 8h12M2 12h12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setView("gallery")}
                  aria-pressed={view === "gallery"}
                  aria-label="Gallery view"
                  title="Gallery view"
                  className={`border-l border-line px-1.5 py-1 transition ${
                    view === "gallery" ? "bg-tide text-white" : "text-muted hover:bg-accent-soft"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
                    <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
                    <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
                    <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            {!editing && (
              <button
                onClick={startAdding}
                className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
              >
                Log a spot
              </button>
            )}
            <button
              onClick={findNearby}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                nearbyIds
                  ? "border-tide/30 bg-tide/10 text-tide-text"
                  : "border-line text-ink hover:bg-accent-soft"
              }`}
            >
              {nearbyIds ? "Show all" : "Near me"}
            </button>
          </div>

          {nearbyNote && <p className="mt-2 text-xs text-muted">{nearbyNote}</p>}

          {!editing && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted">Radius</span>
              <div className="flex overflow-hidden rounded-md border border-line">
                {RADIUS_OPTIONS_KM.map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => changeRadius(km)}
                    aria-pressed={radiusKm === km}
                    className={`px-2 py-1 text-xs transition ${
                      radiusKm === km ? "bg-tide text-white" : "text-muted hover:bg-accent-soft"
                    }`}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </div>
          )}

          {!editing && (
            <div className="mt-3 flex gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spots..."
                className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-1.5 text-sm text-ink
                           outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <select
                value={bestTimeFilter}
                onChange={(e) => setBestTimeFilter(e.target.value)}
                className="rounded-xl border border-line bg-paper px-2 py-1.5 text-sm text-ink
                           outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
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
                <p className="mb-3 rounded-xl bg-tide/10 px-3 py-2 text-xs text-tide-text">
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
          ) : editingSpot ? (
            <EditSpotForm
              spot={editingSpot}
              onCancel={() => setEditingSpot(null)}
              onSaved={() => {
                setEditingSpot(null);
                router.refresh();
              }}
            />
          ) : visible.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              {filtering ? (
                <>
                  No spots match.{" "}
                  <button
                    onClick={() => {
                      setSearch("");
                      setBestTimeFilter("");
                    }}
                    className="text-accent-text underline"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                "No spots to show."
              )}
            </p>
          ) : view === "list" ? (
            <ul className="divide-y divide-line">
              {visible.map((spot) => {
                const mine = ownedSet.has(spot.id);
                return (
                  <li key={spot.id} className="flex items-center gap-1 px-2 transition hover:bg-accent-soft/40">
                    <button
                      onClick={() => setFlyTarget([spot.latitude, spot.longitude])}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoThumbUrl(spot.photo_path)}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-md bg-line object-cover"
                        loading="lazy"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {spot.name}
                        </span>
                        {spot.best_time && (
                          <span className="block text-xs text-muted">{spot.best_time}</span>
                        )}
                      </span>
                    </button>
                    {mine && (
                      <SpotOwnerControls
                        deleting={deletingId === spot.id}
                        onEdit={() => setEditingSpot(spot)}
                        onDelete={() => handleDelete(spot)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            // Gallery view: bigger square thumbnails in a 2-column grid, useful
            // once there are enough spots that scanning the plain list feels
            // slow - the whole point of adding this alongside the list.
            <div className="grid grid-cols-2 gap-2 p-3">
              {visible.map((spot) => {
                const mine = ownedSet.has(spot.id);
                return (
                  <div key={spot.id} className="group relative">
                    <button
                      onClick={() => setFlyTarget([spot.latitude, spot.longitude])}
                      className="w-full text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoThumbUrl(spot.photo_path)}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full rounded-xl bg-line object-cover transition group-hover:opacity-90"
                      />
                      <span className="mt-1 block truncate text-xs font-medium text-ink">
                        {spot.name}
                      </span>
                      {spot.best_time && (
                        <span className="block truncate text-[11px] text-muted">
                          {spot.best_time}
                        </span>
                      )}
                    </button>
                    {mine && (
                      <div className="absolute right-1 top-1">
                        <SpotOwnerControls
                          deleting={deletingId === spot.id}
                          onEdit={() => setEditingSpot(spot)}
                          onDelete={() => handleDelete(spot)}
                          overlay
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
          userCoords={userCoords}
          onPick={(lat, lng) => {
            setDraftPin([lat, lng]);
            setPicking(false);
          }}
        />
      </div>
    </div>
  );
}

/** Small edit/delete icon pair shown only on spots this browser owns. */
function SpotOwnerControls({
  deleting,
  onEdit,
  onDelete,
  overlay = false,
}: {
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  overlay?: boolean;
}) {
  const btn = overlay
    ? "rounded-md bg-paper/90 p-1 text-muted shadow-sm backdrop-blur transition hover:text-ink disabled:opacity-50"
    : "shrink-0 rounded-md p-1.5 text-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-50";

  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" onClick={onEdit} aria-label="Edit spot" title="Edit" className={btn}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M11.3 2.3a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-7 7-2.7.7.7-2.7 7-7Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Delete spot"
        title="Delete"
        className={btn}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M6 7.5v4M10 7.5v4M4 4.5l.6 8a1 1 0 0 0 1 .95h4.8a1 1 0 0 0 1-.95l.6-8"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

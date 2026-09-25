"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AddSpotForm from "@/components/AddSpotForm";
import EditSpotForm from "@/components/EditSpotForm";
import ThemeToggle from "@/components/ThemeToggle";
import { getSupabase, photoThumbUrl } from "@/lib/supabase/client";
import { LIGHT_BUCKETS, lightBucket, type LightBucket } from "@/lib/light";
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
  // Empty means "all" - otherwise only spots in the chosen light buckets.
  const [lightFilter, setLightFilter] = useState<LightBucket[]>([]);
  const [view, setView] = useState<"list" | "gallery">("list");
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Inline "Delete? Cancel / Delete" state, replacing window.confirm/alert -
  // the native dialogs looked out of place next to the rest of the UI and
  // can't be themed for dark mode.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Which spots this browser logged and can therefore edit/delete - computed
  // server-side (app/page.tsx) from the pit_owner_token cookie, since only
  // the service-role client can read owner_token at all (see schema.sql).
  const ownedSet = useMemo(() => new Set(ownedIds), [ownedIds]);
  const editing = adding || editingSpot !== null;

  async function handleDelete(spot: Spot) {
    setConfirmingId(null);
    setDeleteError(null);
    setDeletingId(spot.id);
    try {
      const res = await fetch(`/api/spots/${spot.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Could not delete the spot.");
      }
      router.refresh();
    } catch (err) {
      setDeleteError(
        `Couldn't delete "${spot.name}": ${err instanceof Error ? err.message : "something went wrong."}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  function ownerControls(spot: Spot, overlay = false) {
    return (
      <SpotOwnerControls
        overlay={overlay}
        deleting={deletingId === spot.id}
        confirming={confirmingId === spot.id}
        onEdit={() => {
          setConfirmingId(null);
          setEditingSpot(spot);
        }}
        onDelete={() => setConfirmingId(spot.id)}
        onConfirm={() => handleDelete(spot)}
        onCancel={() => setConfirmingId(null)}
      />
    );
  }

  // Nearby + search, before the light filter - kept separate so the legend
  // can show how many spots each bucket would add back if toggled on.
  const baseVisible = useMemo(() => {
    let list = nearbyIds ? spots.filter((s) => nearbyIds.includes(s.id)) : spots;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q),
      );
    }

    return list;
  }, [spots, nearbyIds, search]);

  const visible = useMemo(
    () =>
      lightFilter.length === 0
        ? baseVisible
        : baseVisible.filter((s) => {
            const bucket = lightBucket(s.best_time);
            return bucket !== null && lightFilter.includes(bucket);
          }),
    [baseVisible, lightFilter],
  );

  const bucketCounts = useMemo(() => {
    const counts = new Map<LightBucket, number>();
    for (const s of baseVisible) {
      const bucket = lightBucket(s.best_time);
      if (bucket) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return counts;
  }, [baseVisible]);

  const filtering = search.trim() !== "" || lightFilter.length > 0;

  function toggleLight(bucket: LightBucket) {
    setLightFilter((current) =>
      current.includes(bucket) ? current.filter((b) => b !== bucket) : [...current, bucket],
    );
  }

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
      <aside className="flex h-[45vh] w-full shrink-0 flex-col border-b border-line bg-paper lg:h-full lg:w-88 lg:border-b-0 lg:border-r">
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
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search spots..."
              className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-1.5 text-sm text-ink
                         outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {deleteError && !editing && (
            <div
              role="alert"
              className="mx-3 mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <span className="flex-1">{deleteError}</span>
              <button
                type="button"
                onClick={() => setDeleteError(null)}
                aria-label="Dismiss"
                className="shrink-0 font-medium underline"
              >
                Dismiss
              </button>
            </div>
          )}
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
                      setLightFilter([]);
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
                    {mine && ownerControls(spot)}
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
                      <div className="absolute right-1 top-1">{ownerControls(spot, true)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* --------------------------------------------------------------- map */}
      <div className="relative h-[60vh] min-h-0 flex-1 lg:h-full">
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
        {!editing && (
          <LightLegend active={lightFilter} counts={bucketCounts} onToggle={toggleLight} />
        )}
      </div>
    </div>
  );
}

/**
 * Map legend for the pin colours, doubling as the light filter: each row is a
 * toggle. Nothing selected shows every spot; selecting rows narrows to just
 * those buckets. Replaces the old best-time dropdown, whose dozen
 * inconsistent free-text values ("Mid morning", "Late morning"...) made it
 * hard to use.
 */
function LightLegend({
  active,
  counts,
  onToggle,
}: {
  active: LightBucket[];
  counts: Map<LightBucket, number>;
  onToggle: (bucket: LightBucket) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by light"
      // A single wrapping row on small screens, where the map is only ~half
      // the viewport and a full card would cover a third of it; the labelled
      // vertical card from lg up.
      className="absolute bottom-3 left-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-0.5 rounded-xl border border-line bg-paper/90 p-1 shadow-md backdrop-blur lg:flex-col lg:flex-nowrap lg:gap-0 lg:p-1.5"
    >
      <p className="hidden px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted lg:block">
        Best light
      </p>
      {LIGHT_BUCKETS.map((b) => {
        const on = active.includes(b.id);
        const dimmed = active.length > 0 && !on;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onToggle(b.id)}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs transition lg:w-full lg:gap-2 ${
              on ? "bg-accent-soft text-ink" : "text-ink hover:bg-accent-soft/60"
            } ${dimmed ? "opacity-50" : ""}`}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/80"
              style={{ background: b.color }}
            />
            <span className="lg:hidden">{b.short}</span>
            <span className="hidden flex-1 lg:inline">{b.label}</span>
            <span className="tabular-nums text-muted">{counts.get(b.id) ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Small edit/delete icon pair shown only on spots this browser owns. Delete
 * is two-step: the trash icon swaps the pair for an inline "Delete? Cancel /
 * Delete" prompt instead of a native window.confirm.
 */
function SpotOwnerControls({
  deleting,
  confirming,
  onEdit,
  onDelete,
  onConfirm,
  onCancel,
  overlay = false,
}: {
  deleting: boolean;
  confirming: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  overlay?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel (the safe choice) when the prompt opens, so keyboard users
  // land on it and a stray Enter doesn't delete anything.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const btn = overlay
    ? "rounded-md bg-paper/90 p-1 text-muted shadow-sm backdrop-blur transition hover:text-ink disabled:opacity-50"
    : "shrink-0 rounded-md p-1.5 text-muted transition hover:bg-accent-soft hover:text-ink disabled:opacity-50";

  if (confirming || deleting) {
    return (
      <div
        role="group"
        aria-label="Confirm delete"
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className={`flex shrink-0 items-center gap-1 text-xs ${
          overlay ? "rounded-lg bg-paper/95 p-1 shadow-sm backdrop-blur" : "pr-1"
        }`}
      >
        <span className="px-1 font-medium text-ink">{deleting ? "Deleting..." : "Delete?"}</span>
        {!deleting && (
          <>
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="rounded-md px-2 py-1 text-muted transition hover:bg-accent-soft hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md bg-danger px-2 py-1 font-medium text-paper transition hover:opacity-90"
            >
              Delete
            </button>
          </>
        )}
      </div>
    );
  }

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

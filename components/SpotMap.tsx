"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Structural/animation rules only (the spiderfy transition) - deliberately not
// MarkerCluster.Default.css, whose yellow/orange circles don't match the
// palette. clusterIcon() below builds cluster badges the same way pin() and
// locateIcon() already build spot/draft/location markers.
import "leaflet.markercluster/dist/MarkerCluster.css";
import { photoThumbUrl } from "@/lib/supabase/client";
import { DEFAULT_ZOOM, MUMBAI_CENTER, type Spot } from "@/lib/types";
import { LIGHT_BUCKETS, lightBucket, lightColor } from "@/lib/light";
import { useTheme } from "@/lib/useTheme";

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Optional dark-theme variant of TILE_URL (e.g. MapTiler's streets-v4-dark
// style - same URL with the style name swapped, see .env.example). When it's
// unset, dark mode falls back to inverting the light tiles with a CSS filter
// (.map-tiles-filtered in globals.css) rather than leaving a bright map
// under a dark UI.
const TILE_URL_DARK = process.env.NEXT_PUBLIC_TILE_URL_DARK || "";

// Keyless fallback so a broken tile provider (an expired/misconfigured
// MapTiler key, a quota run out) degrades to a working map instead of
// leaving it blank - this happened for real once already (IMPROVEMENTS.md
// #21). Identical to TILE_URL's own default, so when no MapTiler key is
// configured at all this is simply a no-op once triggered.
const FALLBACK_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const FALLBACK_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// A handful of blips (one bad tile at the edge of the viewport, a flaky
// connection) shouldn't flip the whole map over - only a real, sustained
// failure of the configured provider should.
const TILE_ERROR_THRESHOLD = 6;

/**
 * Falls back to keyless OpenStreetMap tiles after the primary provider
 * fails repeatedly, instead of leaving the map blank, and follows the
 * light/dark theme toggle - real dark tiles when TILE_URL_DARK is set,
 * otherwise a CSS-inverted version of whatever light tiles are showing.
 */
function ResilientTileLayer() {
  const theme = useTheme();
  const map = useMap();
  const [useFallback, setUseFallback] = useState(false);
  const errorCount = useRef(0);

  const dark = theme === "dark";
  const primaryUrl = dark && TILE_URL_DARK ? TILE_URL_DARK : TILE_URL;
  // Only filter tiles that aren't already dark, so real dark tiles never get
  // inverted back to light.
  const filtered = dark && (useFallback || !TILE_URL_DARK);

  useEffect(() => {
    map.getContainer().classList.toggle("map-tiles-filtered", filtered);
  }, [map, filtered]);

  const eventHandlers = useMemo(
    () => ({
      tileerror: () => {
        if (useFallback) return; // already degraded; don't keep counting
        errorCount.current += 1;
        if (errorCount.current >= TILE_ERROR_THRESHOLD) {
          console.warn(
            `[SpotMap] tile provider failed ${TILE_ERROR_THRESHOLD}+ times, falling back to OpenStreetMap`,
          );
          setUseFallback(true);
        }
      },
    }),
    [useFallback],
  );

  return (
    <TileLayer
      // Defaults to OpenStreetMap's own tile server, which needs no API key
      // but explicitly disallows heavy/commercial traffic per their usage
      // policy (operations.osmfoundation.org/policies/tiles). This app
      // actually runs on MapTiler's free tier via NEXT_PUBLIC_TILE_URL/
      // _ATTRIBUTION (no code change needed to switch providers - see
      // .env.example for the verified URL format and setup notes).
      attribution={useFallback ? FALLBACK_TILE_ATTRIBUTION : TILE_ATTRIBUTION}
      url={useFallback ? FALLBACK_TILE_URL : primaryUrl}
      maxZoom={19}
      detectRetina={!useFallback} // MapTiler's {r} URL token supports sharper high-DPI tiles; skip it on the OSM fallback to keep request volume down, per their usage policy above
      eventHandlers={eventHandlers}
    />
  );
}

/**
 * Leaflet's default marker icons are resolved by URL and bundlers rewrite those
 * paths, which silently produces invisible markers. Using a divIcon built from
 * inline HTML sidesteps the whole problem and lets the pins be themed.
 */
function pin(color: string, pulse = false) {
  return L.divIcon({
    className: "",
    html: `<span class="spot-pin${pulse ? " spot-pin--pulse" : ""}" style="--pin:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  });
}

/** Centered circular dot + halo - never confusable with the teardrop pins above. */
function locateIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span class="you-are-here" style="--locate:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  });
}

/**
 * A round terracotta badge with the child count, same divIcon approach as
 * pin()/locateIcon() above rather than leaflet.markercluster's default
 * yellow circles (MarkerCluster.Default.css is deliberately not imported).
 * Sized in three tiers so a 40-pin cluster reads as visibly bigger than a
 * 3-pin one, not just a different number in the same-size circle.
 */
function clusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 25 ? 42 : 50;
  return L.divIcon({
    className: "",
    html: `<span class="spot-cluster" style="--size:${size}px">${count}</span>`,
    iconSize: [size, size],
  });
}

// One cached icon per light bucket (plus the unbucketed fallback) rather
// than a new divIcon per marker - 44+ markers share five icon objects.
const spotIcons = new Map(
  [...LIGHT_BUCKETS.map((b) => b.id), null].map((bucket) => [bucket, pin(lightColor(bucket))]),
);
const draftIcon = pin("#2563eb", true);
const userIcon = locateIcon("#1d6f66");

/** Reports map clicks upward so the add-spot form can capture coordinates. */
function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Flies the map when the caller changes the focused coordinate. */
function FlyTo({ target, zoom }: { target: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, zoom, { duration: 0.8 });
  }, [target, zoom, map]);
  return null;
}

export type SpotMapProps = {
  spots: Spot[];
  draftPin: [number, number] | null;
  pickingLocation: boolean;
  onPick: (lat: number, lng: number) => void;
  flyTarget: [number, number] | null;
  userCoords: [number, number] | null;
};

export default function SpotMap({
  spots,
  draftPin,
  pickingLocation,
  onPick,
  flyTarget,
  userCoords,
}: SpotMapProps) {
  const markers = useMemo(
    () =>
      spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.latitude, spot.longitude]}
          icon={spotIcons.get(lightBucket(spot.best_time))}
          alt={spot.name}
          title={spot.name}
        >
          <Popup>
            <div className="w-56">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoThumbUrl(spot.photo_path)}
                alt={spot.name}
                className="h-32 w-full rounded-md object-cover"
                loading="lazy"
              />
              <h3 className="mt-2 font-display text-sm font-semibold leading-tight text-ink">
                {spot.name}
              </h3>
              {spot.best_time && (
                <p className="mt-0.5 text-xs text-muted">Best light: {spot.best_time}</p>
              )}
              <a
                href={`/spots/${spot.id}`}
                className="mt-2 inline-block text-xs font-medium text-accent-text underline"
              >
                View spot
              </a>
            </div>
          </Popup>
        </Marker>
      )),
    [spots],
  );

  return (
    <MapContainer
      center={MUMBAI_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className={`h-full w-full ${pickingLocation ? "cursor-crosshair" : ""}`}
    >
      <ResilientTileLayer />
      <MarkerClusterGroup
        iconCreateFunction={clusterIcon}
        showCoverageOnHover={false}
        maxClusterRadius={50}
      >
        {markers}
      </MarkerClusterGroup>
      {draftPin && <Marker position={draftPin} icon={draftIcon} />}
      {userCoords && (
        <Marker position={userCoords} icon={userIcon} alt="Your location" title="You are here" />
      )}
      {pickingLocation && <ClickCapture onPick={onPick} />}
      <FlyTo target={flyTarget} zoom={15} />
    </MapContainer>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LIGHT_BUCKETS, lightBucket, lightColor, type LightBucket } from "@/lib/light";
import { useTheme } from "@/lib/useTheme";

/*
 * Pieces shared by the main map (SpotMap) and the detail page's mini-map
 * (SpotMiniMapInner), so both get the same tiles, dark-mode handling,
 * provider fallback and pin styling.
 */

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
export function ResilientTileLayer() {
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
export function pin(color: string, pulse = false) {
  return L.divIcon({
    className: "",
    html: `<span class="spot-pin${pulse ? " spot-pin--pulse" : ""}" style="--pin:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  });
}

// One cached icon per light bucket (plus the unbucketed fallback) rather
// than a new divIcon per marker - 44+ markers share five icon objects.
const spotIcons = new Map<LightBucket | null, L.DivIcon>(
  [...LIGHT_BUCKETS.map((b) => b.id), null].map((bucket) => [bucket, pin(lightColor(bucket))]),
);

/** The pin for a spot, coloured by its kind of light (lib/light.ts). */
export function spotIcon(bestTime: string | null) {
  return spotIcons.get(lightBucket(bestTime))!;
}

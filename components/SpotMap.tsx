"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
// Structural/animation rules only (the spiderfy transition) - deliberately not
// MarkerCluster.Default.css, whose yellow/orange circles don't match the
// palette. clusterIcon() below builds cluster badges the same way pin() and
// locateIcon() already build spot/draft/location markers.
import "leaflet.markercluster/dist/MarkerCluster.css";
import { photoThumbUrl } from "@/lib/supabase/client";
import { DEFAULT_ZOOM, MUMBAI_CENTER, type Spot } from "@/lib/types";
import { pin, ResilientTileLayer, spotIcon } from "@/components/mapParts";

/** Centered circular dot + halo - never confusable with the teardrop pin() shape. */
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
          icon={spotIcon(spot.best_time)}
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

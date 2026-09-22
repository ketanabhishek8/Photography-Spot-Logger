"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { photoUrl } from "@/lib/supabase/client";
import { DEFAULT_ZOOM, MUMBAI_CENTER, type Spot } from "@/lib/types";

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

const spotIcon = pin("#e0553b");
const draftIcon = pin("#2563eb", true);

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
};

export default function SpotMap({
  spots,
  draftPin,
  pickingLocation,
  onPick,
  flyTarget,
}: SpotMapProps) {
  const markers = useMemo(
    () =>
      spots.map((spot) => (
        <Marker key={spot.id} position={[spot.latitude, spot.longitude]} icon={spotIcon}>
          <Popup>
            <div className="w-56">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(spot.photo_path)}
                alt={spot.name}
                className="h-32 w-full rounded-md object-cover"
                loading="lazy"
              />
              <h3 className="mt-2 text-sm font-semibold leading-tight">{spot.name}</h3>
              {spot.best_time && (
                <p className="mt-0.5 text-xs text-stone-500">Best light: {spot.best_time}</p>
              )}
              <a
                href={`/spots/${spot.id}`}
                className="mt-2 inline-block text-xs font-medium text-orange-700 underline"
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
      <TileLayer
        // Defaults to OpenStreetMap's own tile server, which needs no API key
        // but explicitly disallows heavy/commercial traffic per their usage
        // policy (operations.osmfoundation.org/policies/tiles). Set
        // NEXT_PUBLIC_TILE_URL/_ATTRIBUTION (e.g. to MapTiler or Carto) to
        // switch providers with no code change once this gets real traffic.
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
        maxZoom={19}
      />
      {markers}
      {draftPin && <Marker position={draftPin} icon={draftIcon} />}
      {pickingLocation && <ClickCapture onPick={onPick} />}
      <FlyTo target={flyTarget} zoom={15} />
    </MapContainer>
  );
}

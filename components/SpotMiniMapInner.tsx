"use client";

import { useEffect } from "react";
import { MapContainer, Marker, useMap } from "react-leaflet";
import { ResilientTileLayer, spotIcon } from "@/components/mapParts";

/**
 * A small, fixed "where is it" map for the spot detail page. Deliberately
 * non-interactive (no drag/zoom) so it can't trap scrolling on a phone -
 * the Directions button and the main map are there for anything more.
 */
export default function SpotMiniMapInner({
  lat,
  lng,
  bestTime,
}: {
  lat: number;
  lng: number;
  bestTime: string | null;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomControl={false}
      className="mini-map h-full w-full"
    >
      <CompactAttribution />
      <ResilientTileLayer />
      <Marker position={[lat, lng]} icon={spotIcon(bestTime)} interactive={false} />
    </MapContainer>
  );
}

/**
 * At h-48 the full attribution wraps to two lines and covers a quarter of
 * the map. Drop Leaflet's own "Leaflet" prefix (not a licence requirement,
 * unlike the MapTiler/OpenStreetMap credits, which stay) and let
 * .mini-map in globals.css shrink the text.
 */
function CompactAttribution() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix(false);
  }, [map]);
  return null;
}

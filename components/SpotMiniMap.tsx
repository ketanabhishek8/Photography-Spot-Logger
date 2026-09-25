"use client";

import dynamic from "next/dynamic";

/**
 * Same reason MapExperience wraps SpotMap: Leaflet touches `window` at
 * import time, and `ssr: false` is only allowed inside a Client Component,
 * so the Server Component spot page renders this instead of the map itself.
 */
const SpotMiniMap = dynamic(() => import("@/components/SpotMiniMapInner"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-line" />,
});

export default SpotMiniMap;

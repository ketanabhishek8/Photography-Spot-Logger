/** A photography spot, mirroring the `spots` table in supabase/schema.sql. */
export type Spot = {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  /** Object path inside the `spot-photos` bucket, e.g. "seed/gateway-of-india.jpg". */
  photo_path: string;
  best_time: string | null;
  attribution: string | null;
  license: string | null;
  source_url: string | null;
  is_seed: boolean;
  created_at: string;
};

/** The bucket every spot photo lives in. Public-read; writes are server-only. */
export const PHOTO_BUCKET = "spot-photos";

/**
 * Columns safe to send to the browser - excludes owner_token. The
 * service-role client used for every write (including the edit/delete
 * ownership check in app/api/spots/[id]/route.ts) can select owner_token
 * freely, so every insert/update response projects through this explicit
 * list rather than `select()`/`select("*")`, matching the column-level
 * grant anon/authenticated get in supabase/schema.sql.
 */
export const PUBLIC_SPOT_COLUMNS =
  "id, name, description, latitude, longitude, photo_path, best_time, attribution, license, source_url, is_seed, created_at";

/** Map defaults: Mumbai, wide enough to take in Colaba through Borivali. */
export const MUMBAI_CENTER: [number, number] = [19.076, 72.8777];
export const DEFAULT_ZOOM = 11;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Matches the form inputs' `maxLength` (AddSpotForm.tsx, EditSpotForm.tsx), but
 * enforced again server-side in app/api/spots/route.ts and
 * app/api/spots/[id]/route.ts - a client-side maxLength is advice, not
 * enforcement, for anyone calling the API directly. Also backed by CHECK
 * constraints in supabase/schema.sql as a last line of defense.
 */
export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 600;
export const MAX_BEST_TIME_LENGTH = 60;

/** Shared between the add-spot form's dropdown and the sidebar's filter. */
export const BEST_TIME_OPTIONS = [
  "Sunrise",
  "Golden hour",
  "Blue hour",
  "Night",
  "Midday",
  "Monsoon mornings",
] as const;

/**
 * User uploads are downscaled to this width server-side before being stored
 * (see app/api/spots/route.ts), matching what scripts/seed.mjs already
 * requests from Wikimedia for the seeded photos.
 */
export const UPLOAD_TARGET_WIDTH = 1600;

/**
 * A second, smaller derivative is stored alongside every full photo (see
 * photoThumbUrl in lib/supabase/client.ts, uploaded by
 * app/api/spots/route.ts and scripts/seed.mjs) - the list, gallery and map
 * popup only ever display a photo in a 56-224px box, so there's no reason
 * for them to pull the full 1600px original just to shrink it in CSS.
 */
export const THUMBNAIL_TARGET_WIDTH = 400;

/**
 * `user/abc123.jpg` -> `user/abc123-thumb.jpg`. One shared implementation
 * so the writer (route.ts/seed.mjs, deciding where to upload the thumbnail)
 * and the reader (photoThumbUrl, deciding where to fetch it from) can never
 * drift apart on the naming convention.
 */
export function thumbPath(photoPath: string): string {
  const dot = photoPath.lastIndexOf(".");
  return dot === -1 ? `${photoPath}-thumb` : `${photoPath.slice(0, dot)}-thumb${photoPath.slice(dot)}`;
}

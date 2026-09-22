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

/** Map defaults: Mumbai, wide enough to take in Colaba through Borivali. */
export const MUMBAI_CENTER: [number, number] = [19.076, 72.8777];
export const DEFAULT_ZOOM = 11;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

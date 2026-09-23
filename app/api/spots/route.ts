import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { OWNER_TOKEN_COOKIE } from "@/proxy";
import {
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
  PHOTO_BUCKET,
  PUBLIC_SPOT_COLUMNS,
  UPLOAD_TARGET_WIDTH,
  type Spot,
} from "@/lib/types";

// The Supabase upload and sharp both need Node APIs, so pin this handler to
// the Node runtime rather than the default Edge-eligible one.
export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Creates a spot: validate -> upload photo to Storage -> insert row.
 *
 * Writes happen here rather than in the browser so the service-role key never
 * leaves the server. The browser only ever holds the anon key.
 */
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientKey(request));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many spots logged from this connection. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Expected multipart form data.");
  }

  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const bestTime = String(form.get("best_time") ?? "").trim();
  const latitude = Number(form.get("latitude"));
  const longitude = Number(form.get("longitude"));
  const photo = form.get("photo");

  if (!name) return bad("A spot name is required.");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    return bad("Latitude must be between -90 and 90.");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    return bad("Longitude must be between -180 and 180.");
  if (!(photo instanceof File) || photo.size === 0) return bad("A photo is required.");
  if (!ALLOWED_MIME.includes(photo.type as (typeof ALLOWED_MIME)[number]))
    return bad("Photo must be a JPEG, PNG or WebP.");
  if (photo.size > MAX_UPLOAD_BYTES)
    return bad(`Photo must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server not configured." },
      { status: 500 },
    );
  }

  const photoPath = `user/${crypto.randomUUID()}.${EXT[photo.type]}`;
  const original = new Uint8Array(await photo.arrayBuffer());

  // Downscale before storing - phone photos routinely run 5-12 MB, and only
  // the on-screen thumbnail/detail view ever needs to show them. .rotate()
  // with no args auto-applies the EXIF orientation tag before the encode
  // strips metadata, so re-encoded photos don't come out sideways.
  let bytes: Uint8Array;
  try {
    const resized = sharp(original)
      .rotate()
      .resize({ width: UPLOAD_TARGET_WIDTH, withoutEnlargement: true });

    bytes =
      photo.type === "image/png"
        ? await resized.png({ compressionLevel: 8 }).toBuffer()
        : photo.type === "image/webp"
          ? await resized.webp({ quality: 82 }).toBuffer()
          : await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    return bad("That file isn't a readable image.");
  }

  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(photoPath, bytes, {
    contentType: photo.type,
    upsert: false,
    // photoPath is a fresh UUID per upload and is never overwritten, so this
    // is safe to cache for as long as browsers will keep it (Supabase's
    // default is only 1hr).
    cacheControl: "31536000",
  });

  if (uploadError) {
    return NextResponse.json(
      { error: `Photo upload failed: ${uploadError.message}` },
      { status: 502 },
    );
  }

  // Every spot needs an owner_token so its creator can edit/delete it later
  // with no account - proxy.ts sets this cookie on first visit, so it's
  // normally already present; generate one here too as a defensive fallback
  // (e.g. a direct POST that somehow skipped the proxy) and hand it back the
  // same way, so this request still ends up "owning" the row.
  let ownerToken = request.cookies.get(OWNER_TOKEN_COOKIE)?.value;
  let setOwnerCookie = false;
  if (!ownerToken) {
    ownerToken = crypto.randomUUID();
    setOwnerCookie = true;
  }

  const { data, error: dbError } = await supabase
    .from("spots")
    .insert({
      name,
      description: description || null,
      latitude,
      longitude,
      photo_path: photoPath,
      best_time: bestTime || null,
      is_seed: false,
      owner_token: ownerToken,
    })
    .select(PUBLIC_SPOT_COLUMNS)
    .single();

  if (dbError) {
    // Don't leave an orphaned object behind if the row never landed.
    await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
    const conflict = dbError.code === "23505";
    return NextResponse.json(
      { error: conflict ? "A spot with that name already exists." : dbError.message },
      { status: conflict ? 409 : 500 },
    );
  }

  const response = NextResponse.json({ spot: data as Spot }, { status: 201 });
  if (setOwnerCookie) {
    response.cookies.set(OWNER_TOKEN_COOKIE, ownerToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

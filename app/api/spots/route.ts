import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, PHOTO_BUCKET, type Spot } from "@/lib/types";

// The Supabase upload uses Node APIs, so pin this handler to the Node runtime.
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
export async function POST(request: Request) {
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
  const bytes = new Uint8Array(await photo.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(photoPath, bytes, { contentType: photo.type, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Photo upload failed: ${uploadError.message}` },
      { status: 502 },
    );
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
    })
    .select()
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

  return NextResponse.json({ spot: data as Spot }, { status: 201 });
}

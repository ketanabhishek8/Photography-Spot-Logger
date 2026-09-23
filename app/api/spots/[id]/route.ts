import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OWNER_TOKEN_COOKIE } from "@/proxy";
import { PHOTO_BUCKET, PUBLIC_SPOT_COLUMNS, type Spot } from "@/lib/types";

export const runtime = "nodejs";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Edit/delete only ever succeeds for the browser that created the spot -
 * there's no login, so "yours" means "the request's pit_owner_token cookie
 * matches the row's owner_token", checked with the service-role client (the
 * only role that can even read that column - see supabase/schema.sql) right
 * inside the WHERE clause of the update/delete itself. No match, whether
 * because the spot belongs to someone else, doesn't exist, or is a seeded
 * spot (is_seed = true, which no owner_token will ever match) all look the
 * same from here: zero rows affected -> 403.
 */
function getOwnerToken(request: NextRequest) {
  return request.cookies.get(OWNER_TOKEN_COOKIE)?.value;
}

const NOT_YOURS = "That spot doesn't exist, or wasn't logged from this browser.";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ownerToken = getOwnerToken(request);
  if (!ownerToken) return bad(NOT_YOURS, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Expected JSON.");
  }
  const { name, description, best_time } = (body ?? {}) as Record<string, unknown>;

  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) return bad("A spot name is required.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("spots")
    .update({
      name: trimmedName,
      description: String(description ?? "").trim() || null,
      best_time: String(best_time ?? "").trim() || null,
    })
    .eq("id", id)
    .eq("owner_token", ownerToken)
    .eq("is_seed", false)
    .select(PUBLIC_SPOT_COLUMNS)
    .maybeSingle();

  if (error) {
    const conflict = error.code === "23505";
    return NextResponse.json(
      { error: conflict ? "A spot with that name already exists." : error.message },
      { status: conflict ? 409 : 500 },
    );
  }
  if (!data) return bad(NOT_YOURS, 403);

  return NextResponse.json({ spot: data as Spot });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ownerToken = getOwnerToken(request);
  if (!ownerToken) return bad(NOT_YOURS, 403);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("spots")
    .delete()
    .eq("id", id)
    .eq("owner_token", ownerToken)
    .eq("is_seed", false)
    .select("photo_path")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return bad(NOT_YOURS, 403);

  // Best-effort: the row is already gone either way, and a leftover Storage
  // object with nothing pointing at it is harmless (just a few hundred KB),
  // unlike leaving an orphaned reference the other way round.
  const { error: storageError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([data.photo_path as string]);
  if (storageError) console.error("[DELETE /api/spots/:id] storage cleanup", storageError.message);

  return NextResponse.json({ ok: true });
}

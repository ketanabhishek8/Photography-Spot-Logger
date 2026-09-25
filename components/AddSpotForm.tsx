"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import TagPicker from "@/components/TagPicker";
import { ALLOWED_MIME, BEST_TIME_OPTIONS, MAX_UPLOAD_BYTES } from "@/lib/types";

type Props = {
  draftPin: [number, number] | null;
  onRequestPick: () => void;
  onCancel: () => void;
  onCreated: () => void;
  /** Called when a selected photo has GPS EXIF data, so the pin can be set automatically. */
  onExifLocation: (lat: number, lng: number) => void;
};

type ExifStatus = "idle" | "checking" | "found" | "none";

export default function AddSpotForm({
  draftPin,
  onRequestPick,
  onCancel,
  onCreated,
  onExifLocation,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [exifStatus, setExifStatus] = useState<ExifStatus>("idle");

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileName(file?.name ?? null);
    setExifStatus("idle");
    if (!file) return;

    // Only auto-fill when nothing has been picked yet - a photo chosen after
    // the user has already placed a pin shouldn't silently override it.
    if (draftPin) return;

    setExifStatus("checking");
    try {
      const exifr = (await import("exifr")).default;
      const gps = await exifr.gps(file);
      if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
        onExifLocation(gps.latitude, gps.longitude);
        setExifStatus("found");
      } else {
        setExifStatus("none");
      }
    } catch {
      // Corrupt/unreadable EXIF block - not fatal, just means no auto-fill.
      setExifStatus("none");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    if (!draftPin) {
      setError("Pick the location on the map first.");
      return;
    }

    const file = data.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a photo of the spot.");
      return;
    }
    // Check client-side for a fast message; the API re-validates regardless.
    if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
      setError("Photo must be a JPEG, PNG or WebP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Photo must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }

    data.set("latitude", String(draftPin[0]));
    data.set("longitude", String(draftPin[1]));

    setSubmitting(true);
    try {
      const res = await fetch("/api/spots", { method: "POST", body: data });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not save the spot.");
      form.reset();
      setFileName(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink " +
    "outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Spot name</label>
        <input name="name" required maxLength={120} className={field} placeholder="Carter Road jetty" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          What makes it good?
        </label>
        <textarea
          name="description"
          rows={3}
          maxLength={600}
          className={`${field} resize-none`}
          placeholder="Concrete jetty with the skyline behind it. Quiet on weekday mornings."
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Best light</label>
        <select name="best_time" className={field} defaultValue="Golden hour">
          {BEST_TIME_OPTIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <TagPicker />

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Photo</label>
        <label
          className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed
                     border-line bg-accent-soft/40 px-3 py-4 text-xs text-muted
                     transition hover:border-accent hover:text-accent-text"
        >
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            required
            className="hidden"
            onChange={handlePhotoChange}
          />
          {fileName ?? "Choose a JPEG, PNG or WebP (max 8 MB)"}
        </label>
        {exifStatus === "checking" && (
          <p className="mt-1 text-xs text-muted">Checking photo for location data...</p>
        )}
      </div>

      <div className="rounded-xl bg-accent-soft/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Location</span>
          <button
            type="button"
            onClick={onRequestPick}
            className="text-xs font-medium text-accent-text underline"
          >
            {draftPin ? "Pick again" : "Pick on map"}
          </button>
        </div>
        <p className="mt-1 font-mono text-xs text-muted">
          {draftPin
            ? `${draftPin[0].toFixed(5)}, ${draftPin[1].toFixed(5)}`
            : "Click the map to drop a pin"}
        </p>
        {exifStatus === "found" && (
          <p className="mt-1 text-xs text-tide-text">📍 Filled in from the photo&apos;s location data</p>
        )}
        {exifStatus === "none" && !draftPin && (
          <p className="mt-1 text-xs text-muted">No location data in that photo - pick it on the map.</p>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white
                     transition hover:bg-accent-hover disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Save spot"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-line px-3 py-2 text-sm text-ink
                     transition hover:bg-accent-soft"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

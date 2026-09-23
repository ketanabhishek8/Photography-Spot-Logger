"use client";

import { useState, type FormEvent } from "react";
import { BEST_TIME_OPTIONS, type Spot } from "@/lib/types";

type Props = {
  spot: Spot;
  onSaved: (updated: Spot) => void;
  onCancel: () => void;
};

/**
 * Editing is deliberately narrower than creation: name, description and
 * best time only. The photo and pin location aren't editable here - both
 * involve re-running the upload/sharp/orphan-cleanup path AddSpotForm
 * already does, and "delete, then re-log with the right photo/pin" covers
 * that without duplicating it.
 */
export default function EditSpotForm({ spot, onSaved, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/spots/${spot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          description: data.get("description"),
          best_time: data.get("best_time"),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not save the changes.");
      onSaved(payload.spot as Spot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm " +
    "outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">Spot name</label>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={spot.name}
          className={field}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">
          What makes it good?
        </label>
        <textarea
          name="description"
          rows={3}
          maxLength={600}
          defaultValue={spot.description ?? ""}
          className={`${field} resize-none`}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">Best light</label>
        <select name="best_time" className={field} defaultValue={spot.best_time ?? "Golden hour"}>
          {BEST_TIME_OPTIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white
                     transition hover:bg-orange-700 disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-600
                     transition hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

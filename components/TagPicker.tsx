"use client";

import type { ChangeEvent } from "react";
import { MAX_TAGS, SPOT_TAGS } from "@/lib/types";

/**
 * Toggle chips for SPOT_TAGS, shared by AddSpotForm and EditSpotForm. Plain
 * uncontrolled checkboxes named "tags", so the forms' existing
 * `new FormData(form)` picks them up with no extra wiring and
 * `form.reset()` clears them. The API enforces MAX_TAGS too; this just stops
 * a fifth box from being ticked in the first place.
 */
export default function TagPicker({ defaultValue = [] }: { defaultValue?: string[] }) {
  function enforceMax(e: ChangeEvent<HTMLInputElement>) {
    const box = e.currentTarget;
    const checked = box.form?.querySelectorAll('input[name="tags"]:checked').length ?? 0;
    if (box.checked && checked > MAX_TAGS) box.checked = false;
  }

  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-medium text-muted">
        Tags <span className="font-normal">(up to {MAX_TAGS})</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {SPOT_TAGS.map((tag) => (
          <label
            key={tag}
            className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-xs capitalize text-ink
                       transition hover:bg-accent-soft has-checked:border-tide has-checked:bg-tide
                       has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-tide/40"
          >
            <input
              type="checkbox"
              name="tags"
              value={tag}
              defaultChecked={defaultValue.includes(tag)}
              onChange={enforceMax}
              className="sr-only"
            />
            {tag}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

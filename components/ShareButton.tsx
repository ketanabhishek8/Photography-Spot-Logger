"use client";

import { useState } from "react";

/**
 * Opens the native share sheet where there is one (phones, Safari), and
 * copies the link everywhere else.
 */
export default function ShareButton({ title, className }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Dismissing the share sheet rejects too - nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, denied permission): fall back
      // to letting the user copy it themselves.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button type="button" onClick={share} className={className} aria-live="polite">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 10V2M8 2 5 5M8 2l3 3M3 9v4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

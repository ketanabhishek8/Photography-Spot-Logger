"use client";

import { useEffect } from "react";

/**
 * Next.js App Router error boundary: catches anything thrown while rendering
 * app/page.tsx or its children (e.g. a Supabase call failing outside the
 * places that already handle it explicitly) and shows this instead of the
 * framework's default error screen. Does not catch errors in app/layout.tsx
 * itself - that needs app/global-error.tsx, added alongside this.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <main className="flex h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The map couldn&apos;t load. This is usually temporary - try again in a moment.
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
      >
        Try again
      </button>
    </main>
  );
}

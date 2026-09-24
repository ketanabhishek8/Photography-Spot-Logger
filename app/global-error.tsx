"use client";

/**
 * Catches errors thrown in app/layout.tsx itself, which app/error.tsx cannot
 * (a route error boundary is rendered inside the layout, so it can't recover
 * from the layout failing). Replaces the entire document when triggered, so
 * it has to supply its own <html>/<body> - it can't rely on layout.tsx's.
 * No Tailwind classes here on purpose: if globals.css itself failed to load,
 * this still needs to render something legible.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#1c1b19" }}>Something went wrong</h1>
        <p style={{ marginTop: 8, color: "#8a8171", maxWidth: 360 }}>
          The app failed to load. Try again in a moment.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 20,
            borderRadius: 12,
            background: "#c1502e",
            color: "#fff",
            padding: "8px 16px",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

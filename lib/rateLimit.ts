/**
 * Best-effort in-memory rate limiter, keyed by caller (typically IP).
 *
 * Caveat that matters on Vercel: serverless functions are ephemeral, and this
 * Map lives in one instance's memory. A client whose requests land on
 * different warm instances - or any instance after a cold start - gets a
 * fresh counter. This still meaningfully slows down a single script hammering
 * the endpoint from one connection (very likely to hit the same warm
 * instance), but it is not a real distributed guarantee. A production
 * deployment that actually needs one should put this behind Upstash Redis
 * (@upstash/ratelimit) or Vercel's own Firewall rate limiting instead -
 * noted in ROADMAP.md rather than added here, since both need a new account.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 10; // per key, per window

const hits = new Map<string, number[]>();

// Cheap unbounded-growth guard: an attacker spraying random keys could grow
// this map forever between cold starts. Sweep it if it gets large rather than
// adding a timer (serverless functions don't reliably keep timers alive).
const MAX_TRACKED_KEYS = 5000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();

  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, timestamps] of hits) {
      if (timestamps.every((t) => now - t > WINDOW_MS)) hits.delete(k);
    }
  }

  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

/** Best-effort caller identifier from standard proxy headers. */
export function clientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

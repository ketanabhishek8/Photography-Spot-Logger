// server-only's real implementation throws unconditionally outside of
// Next.js's own webpack build (it has no way to know a plain Node test
// runner is, definitionally, never a browser bundle). vitest.config.ts
// aliases "server-only" to this no-op so lib/supabase/admin.ts - which
// needs that import to stay a real safeguard in the actual app build - can
// still be imported directly in tests.
export {};

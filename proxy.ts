import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const OWNER_TOKEN_COOKIE = "pit_owner_token";

/**
 * This cookie is the only proof of ownership a spot has (see
 * app/api/spots/[id]/route.ts), so it's set with the same care as a session
 * token: httpOnly (client JS never touches it, immune to a stray XSS reading
 * it off document.cookie), secure in production (never sent over plain
 * HTTP), sameSite: "lax" (still attached on a normal top-level navigation,
 * blocked on a cross-site POST). `secure` is off in dev because localhost
 * normally runs over plain HTTP.
 *
 * Shared here rather than duplicated at each `cookies.set` call site
 * (proxy.ts itself, and the fallback in app/api/spots/route.ts) so the two
 * can't silently drift apart.
 */
export const OWNER_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year - "session owned" means this browser, not this tab
};

/**
 * Assigns every browser an anonymous "who made this" token on its first
 * request - the only mechanism behind "log a spot, then edit/delete that
 * same spot later" with no accounts. The browser attaches it automatically
 * to every same-origin request, including fetch() calls from the app and
 * the page's own SSR request, which is what lets app/page.tsx compute "is
 * this spot mine" server-side and lets app/api/spots/[id]/route.ts
 * authorize edit/delete.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(OWNER_TOKEN_COOKIE)) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(OWNER_TOKEN_COOKIE, crypto.randomUUID(), OWNER_TOKEN_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};

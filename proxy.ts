import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const OWNER_TOKEN_COOKIE = "pit_owner_token";

/**
 * Assigns every browser an anonymous, httpOnly "who made this" token on its
 * first request - the only mechanism behind "log a spot, then edit/delete
 * that same spot later" with no accounts. httpOnly means client JS never
 * touches it (immune to a stray XSS reading it off document.cookie); the
 * browser still attaches it automatically to every same-origin request,
 * including fetch() calls from the app and the page's own SSR request, which
 * is what lets app/page.tsx compute "is this spot mine" server-side and lets
 * app/api/spots/[id]/route.ts authorize edit/delete.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(OWNER_TOKEN_COOKIE)) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(OWNER_TOKEN_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year - "session owned" means this browser, not this tab
  });
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};

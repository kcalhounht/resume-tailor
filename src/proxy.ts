import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "rt_session";
const PUBLIC_PATHS = ["/signin", "/signup", "/api/auth/clear"];

function hasSessionCookie(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return true;
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").some((part) => {
    const [name, ...rest] = part.trim().split("=");
    return name === SESSION_COOKIE && rest.join("=").length > 0;
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!hasSessionCookie(request) && !isPublic) {
    const signin = new URL("/signin", request.url);
    if (!pathname.startsWith("/api/auth/clear")) {
      signin.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(signin);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

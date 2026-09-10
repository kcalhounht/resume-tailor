import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/signin", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!session && !isPublic) {
    const signin = new URL("/signin", request.url);
    signin.searchParams.set("next", pathname);
    return NextResponse.redirect(signin);
  }

  if (
    session &&
    (pathname === "/signin" || pathname.startsWith("/signin/"))
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

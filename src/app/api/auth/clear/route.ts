import { NextResponse } from "next/server";
import {
  PAGE_STYLE_COOKIE,
  pageStyleCookieOptions,
} from "@/lib/appearance";
import {
  RESUME_FORMAT_COOKIE,
  resumeFormatCookieOptions,
} from "@/lib/resume-format";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

function expire(
  response: NextResponse,
  name: string,
  options: {
    httpOnly?: boolean;
    sameSite: "lax" | "strict" | "none";
    secure: boolean;
    path: string;
  },
) {
  response.cookies.set(name, "", {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function GET(request: Request) {
  const url = new URL("/signin", request.url);
  url.searchParams.set("cleared", "1");
  const response = NextResponse.redirect(url);
  expire(response, SESSION_COOKIE, sessionCookieOptions());
  expire(response, PAGE_STYLE_COOKIE, pageStyleCookieOptions());
  expire(response, RESUME_FORMAT_COOKIE, resumeFormatCookieOptions());
  return response;
}

import { NextResponse } from "next/server";
import { chromeWebStoreUrl } from "@/lib/chrome-webstore";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const store = chromeWebStoreUrl();
  const destination = store
    ? store
    : new URL("/api/extension/zip", request.url).toString();
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

import { NextResponse } from "next/server";
import { chromeWebStoreUrl } from "@/lib/chrome-webstore";

export const dynamic = "force-dynamic";

/** Users go to the Chrome Web Store. Developers Load unpacked from /extension. */
export function GET(request: Request) {
  const store = chromeWebStoreUrl();
  const destination = store || new URL("/extension", request.url).toString();
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

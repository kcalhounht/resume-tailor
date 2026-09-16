import { NextResponse } from "next/server";
import { chromeWebStoreUrl } from "@/lib/chrome-webstore";
import { loadCurrentUser } from "@/lib/dal";
import { isAdminUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = chromeWebStoreUrl();
  if (store) {
    const response = NextResponse.redirect(store, 302);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }

  const current = await loadCurrentUser();
  const destination = isAdminUser(current?.user)
    ? new URL("/admin/settings#developer-chrome", request.url)
    : new URL("/extension", request.url);
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

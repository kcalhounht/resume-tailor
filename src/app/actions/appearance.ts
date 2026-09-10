"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/app/actions/auth";
import {
  PAGE_STYLE_COOKIE,
  parsePageStyle,
  pageStyleCookieOptions,
  type PageStyle,
} from "@/lib/appearance";
import { updateUserPageStyle } from "@/lib/users";

export async function saveOwnPageStyle(style: string): Promise<{
  pageStyle: PageStyle;
}> {
  const session = await requireSession();
  const pageStyle = parsePageStyle(style);
  await updateUserPageStyle(session.userId, pageStyle);
  (await cookies()).set(
    PAGE_STYLE_COOKIE,
    pageStyle,
    pageStyleCookieOptions(),
  );
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { pageStyle };
}

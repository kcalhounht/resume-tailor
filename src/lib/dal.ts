import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SESSION_COOKIE, readSessionToken, type SessionPayload } from "@/lib/session";
import {
  findUserByEmail,
  findUserById,
  isAdminUser,
  isUserAble,
  promoteAdminIdentity,
  PRIORITY_DISABLED_MESSAGE,
  type StoredUser,
} from "@/lib/users";

export type CurrentUser = {
  session: SessionPayload;
  user: StoredUser;
};

function tokenFromCookieHeader(header: string) {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${SESSION_COOKIE}=`)) continue;
    try {
      return decodeURIComponent(trimmed.slice(SESSION_COOKIE.length + 1));
    } catch {
      return trimmed.slice(SESSION_COOKIE.length + 1);
    }
  }
  return undefined;
}

export async function getSession(): Promise<SessionPayload | null> {
  await connection();
  const jar = await cookies();
  const fromJar = jar.get(SESSION_COOKIE)?.value;
  const token =
    fromJar || tokenFromCookieHeader((await headers()).get("cookie") ?? "");
  return readSessionToken(token);
}

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;

  let found: StoredUser | null;
  try {
    found = await findUserById(session.userId);
    if (!found && session.email) {
      found = await findUserByEmail(session.email);
    }
  } catch (error) {
    console.error("loadCurrentUser: failed to load user", error);
    throw error;
  }

  if (!found) return null;
  const user = await promoteAdminIdentity(found).catch(() => found);
  return { session, user };
}

export const requireCurrentUser = cache(async (): Promise<CurrentUser> => {
  const current = await loadCurrentUser();
  if (!current) redirect("/signin");
  return current;
});

export async function requireSession(): Promise<SessionPayload> {
  const { session } = await requireCurrentUser();
  return session;
}

export async function requireAbleUser(): Promise<StoredUser> {
  const { user } = await requireCurrentUser();
  if (!isUserAble(user)) {
    throw new Error(PRIORITY_DISABLED_MESSAGE);
  }
  return user;
}

export const requireAdmin = cache(async (): Promise<CurrentUser> => {
  const { session, user } = await requireCurrentUser();
  if (!isAdminUser(user)) redirect("/");
  return { session, user };
});

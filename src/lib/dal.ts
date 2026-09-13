import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
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
  const jar = await cookies();
  const fromJar = jar.get(SESSION_COOKIE)?.value;
  const token =
    fromJar || tokenFromCookieHeader((await headers()).get("cookie") ?? "");
  return readSessionToken(token);
}

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;

  let found: StoredUser | null = null;
  try {
    found = await findUserById(session.userId);
    if (!found && session.email) {
      found = await findUserByEmail(session.email);
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("loadCurrentUser: failed to load user", error);
    return null;
  }

  if (!found) return null;
  const user = await promoteAdminIdentity(found).catch(() => found);
  return { session, user };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const current = await loadCurrentUser();
  if (!current) redirect("/signin");
  return current;
}

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

export async function requireAdmin(): Promise<CurrentUser> {
  const { session, user } = await requireCurrentUser();
  if (!isAdminUser(user)) redirect("/");
  return { session, user };
}

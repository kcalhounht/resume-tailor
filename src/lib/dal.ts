import { cache } from "react";
import { cookies } from "next/headers";
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

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
});

export const requireCurrentUser = cache(async (): Promise<CurrentUser> => {
  await connection();
  const session = await getSession();
  if (!session) redirect("/signin");

  let found: StoredUser | null;
  try {
    found = await findUserById(session.userId);
    if (!found && session.email) {
      found = await findUserByEmail(session.email);
    }
  } catch (error) {
    console.error("requireCurrentUser: failed to load user", error);
    throw error;
  }

  if (!found) redirect("/signin");
  const user = await promoteAdminIdentity(found).catch(() => found);
  return { session, user };
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

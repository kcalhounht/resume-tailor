import { mkdirSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import type { CandidateProfile } from "./types";
import { EMPTY_PROFILE } from "./profile";
import { hashPassword } from "./password";
import { Pool } from "pg";

export type DbUser = {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
};

export type DbUserPublic = {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  profileUpdatedAt: string | null;
  displayName: string | null;
  email: string | null;
};

export type DbProfile = {
  user_id: number;
  personal_json: string;
  experiences_json: string;
  education_json: string;
  updated_at: string;
};

let dbInstance: DatabaseSync | null = null;

function dbPath() {
  return path.join(process.cwd(), "data", "resume-tailor.db");
}

function ensureSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      personal_json TEXT NOT NULL,
      experiences_json TEXT NOT NULL,
      education_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const columns = db
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "is_admin")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    );
  }

  // First existing user becomes admin if none are marked yet
  const adminCount = (
    db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1").get() as {
      c: number;
    }
  ).c;
  if (adminCount === 0) {
    const first = db
      .prepare("SELECT id FROM users ORDER BY id ASC LIMIT 1")
      .get() as { id: number } | undefined;
    if (first) {
      db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(first.id);
    }
  }

  // Promote usernames listed in ADMIN_USERNAMES (and the literal username "admin")
  const fromEnv = (process.env.ADMIN_USERNAMES || "admin")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of fromEnv) {
    db.prepare(
      "UPDATE users SET is_admin = 1 WHERE username = ? COLLATE NOCASE",
    ).run(name);
  }
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  mkdirSync(path.dirname(dbPath()), { recursive: true });
  const db = new DatabaseSync(dbPath());
  ensureSchema(db);
  dbInstance = db;
  return db;
}

function toPublicUser(row: {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
  profile_updated_at?: string | null;
  personal_json?: string | null;
}): DbUserPublic {
  let displayName: string | null = null;
  let email: string | null = null;
  if (row.personal_json) {
    try {
      const personal = JSON.parse(row.personal_json) as {
        name?: string;
        email?: string;
      };
      displayName = personal.name?.trim() || null;
      email = personal.email?.trim() || null;
    } catch {
      // ignore bad JSON
    }
  }
  return {
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
    profileUpdatedAt: row.profile_updated_at ?? null,
    displayName,
    email,
  };
}

export function createUser(
  username: string,
  password: string,
  options?: { isAdmin?: boolean },
): DbUser {
  const db = getDb();
  const passwordHash = hashPassword(password);
  const userCount = (
    db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }
  ).c;
  const makeAdmin = options?.isAdmin ?? userCount === 0;
  const isAdmin = makeAdmin ? 1 : 0;

  const insert = db
    .prepare(
      "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
    )
    .run(username.trim(), passwordHash, isAdmin);

  const id = Number(insert.lastInsertRowid);
  const result = findUserById(id);
  if (!result) {
    throw new Error("Failed to create user");
  }

  saveProfileForUser(result.id, EMPTY_PROFILE);
  return result;
}

export function findUserByUsername(username: string): DbUser | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ? COLLATE NOCASE",
    )
    .get(username.trim()) as DbUser | undefined;
  return row || null;
}

export function findUserById(id: number): DbUser | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?",
    )
    .get(id) as DbUser | undefined;
  return row || null;
}

export function isUserAdmin(userId: number): boolean {
  const user = findUserById(userId);
  if (!user) return false;
  if (user.is_admin) return true;
  const fromEnv = (process.env.ADMIN_USERNAMES || "admin")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.includes(user.username.toLowerCase());
}

export function listUsers(): DbUserPublic[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.is_admin, u.created_at,
              p.updated_at AS profile_updated_at, p.personal_json
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       ORDER BY u.id ASC`,
    )
    .all() as Array<{
    id: number;
    username: string;
    is_admin: number;
    created_at: string;
    profile_updated_at: string | null;
    personal_json: string | null;
  }>;
  return rows.map(toPublicUser);
}

export function getUserDetail(userId: number): {
  user: DbUserPublic;
  profile: CandidateProfile;
} | null {
  const user = findUserById(userId);
  if (!user) return null;
  const db = getDb();
  const profileRow = db
    .prepare("SELECT updated_at, personal_json FROM profiles WHERE user_id = ?")
    .get(userId) as
    | { updated_at: string; personal_json: string }
    | undefined;
  return {
    user: toPublicUser({
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      created_at: user.created_at,
      profile_updated_at: profileRow?.updated_at ?? null,
      personal_json: profileRow?.personal_json ?? null,
    }),
    profile: getProfileForUser(userId),
  };
}

export function updateUser(
  userId: number,
  updates: {
    username?: string;
    password?: string;
    isAdmin?: boolean;
  },
): DbUser {
  const db = getDb();
  const existing = findUserById(userId);
  if (!existing) throw new Error("User not found");

  if (updates.username != null) {
    const next = updates.username.trim();
    if (next.toLowerCase() !== existing.username.toLowerCase()) {
      const clash = findUserByUsername(next);
      if (clash && clash.id !== userId) {
        throw new Error("Username is already taken");
      }
    }
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run(next, userId);
  }

  if (updates.password != null && updates.password.length > 0) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(updates.password),
      userId,
    );
  }

  if (updates.isAdmin != null) {
    if (!updates.isAdmin) {
      const otherAdmins = (
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND id != ?",
          )
          .get(userId) as { c: number }
      ).c;
      if (otherAdmins === 0) {
        throw new Error("Cannot remove the last admin");
      }
    }
    db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(
      updates.isAdmin ? 1 : 0,
      userId,
    );
  }

  const updated = findUserById(userId);
  if (!updated) throw new Error("User not found");
  return updated;
}

export function deleteUser(userId: number): void {
  const db = getDb();
  const existing = findUserById(userId);
  if (!existing) throw new Error("User not found");

  if (existing.is_admin) {
    const otherAdmins = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND id != ?",
        )
        .get(userId) as { c: number }
    ).c;
    if (otherAdmins === 0) {
      throw new Error("Cannot delete the last admin");
    }
  }

  db.prepare("DELETE FROM profiles WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function getProfileForUser(userId: number): CandidateProfile {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT personal_json, experiences_json, education_json FROM profiles WHERE user_id = ?",
    )
    .get(userId) as
    | Pick<DbProfile, "personal_json" | "experiences_json" | "education_json">
    | undefined;

  if (!row) {
    saveProfileForUser(userId, EMPTY_PROFILE);
    return structuredClone(EMPTY_PROFILE);
  }

  try {
    const personal = JSON.parse(row.personal_json);
    const experiences = JSON.parse(row.experiences_json);
    const education = (
      JSON.parse(row.education_json) as Array<Record<string, string>>
    ).map((edu) => ({
      school: edu.school || "",
      degree: edu.degree || "",
      discipline: edu.discipline || "",
      period: edu.period || "",
      location: edu.location || "",
    }));
    return {
      personal,
      experiences,
      education,
    } as CandidateProfile;
  } catch {
    return structuredClone(EMPTY_PROFILE);
  }
}

export function saveProfileForUser(
  userId: number,
  profile: CandidateProfile,
): CandidateProfile {
  const db = getDb();
  db.prepare(
    `INSERT INTO profiles (user_id, personal_json, experiences_json, education_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       personal_json = excluded.personal_json,
       experiences_json = excluded.experiences_json,
       education_json = excluded.education_json,
       updated_at = datetime('now')`,
  ).run(
    userId,
    JSON.stringify(profile.personal),
    JSON.stringify(profile.experiences),
    JSON.stringify(profile.education),
  );
  return profile;
}

const globalForDb = globalThis as unknown as {
  postgresPool?: Pool;
};

export const db =
  globalForDb.postgresPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresPool = db;
}

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  // Prefer bcrypt so admin create/reset and login stay consistent.
  return bcrypt.hashSync(password, 12);
}

export function hashPasswordScrypt(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyScrypt(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || salt.length < 8 || hash.length < 16) return false;
  // bcrypt hashes start with $2 — never treat those as scrypt
  if (stored.startsWith("$2")) return false;
  try {
    const hashed = scryptSync(password, salt, KEYLEN);
    const expected = Buffer.from(hash, "hex");
    if (hashed.length !== expected.length) return false;
    return timingSafeEqual(hashed, expected);
  } catch {
    return false;
  }
}

/**
 * Verify against bcrypt (current) or legacy scrypt `salt:hash` rows.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const hash = String(stored || "").trim();
  if (!password || !hash) return false;

  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }

  // Legacy local/sqlite scrypt format
  if (hash.includes(":") && !hash.startsWith("$")) {
    return verifyScrypt(password, hash);
  }

  // Last resort: try bcrypt anyway (won't throw into login 500)
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

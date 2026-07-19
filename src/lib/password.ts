import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashed = scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (hashed.length !== expected.length) return false;
  return timingSafeEqual(hashed, expected);
}

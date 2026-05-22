import type { SessionOptions } from "iron-session";

export interface AdminSession {
  userId?: string;
  email?: string;
  isAdmin?: boolean;
}

const sessionSecret =
  process.env.SESSION_SECRET ??
  "dev-only-secret-change-me-at-least-32-characters-long-aaaaaaaaaaaaaaaa";

export const sessionOptions: SessionOptions = {
  password: sessionSecret,
  cookieName: "pb_admin_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

/**
 * Auth swap-point. Phase 2 (users slice) replaces the body with a
 * KV-backed user lookup + PBKDF2 password verification. Signature and
 * return shape stay identical so callers don't change.
 *
 * Today: single env-var pair.
 */
export async function validateCredentials(
  email: string,
  password: string
): Promise<{ userId: string; email: string; isAdmin: boolean } | null> {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@projectblue.cc";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme";

  if (
    email.trim().toLowerCase() === adminEmail.toLowerCase() &&
    password === adminPassword
  ) {
    return { userId: "admin-1", email: adminEmail, isAdmin: true };
  }
  return null;
}

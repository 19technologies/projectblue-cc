import type { SessionOptions } from "iron-session";
import { ensureSeedAdmin, getUserByEmail, verifyPassword } from "./users";

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
 * KV-backed user lookup with PBKDF2 password verification. On the first
 * sign-in attempt to a fresh deployment, the seed admin is created from
 * ADMIN_EMAIL/ADMIN_PASSWORD env vars (or documented dev defaults).
 */
export async function validateCredentials(
  email: string,
  password: string
): Promise<{ userId: string; email: string; isAdmin: boolean } | null> {
  await ensureSeedAdmin();
  const user = await getUserByEmail(email);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { userId: user.id, email: user.email, isAdmin: user.isAdmin };
}

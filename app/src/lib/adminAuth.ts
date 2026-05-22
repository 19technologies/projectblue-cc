import { ensureSeedAdmin, getUserByEmail, verifyPassword } from "./users";

// Re-export so existing imports `from "@/lib/adminAuth"` keep working.
export { sessionOptions, type AdminSession } from "./sessions";

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

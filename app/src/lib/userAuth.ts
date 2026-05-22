import { getUserByEmail, verifyPassword } from "./users";

/**
 * Validate a public user's credentials. Same KV user store as the admin —
 * the isAdmin flag distinguishes the two. Anonymous-first: an account is
 * only ever an upgrade, never required to use a room.
 */
export async function validateUserCredentials(
  email: string,
  password: string
): Promise<{ userId: string; email: string } | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { userId: user.id, email: user.email };
}

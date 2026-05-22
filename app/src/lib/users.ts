/**
 * User model + password hashing.
 *
 * Hashing uses Web Crypto PBKDF2-HMAC-SHA-256 (200k iterations, 16-byte salt,
 * 32-byte key). Portable across Node, the Next.js edge runtime, and
 * Cloudflare Workers — no native bindings.
 *
 * Hash format: `pbkdf2$<iterations>$<saltB64>$<keyB64>`
 */

import { getKV } from "./kv";

const USER_KEY = (id: string) => `user:${id}`;
const USER_INDEX = "user:_index";
const PBKDF2_ITERATIONS = 200_000;

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

const toPublic = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  isAdmin: u.isAdmin,
  createdAt: u.createdAt,
});

const toB64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt.buffer as ArrayBuffer)}$${toB64(key)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [scheme, itersStr, saltB64, keyB64] = hash.split("$");
  if (scheme !== "pbkdf2") return false;
  const iters = parseInt(itersStr, 10);
  const salt = fromB64(saltB64);
  const expected = fromB64(keyB64);
  const actual = new Uint8Array(await pbkdf2(password, salt, iters));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<ArrayBuffer> {
  const pwBytes = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    pwBytes.buffer.slice(0) as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt.buffer.slice(0) as ArrayBuffer,
      iterations,
    },
    baseKey,
    256
  );
}

async function readIndex(): Promise<string[]> {
  return (await getKV().get<string[]>(USER_INDEX)) ?? [];
}
async function writeIndex(ids: string[]): Promise<void> {
  await getKV().put<string[]>(USER_INDEX, ids);
}

export async function getUserById(id: string): Promise<User | null> {
  return getKV().get<User>(USER_KEY(id));
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  const ids = await readIndex();
  for (const id of ids) {
    const u = await getUserById(id);
    if (u && u.email.toLowerCase() === target) return u;
  }
  return null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const ids = await readIndex();
  const users: PublicUser[] = [];
  for (const id of ids) {
    const u = await getUserById(id);
    if (u) users.push(toPublic(u));
  }
  return users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createUser(input: {
  email: string;
  password: string;
  isAdmin?: boolean;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Invalid email");
  if (input.password.length < 8) throw new Error("Password must be 8+ characters");

  const existing = await getUserByEmail(email);
  if (existing) throw new Error("A user with that email already exists");

  const id = crypto.randomUUID();
  const user: User = {
    id,
    email,
    passwordHash: await hashPassword(input.password),
    isAdmin: input.isAdmin ?? true,
    createdAt: new Date().toISOString(),
  };
  await getKV().put<User>(USER_KEY(id), user);
  await writeIndex([...(await readIndex()), id]);
  return toPublic(user);
}

export async function deleteUser(id: string): Promise<void> {
  await getKV().delete(USER_KEY(id));
  await writeIndex((await readIndex()).filter((existing) => existing !== id));
}

/**
 * First-run bootstrap. Seeds the admin from ADMIN_EMAIL/ADMIN_PASSWORD when
 * the user store is empty. If those env vars aren't set, falls back to a
 * documented dev default (admin@projectblue.cc / changeme) and warns once.
 */
export async function ensureSeedAdmin(): Promise<void> {
  const ids = await readIndex();
  if (ids.length > 0) return;
  const email = process.env.ADMIN_EMAIL ?? "admin@projectblue.cc";
  const password = process.env.ADMIN_PASSWORD ?? "changeme";
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      "[admin] No ADMIN_PASSWORD set — seeded admin with default 'changeme'. " +
        "Set ADMIN_EMAIL and ADMIN_PASSWORD before going to production."
    );
  }
  await createUser({ email, password, isAdmin: true });
}

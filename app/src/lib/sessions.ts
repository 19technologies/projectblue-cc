/**
 * Lean session configs — no Node-only imports, safe to load in the
 * Edge proxy bundle.
 *
 * The heavier validateCredentials / consumeInvite live in adminAuth.ts /
 * betaInvites.ts respectively, which the API routes (Node runtime) use.
 */

import type { SessionOptions } from "iron-session";

const sessionSecret =
  process.env.SESSION_SECRET ??
  "dev-only-secret-change-me-at-least-32-characters-long-aaaaaaaaaaaaaaaa";

export interface AdminSession {
  userId?: string;
  email?: string;
  isAdmin?: boolean;
}

export interface BetaSession {
  code?: string;
  who?: string;
  redeemedAt?: string;
}

export interface UserSession {
  userId?: string;
  email?: string;
}

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

export const betaSessionOptions: SessionOptions = {
  password: sessionSecret,
  cookieName: "pb_beta_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // ~30 days — testers shouldn't have to re-enter the code every day.
    maxAge: 60 * 60 * 24 * 30,
  },
};

/** Public user accounts — separate from both the admin and beta sessions. */
export const userSessionOptions: SessionOptions = {
  password: sessionSecret,
  cookieName: "pb_user_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};

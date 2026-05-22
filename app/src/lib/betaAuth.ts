import type { SessionOptions } from "iron-session";

export interface BetaSession {
  /** The invite code that was redeemed (kept for audit + display). */
  code?: string;
  /** Free-form identifier the user gave at the gate (email or name). */
  who?: string;
  /** When the session was established. */
  redeemedAt?: string;
}

const sessionSecret =
  process.env.SESSION_SECRET ??
  "dev-only-secret-change-me-at-least-32-characters-long-aaaaaaaaaaaaaaaa";

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

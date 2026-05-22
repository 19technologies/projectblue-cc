import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { betaSessionOptions, type BetaSession } from "@/lib/betaAuth";

const ADMIN_HOST_PATTERN = /^admin\./;
const BETA_HOST_PATTERN = /^beta\./;

/**
 * Three responsibilities:
 *   1. Host routing
 *      - admin.* rewrites onto /admin/*
 *      - beta.*  gates everything behind a beta-session cookie; unauth → /beta
 *   2. Admin auth gate — /admin/* requires session (except /admin/signin)
 *   3. Beta gate is enforced ONLY when the host header is beta.*. Local dev
 *      can access /beta directly without the host header to test the page.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`.
 */
export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;
  const host = req.headers.get("host") ?? "";
  const isAdminHost = ADMIN_HOST_PATTERN.test(host);
  const isBetaHost = BETA_HOST_PATTERN.test(host);

  // 1a. Host routing — admin subdomain
  if (
    isAdminHost &&
    !path.startsWith("/admin") &&
    !path.startsWith("/api/admin")
  ) {
    url.pathname = `/admin${path === "/" ? "" : path}`;
    return NextResponse.rewrite(url);
  }

  // 1b. Beta subdomain — gate everything except the gate itself and its API.
  if (isBetaHost) {
    const isGate = path === "/beta" || path.startsWith("/api/beta/login");
    if (!isGate) {
      const res = NextResponse.next();
      const session = await getIronSession<BetaSession>(req, res, betaSessionOptions);
      if (!session.code) {
        url.pathname = "/beta";
        return NextResponse.redirect(url);
      }
      return res;
    }
  }

  // 2. Admin auth gate
  if (path.startsWith("/admin")) {
    const isPublic = path === "/admin/signin";
    if (!isPublic) {
      const res = NextResponse.next();
      const session = await getIronSession<AdminSession>(req, res, sessionOptions);
      if (!session.isAdmin) {
        const signin = url.clone();
        signin.pathname = "/admin/signin";
        signin.searchParams.set("next", path + (url.search || ""));
        return NextResponse.redirect(signin);
      }
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon).*)",
  ],
};

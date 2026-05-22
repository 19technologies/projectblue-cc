import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionOptions, type AdminSession } from "@/lib/adminAuth";

const ADMIN_HOST_PATTERN = /^admin\./;

/**
 * Two responsibilities:
 *   1. Host routing — admin.projectblue.cc rewrites onto /admin/*
 *   2. Auth gate — /admin/* requires a valid signed session
 *      (except /admin/signin and /api/admin/login).
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` — this file replaces it.
 */
export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  // 1. Host routing — admin subdomain mounts on /admin/*
  const host = req.headers.get("host") ?? "";
  const isAdminHost = ADMIN_HOST_PATTERN.test(host);
  if (
    isAdminHost &&
    !path.startsWith("/admin") &&
    !path.startsWith("/api/admin")
  ) {
    url.pathname = `/admin${path === "/" ? "" : path}`;
    return NextResponse.rewrite(url);
  }

  // 2. Auth gate
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
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon).*)",
  ],
};

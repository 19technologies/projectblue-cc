import { sessionOptions, type AdminSession } from "@/lib/sessions";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/**
 * Server-side auth gate for every admin page except /admin/signin.
 * Replaces what src/proxy.ts used to do — Next 16's Node-runtime proxy
 * isn't supported by OpenNext for Cloudflare yet, so we gate per-layout.
 */
export default async function AdminAuthedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getIronSession<AdminSession>(
    await cookies(),
    sessionOptions
  );
  if (!session.isAdmin) redirect("/admin/signin");
  return <div className="pb-admin">{children}</div>;
}

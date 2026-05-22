import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { saveSocialLinks, type SocialLinks } from "@/lib/links";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: SocialLinks;
  try {
    body = (await req.json()) as SocialLinks;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  }
  await saveSocialLinks(body);
  return NextResponse.json({ ok: true });
}

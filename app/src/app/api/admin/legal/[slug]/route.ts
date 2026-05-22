import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { LEGAL_SLUGS, getLegal, saveLegal, type LegalSlug } from "@/lib/legal";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

function isLegalSlug(s: string): s is LegalSlug {
  return (LEGAL_SLUGS as string[]).includes(s);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await ctx.params;
  if (!isLegalSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await getLegal(slug));
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await ctx.params;
  if (!isLegalSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.title || typeof body.body !== "string") {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }
  const doc = await saveLegal(slug, { title: body.title, body: body.body });
  return NextResponse.json(doc);
}

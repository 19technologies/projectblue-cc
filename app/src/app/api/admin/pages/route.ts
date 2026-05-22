import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { createPage, listPages, type PageKind } from "@/lib/pages";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listPages());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { kind?: string; title?: string; body?: string; slug?: string; excerpt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.kind !== "blog" && body.kind !== "doc") {
    return NextResponse.json({ error: "kind must be blog or doc" }, { status: 400 });
  }
  if (!body.title || typeof body.body !== "string") {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }
  try {
    const page = await createPage({
      kind: body.kind as PageKind,
      title: body.title,
      body: body.body,
      slug: body.slug,
      excerpt: body.excerpt,
    });
    return NextResponse.json(page, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't create page" },
      { status: 400 }
    );
  }
}

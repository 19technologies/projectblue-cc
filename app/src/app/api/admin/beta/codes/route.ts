import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { createInvitesBatch, listInvites } from "@/lib/betaInvites";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listInvites());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { count?: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const count = Math.max(1, Math.min(50, Math.floor(body.count ?? 1)));
  try {
    const invites = await createInvitesBatch(count, body.note);
    return NextResponse.json(invites, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't create invites" },
      { status: 400 }
    );
  }
}

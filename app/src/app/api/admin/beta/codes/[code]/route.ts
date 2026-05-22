import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { deleteInvite, getInvite } from "@/lib/betaInvites";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await ctx.params;
  const inv = await getInvite(code);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inv.usedAt) {
    return NextResponse.json(
      { error: "Can't revoke a code that's already been used" },
      { status: 400 }
    );
  }
  await deleteInvite(code);
  return NextResponse.json({ ok: true });
}

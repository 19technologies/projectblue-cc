import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { deleteUser, getUserById, listUsers } from "@/lib/users";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (id === session.userId) {
    return NextResponse.json({ error: "You can't delete yourself" }, { status: 400 });
  }

  const target = await getUserById(id);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Refuse to delete the last admin so we don't lock everyone out.
  if (target.isAdmin) {
    const all = await listUsers();
    const otherAdmins = all.filter((u) => u.isAdmin && u.id !== id);
    if (otherAdmins.length === 0) {
      return NextResponse.json({ error: "Can't delete the last admin" }, { status: 400 });
    }
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}

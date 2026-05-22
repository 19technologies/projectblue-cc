import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { deleteRequest, updateRequestStatus, type RequestStatus } from "@/lib/betaRequests";
import { createInvite } from "@/lib/betaInvites";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

const VALID_STATUS: RequestStatus[] = ["pending", "invited", "declined"];

/**
 * PATCH { status: "invited" | "declined" | "pending", mintCode?: boolean }
 *
 * When transitioning to "invited" with mintCode=true, the route mints a fresh
 * invite code in the same call and stamps it on the request — so the admin's
 * "Invite" button in the UI is a single click.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  let body: { status?: string; mintCode?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const status = body.status as RequestStatus;
  if (!VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  try {
    let invitedCode: string | undefined;
    if (status === "invited" && body.mintCode) {
      const inv = await createInvite({ note: id });
      invitedCode = inv.code;
    }
    const updated = await updateRequestStatus(id, status, invitedCode);
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't update";
    const status404 = msg === "Not found";
    return NextResponse.json({ error: msg }, { status: status404 ? 404 : 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await deleteRequest(id);
  return NextResponse.json({ ok: true });
}

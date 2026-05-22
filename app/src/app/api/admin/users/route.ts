import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { createUser, listUsers } from "@/lib/users";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listUsers());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  try {
    const user = await createUser({
      email: body.email,
      password: body.password,
      isAdmin: true,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't create user" },
      { status: 400 }
    );
  }
}

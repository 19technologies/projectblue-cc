import { userSessionOptions, type UserSession } from "@/lib/sessions";
import { createUser } from "@/lib/users";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  let user: { id: string; email: string };
  try {
    user = await createUser({ email, password, isAdmin: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't create account" },
      { status: 400 }
    );
  }

  const session = await getIronSession<UserSession>(await cookies(), userSessionOptions);
  session.userId = user.id;
  session.email = user.email;
  await session.save();

  return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
}

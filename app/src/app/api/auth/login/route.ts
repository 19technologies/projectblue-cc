import { userSessionOptions, type UserSession } from "@/lib/sessions";
import { validateUserCredentials } from "@/lib/userAuth";
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

  const user = await validateUserCredentials(email, password);
  if (!user) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const session = await getIronSession<UserSession>(await cookies(), userSessionOptions);
  session.userId = user.userId;
  session.email = user.email;
  await session.save();

  return NextResponse.json({ ok: true, email: user.email });
}

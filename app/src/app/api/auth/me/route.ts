import { userSessionOptions, type UserSession } from "@/lib/sessions";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Returns the signed-in user, or { user: null } when anonymous. */
export async function GET() {
  const session = await getIronSession<UserSession>(await cookies(), userSessionOptions);
  if (!session.userId) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: { email: session.email } });
}

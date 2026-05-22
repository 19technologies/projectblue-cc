import { userSessionOptions, type UserSession } from "@/lib/sessions";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getIronSession<UserSession>(await cookies(), userSessionOptions);
  session.destroy();
  return NextResponse.json({ ok: true });
}

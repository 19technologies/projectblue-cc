import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  session.destroy();
  return NextResponse.redirect(
    new URL(
      "/admin/signin",
      process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    ),
    { status: 303 }
  );
}

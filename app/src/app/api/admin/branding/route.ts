import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { saveBrandingText } from "@/lib/branding";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { line1?: string; line2?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const branding = await saveBrandingText(body.line1 ?? "", body.line2 ?? "");
  return NextResponse.json(branding);
}

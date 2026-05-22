import { betaSessionOptions, type BetaSession } from "@/lib/betaAuth";
import { consumeInvite } from "@/lib/betaInvites";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let body: { code?: string; who?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const code = body.code?.trim().toUpperCase();
  const who = body.who?.trim() ?? "unknown";
  if (!code) {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  const inv = await consumeInvite(code, who);
  if (!inv) {
    return NextResponse.json(
      { error: "Invalid or already-used code" },
      { status: 401 }
    );
  }

  const session = await getIronSession<BetaSession>(await cookies(), betaSessionOptions);
  session.code = inv.code;
  session.who = who;
  session.redeemedAt = inv.usedAt;
  await session.save();

  return NextResponse.json({ ok: true });
}

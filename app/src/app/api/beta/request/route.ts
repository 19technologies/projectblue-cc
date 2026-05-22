import { createOrTouchRequest } from "@/lib/betaRequests";
import { NextResponse } from "next/server";

/**
 * Public endpoint. Anyone can ask for beta access by leaving an email.
 * Idempotent on email so refreshes don't create duplicates.
 */
export async function POST(req: Request) {
  let body: { email?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.email || !body.email.includes("@")) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  try {
    await createOrTouchRequest({ email: body.email, message: body.message });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't record request" },
      { status: 400 }
    );
  }
}

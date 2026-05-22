import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import {
  ALLOWED_LOGO_TYPES,
  MAX_LOGO_BYTES,
  deleteLogo,
  saveLogo,
} from "@/lib/branding";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

/**
 * POST { contentType, base64 } — store an uploaded logo image in KV.
 * The client reads the file with FileReader and sends base64, so there's
 * no multipart parsing on the worker.
 */
export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { contentType?: string; base64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { contentType, base64 } = body;
  if (!contentType || !base64) {
    return NextResponse.json({ error: "contentType and base64 required" }, { status: 400 });
  }
  if (!ALLOWED_LOGO_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: "Logo must be PNG, SVG, WebP or JPEG" },
      { status: 400 }
    );
  }
  // base64 inflates ~4/3; check the decoded size.
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_LOGO_BYTES) {
    return NextResponse.json(
      { error: `Logo too large (max ${Math.round(MAX_LOGO_BYTES / 1024)} KB)` },
      { status: 400 }
    );
  }

  await saveLogo({ contentType, base64 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteLogo();
  return NextResponse.json({ ok: true });
}

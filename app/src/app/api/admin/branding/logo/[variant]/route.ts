import { sessionOptions, type AdminSession } from "@/lib/adminAuth";
import { ALLOWED_LOGO_TYPES, deleteLogo, LOGO_VARIANTS, MAX_LOGO_BYTES, saveLogo, type LogoVariant } from "@/lib/branding";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  return session.isAdmin ? session : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ variant: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { variant } = await params;
  if (!LOGO_VARIANTS.includes(variant as LogoVariant)) {
    return NextResponse.json({ error: "Unknown variant" }, { status: 400 });
  }

  let body: { contentType?: string; base64?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { contentType, base64 } = body;
  if (!contentType || !base64) {
    return NextResponse.json({ error: "contentType and base64 required" }, { status: 400 });
  }
  if (!ALLOWED_LOGO_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Logo must be PNG, SVG, WebP or JPEG" }, { status: 400 });
  }
  if (Math.floor((base64.length * 3) / 4) > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: `Logo too large (max ${Math.round(MAX_LOGO_BYTES / 1024)} KB)` }, { status: 400 });
  }

  await saveLogo(variant as LogoVariant, { contentType, base64 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ variant: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { variant } = await params;
  if (!LOGO_VARIANTS.includes(variant as LogoVariant)) {
    return NextResponse.json({ error: "Unknown variant" }, { status: 400 });
  }
  await deleteLogo(variant as LogoVariant);
  return NextResponse.json({ ok: true });
}

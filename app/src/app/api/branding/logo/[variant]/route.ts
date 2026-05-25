import { getLogo, LOGO_VARIANTS, type LogoVariant } from "@/lib/branding";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (!LOGO_VARIANTS.includes(variant as LogoVariant)) {
    return NextResponse.json({ error: "Unknown variant" }, { status: 400 });
  }
  const logo = await getLogo(variant as LogoVariant);
  if (!logo) return NextResponse.json({ error: "No logo set" }, { status: 404 });
  const bytes = Uint8Array.from(atob(logo.base64), (c) => c.charCodeAt(0));
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

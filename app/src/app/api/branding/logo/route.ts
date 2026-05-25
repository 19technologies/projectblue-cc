import { getLogo } from "@/lib/branding";
import { NextResponse } from "next/server";

/** Legacy public endpoint — serves the light variant (or dark if light is absent). */
export async function GET() {
  const logo = (await getLogo("light")) ?? (await getLogo("dark"));
  if (!logo) return NextResponse.json({ error: "No logo set" }, { status: 404 });
  const bytes = Uint8Array.from(atob(logo.base64), (c) => c.charCodeAt(0));
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

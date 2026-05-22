import { getLogo } from "@/lib/branding";
import { NextResponse } from "next/server";

/** Public — streams the uploaded logo image from KV. 404 if none set. */
export async function GET() {
  const logo = await getLogo();
  if (!logo) {
    return NextResponse.json({ error: "No logo set" }, { status: 404 });
  }
  const bytes = Uint8Array.from(atob(logo.base64), (c) => c.charCodeAt(0));
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

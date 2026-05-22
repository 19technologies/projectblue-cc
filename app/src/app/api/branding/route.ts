import { getBranding } from "@/lib/branding";
import { NextResponse } from "next/server";

/** Public — the word-mark text + whether an image override is set. */
export async function GET() {
  const branding = await getBranding();
  return NextResponse.json(branding, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
}

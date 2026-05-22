import { getSocialLinks } from "@/lib/links";
import { NextResponse } from "next/server";

export async function GET() {
  const links = await getSocialLinks();
  return NextResponse.json(links, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
}

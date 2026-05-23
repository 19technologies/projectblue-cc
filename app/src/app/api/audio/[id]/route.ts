import { getAudio } from "@/lib/audioStorage";
import { NextResponse } from "next/server";

/** Public — streams an uploaded audio file from KV. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const entry = await getAudio(id);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bytes = Uint8Array.from(atob(entry.base64), (c) => c.charCodeAt(0));
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": entry.contentType,
      "Content-Disposition": `inline; filename="${entry.title.replace(/"/g, "")}"`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Accept-Ranges": "bytes",
    },
  });
}

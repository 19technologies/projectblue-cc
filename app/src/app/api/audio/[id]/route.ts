import { getAudio } from "@/lib/audioStorage";
import { NextResponse } from "next/server";

/** Public — streams an uploaded audio file from KV, with full range-request support. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const entry = await getAudio(id);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const total = entry.bytes.byteLength;
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      const startStr = match[1];
      const endStr = match[2];
      let start: number;
      let end: number;
      if (!startStr && endStr) {
        // Suffix range: bytes=-N means last N bytes
        start = Math.max(0, total - parseInt(endStr, 10));
        end = total - 1;
      } else {
        start = startStr ? parseInt(startStr, 10) : 0;
        end = endStr ? parseInt(endStr, 10) : total - 1;
      }
      start = Math.max(0, Math.min(start, total - 1));
      end = Math.max(start, Math.min(end, total - 1));
      const chunk = entry.bytes.slice(start, end + 1);
      return new NextResponse(chunk as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": entry.contentType,
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename="${entry.title.replace(/"/g, "")}"`,
          "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
      });
    }
  }

  return new NextResponse(entry.bytes as BodyInit, {
    headers: {
      "Content-Type": entry.contentType,
      "Content-Length": String(total),
      "Content-Disposition": `inline; filename="${entry.title.replace(/"/g, "")}"`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Accept-Ranges": "bytes",
    },
  });
}

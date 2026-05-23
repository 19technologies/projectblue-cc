import {
  ALLOWED_AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  saveAudio,
} from "@/lib/audioStorage";
import { betaSessionOptions, type BetaSession } from "@/lib/sessions";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Upload an audio file to be played in a room.
 *
 * Body: { contentType, base64, title } — the client reads the file with
 * FileReader and posts JSON (no multipart parsing on the worker).
 *
 * Gated by the beta cookie — uploads cost storage, so only redeemed
 * testers can do it. A guessed room code alone isn't enough.
 */
export async function POST(req: Request) {
  const session = await getIronSession<BetaSession>(await cookies(), betaSessionOptions);
  if (!session.code) {
    return NextResponse.json(
      { error: "Beta access required to upload audio" },
      { status: 401 }
    );
  }

  let body: { contentType?: string; base64?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { contentType, base64, title } = body;
  if (!contentType || !base64) {
    return NextResponse.json(
      { error: "contentType and base64 required" },
      { status: 400 }
    );
  }
  if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: "Unsupported audio format" },
      { status: 400 }
    );
  }
  // base64 inflates ~4/3; check the decoded size.
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }

  const saved = await saveAudio({
    contentType,
    base64,
    title: title ?? "untitled",
  });
  return NextResponse.json(saved, { status: 201 });
}

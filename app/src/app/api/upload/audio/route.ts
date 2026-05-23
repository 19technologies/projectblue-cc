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
 * Wire format: raw binary body, `Content-Type` is the file's MIME, the
 * original filename is URI-encoded in `X-Filename`. No multipart, no
 * JSON, no base64 — those round-trips were spending the Worker's CPU
 * budget on parse work and surfacing as a generic "Upload failed".
 *
 * Gated by the beta cookie — uploads cost storage, so only redeemed
 * testers can do it. A guessed room code alone isn't enough.
 */
export async function POST(req: Request) {
  const session = await getIronSession<BetaSession>(
    await cookies(),
    betaSessionOptions
  );
  if (!session.code) {
    return NextResponse.json(
      { error: "Beta access required to upload audio" },
      { status: 401 }
    );
  }

  const contentType = (req.headers.get("Content-Type") ?? "").split(";")[0].trim();
  if (!contentType || !ALLOWED_AUDIO_TYPES.includes(contentType)) {
    return NextResponse.json(
      {
        error: contentType
          ? `Unsupported audio format (${contentType}).`
          : "Missing audio Content-Type header.",
      },
      { status: 400 }
    );
  }

  // Fast-reject on Content-Length when present so we don't read 50 MB
  // of bytes just to throw them away.
  const declared = Number(req.headers.get("Content-Length") ?? "0");
  if (declared > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB).` },
      { status: 413 }
    );
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Couldn't read upload body." }, { status: 400 });
  }
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB).` },
      { status: 413 }
    );
  }

  const rawName = req.headers.get("X-Filename") ?? "untitled";
  let title = rawName;
  try {
    title = decodeURIComponent(rawName);
  } catch {
    /* keep raw if it isn't valid percent-encoding */
  }

  const saved = await saveAudio({ contentType, bytes, title });
  return NextResponse.json(saved, { status: 201 });
}

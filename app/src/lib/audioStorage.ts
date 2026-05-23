import { getKV } from "./kv";

const KEY = (id: string) => `audio:${id}`;

/** 15 MB raw cap. Base64 inflates ~4/3 so the KV value comes in under 25 MB. */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
  "audio/x-m4a",
];

export interface AudioEntry {
  id: string;
  contentType: string;
  base64: string;
  title: string;
  uploadedAt: string;
}

export interface AudioPublic {
  id: string;
  url: string;
  title: string;
}

const sanitize = (s: string): string =>
  s.replace(/[^\w.\-\s]+/g, "").trim().slice(0, 120) || "untitled";

export async function saveAudio(input: {
  contentType: string;
  base64: string;
  title: string;
}): Promise<AudioPublic> {
  const id = crypto.randomUUID();
  const entry: AudioEntry = {
    id,
    contentType: input.contentType,
    base64: input.base64,
    title: sanitize(input.title),
    uploadedAt: new Date().toISOString(),
  };
  await getKV().put<AudioEntry>(KEY(id), entry);
  return { id, url: `/api/audio/${id}`, title: entry.title };
}

export async function getAudio(id: string): Promise<AudioEntry | null> {
  // Reject anything that isn't a UUID-shaped key.
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return getKV().get<AudioEntry>(KEY(id));
}

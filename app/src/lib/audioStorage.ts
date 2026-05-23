/**
 * Audio storage — binary in/out, two keys per upload.
 *
 *   audio:<id>:m  → JSON metadata (contentType, title, uploadedAt)
 *   audio:<id>:d  → raw ArrayBuffer
 *
 * The old base64-in-JSON layout was the upload pipeline's bottleneck:
 * the client JSON-serialized 20 MB of base64, the Worker `req.json()`-ed
 * it back, and the storage layer JSON.stringified it again before KV. On
 * Cloudflare's per-request CPU budget that blew up as "Upload failed".
 *
 * Binary end-to-end: the browser POSTs the File directly, the Worker
 * does `req.arrayBuffer()`, and KV stores the bytes as-is.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { getKV } from "./kv";

const META = (id: string) => `audio:${id}:m`;
const DATA = (id: string) => `audio:${id}:d`;

/** 15 MB raw cap. Comfortably under KV's 25 MiB value ceiling. */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * Browsers and operating systems disagree on audio MIME types — `.m4a`
 * arrives as either `audio/mp4` or `audio/x-m4a`, `.mp3` is sometimes
 * `audio/mpeg` and sometimes `audio/mp3`. Be generous.
 */
export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/x-aac",
  "audio/ogg",
  "audio/oga",
  "audio/opus",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
];

export interface AudioMeta {
  id: string;
  contentType: string;
  title: string;
  uploadedAt: string;
}

export interface AudioEntry extends AudioMeta {
  bytes: ArrayBuffer;
}

export interface AudioPublic {
  id: string;
  url: string;
  title: string;
}

const sanitize = (s: string): string =>
  s.replace(/[^\w.\-\s]+/g, "").trim().slice(0, 120) || "untitled";

/* ── Binary store ─────────────────────────────────────────────────────
   The shared kv.ts wrapper is JSON-only by design (admin/CMS state is
   all JSON). Audio bytes bypass it and talk to the namespace directly,
   keeping the abstraction small. */

interface BinaryNamespace {
  put(key: string, value: ArrayBuffer): Promise<void>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  delete(key: string): Promise<void>;
}

interface BinaryStore {
  put(id: string, bytes: ArrayBuffer): Promise<void>;
  get(id: string): Promise<ArrayBuffer | null>;
}

class CloudflareBinary implements BinaryStore {
  constructor(private readonly ns: BinaryNamespace) {}
  put(id: string, bytes: ArrayBuffer) {
    return this.ns.put(DATA(id), bytes);
  }
  get(id: string): Promise<ArrayBuffer | null> {
    return this.ns.get(DATA(id), "arrayBuffer");
  }
}

class FileBinary implements BinaryStore {
  constructor(private readonly dir: string) {}
  async put(id: string, bytes: ArrayBuffer) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(join(this.dir, id), new Uint8Array(bytes));
  }
  async get(id: string): Promise<ArrayBuffer | null> {
    try {
      const buf = await fs.readFile(join(this.dir, id));
      // Slice into a fresh ArrayBuffer so we don't hand callers a view
      // into Node's internal pool.
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}

let fileBin: BinaryStore | null = null;

function getBinaryStore(): BinaryStore {
  try {
    const { env } = getCloudflareContext();
    const ns = (env as { PROJECTBLUE_KV?: BinaryNamespace }).PROJECTBLUE_KV;
    if (ns) return new CloudflareBinary(ns);
  } catch {
    /* not on the Cloudflare runtime — fall through */
  }
  if (!fileBin) {
    const file = join(process.cwd(), ".kv-dev", "audio", ".keep");
    // Touch the parent so the first put doesn't race a missing dir.
    void fs.mkdir(dirname(file), { recursive: true }).catch(() => {});
    fileBin = new FileBinary(dirname(file));
  }
  return fileBin;
}

/* ── Public API ───────────────────────────────────────────────────── */

export async function saveAudio(input: {
  contentType: string;
  bytes: ArrayBuffer;
  title: string;
}): Promise<AudioPublic> {
  const id = crypto.randomUUID();
  const meta: AudioMeta = {
    id,
    contentType: input.contentType,
    title: sanitize(input.title),
    uploadedAt: new Date().toISOString(),
  };
  await Promise.all([
    getKV().put<AudioMeta>(META(id), meta),
    getBinaryStore().put(id, input.bytes),
  ]);
  return { id, url: `/api/audio/${id}`, title: meta.title };
}

export async function getAudio(id: string): Promise<AudioEntry | null> {
  // Reject anything that isn't a UUID-shaped key.
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const [meta, bytes] = await Promise.all([
    getKV().get<AudioMeta>(META(id)),
    getBinaryStore().get(id),
  ]);
  if (!meta || !bytes) return null;
  return { ...meta, bytes };
}

/**
 * Wire protocol for the room WebSocket.
 *
 * Media is the primary abstraction — a room plays one Media at a time,
 * which is either an uploaded audio file or a YouTube video. The sync
 * logic (play / pause / seek anchored to a server timestamp) is the same
 * for both.
 *
 * Manual validation (no zod) keeps the Worker bundle tiny. Every inbound
 * message is checked by parseClientMessage before use.
 */

export interface PeerInfo {
  id: string;
  name: string;
}

export type Media =
  | { kind: "youtube"; videoId: string }
  | { kind: "audio"; url: string; title?: string };

/** Authoritative playback state held by the RoomDO. */
export interface MediaState {
  media: Media;
  playing: boolean;
  /** Playhead position (seconds) at anchorServerMs. */
  positionSec: number;
  /** Server Date.now() when this state was set. */
  anchorServerMs: number;
}

/* ── Client → server ───────────────────────────────────────────── */

export type ClientMessage =
  | { type: "HELLO"; clientId: string; name: string }
  | { type: "SET_MEDIA"; media: Media }
  | { type: "PLAY"; positionSec: number }
  | { type: "PAUSE"; positionSec: number }
  | { type: "SEEK"; positionSec: number }
  | { type: "PING"; t0: number };

/* ── Server → client ───────────────────────────────────────────── */

export type ServerMessage =
  | { type: "ROOM_STATE"; selfId: string; peers: PeerInfo[]; state: MediaState | null }
  | { type: "PEER_JOINED"; peer: PeerInfo }
  | { type: "PEER_LEFT"; peerId: string }
  | { type: "MEDIA"; state: MediaState }
  | { type: "PONG"; t0: number; serverMs: number };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const AUDIO_URL = /^\/api\/audio\/[A-Za-z0-9_-]{1,80}$/;

function parseMedia(v: unknown): Media | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (m.kind === "youtube") {
    if (typeof m.videoId === "string" && YT_ID.test(m.videoId)) {
      return { kind: "youtube", videoId: m.videoId };
    }
    return null;
  }
  if (m.kind === "audio") {
    if (typeof m.url === "string" && AUDIO_URL.test(m.url)) {
      const title = typeof m.title === "string" ? m.title.slice(0, 120) : undefined;
      return { kind: "audio", url: m.url, title };
    }
    return null;
  }
  return null;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;

  switch (m.type) {
    case "HELLO":
      if (typeof m.clientId === "string" && typeof m.name === "string") {
        return { type: "HELLO", clientId: m.clientId, name: m.name.slice(0, 40) };
      }
      return null;
    case "SET_MEDIA": {
      const media = parseMedia(m.media);
      return media ? { type: "SET_MEDIA", media } : null;
    }
    case "PLAY":
    case "PAUSE":
    case "SEEK":
      if (typeof m.positionSec === "number" && m.positionSec >= 0) {
        return { type: m.type, positionSec: m.positionSec };
      }
      return null;
    case "PING":
      if (typeof m.t0 === "number") return { type: "PING", t0: m.t0 };
      return null;
    default:
      return null;
  }
}

export const encode = (m: ServerMessage): string => JSON.stringify(m);

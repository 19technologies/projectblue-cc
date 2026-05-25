/**
 * Wire protocol for the room WebSocket.
 *
 * A room plays one Media at a time and keeps a FIFO Queue of upcoming
 * items. The host drives playback — guests can browse, chat, and add to
 * the queue, but only the host's PLAY/PAUSE/SEEK/SET_MEDIA messages are
 * accepted. Host election is automatic: the first joiner becomes host,
 * and on disconnect the role passes to whoever has been there longest.
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

export interface QueueItem {
  /** Stable random id so removals survive reorders. */
  id: string;
  media: Media;
  /** PeerInfo.id of whoever added it — UI uses it for "added by". */
  addedBy: string;
}

export interface ChatMsg {
  id: string;
  /** PeerInfo.id of the sender. */
  from: string;
  /** Display name at send time — denormalised so renames don't rewrite history. */
  fromName: string;
  text: string;
  /** Server Date.now() — clients render relative time off this. */
  ts: number;
}

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

/** "off" → pause when queue empty; "all" → played items go back to end;
 *  "one" → replay the current track on advance. Independent of shuffle. */
export type RepeatMode = "off" | "all" | "one";

export interface PlaybackMode {
  shuffle: boolean;
  repeat: RepeatMode;
  guestCanUpload: boolean;
}

export type ClientMessage =
  | { type: "HELLO"; clientId: string; name: string }
  | { type: "SET_MEDIA"; media: Media }
  | { type: "PLAY"; positionSec: number }
  | { type: "PAUSE"; positionSec: number }
  | { type: "SEEK"; positionSec: number }
  | { type: "QUEUE_ADD"; media: Media }
  /** Batch — used by bulk file drops so 30 tracks are one message, one broadcast. */
  | { type: "QUEUE_ADD_MANY"; items: Media[] }
  | { type: "QUEUE_REMOVE"; itemId: string }
  | { type: "QUEUE_CLEAR" }
  | { type: "QUEUE_NEXT" }
  /** Move `itemId` to index `to` (clamped). Host-only. */
  | { type: "QUEUE_REORDER"; itemId: string; to: number }
  | { type: "SET_MODE"; mode: Partial<PlaybackMode> }
  | { type: "CHAT"; text: string }
  | { type: "PING"; t0: number };

/* ── Server → client ───────────────────────────────────────────── */

export type ServerMessage =
  | {
      type: "ROOM_STATE";
      selfId: string;
      hostId: string | null;
      peers: PeerInfo[];
      state: MediaState | null;
      queue: QueueItem[];
      chat: ChatMsg[];
      mode: PlaybackMode;
    }
  | { type: "PEER_JOINED"; peer: PeerInfo }
  | { type: "PEER_LEFT"; peerId: string }
  | { type: "HOST"; hostId: string | null }
  | { type: "MEDIA"; state: MediaState }
  | { type: "QUEUE"; queue: QueueItem[] }
  | { type: "MODE"; mode: PlaybackMode }
  | { type: "CHAT"; msg: ChatMsg }
  | { type: "PONG"; t0: number; serverMs: number }
  | { type: "ERROR"; code: "NOT_HOST" | "BAD_INPUT"; message?: string };

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
    case "QUEUE_ADD": {
      const media = parseMedia(m.media);
      return media ? { type: "QUEUE_ADD", media } : null;
    }
    case "QUEUE_ADD_MANY": {
      if (!Array.isArray(m.items)) return null;
      const items: Media[] = [];
      // Cap server-side too — a malicious client can't flood the queue.
      for (const raw of m.items.slice(0, 100)) {
        const med = parseMedia(raw);
        if (med) items.push(med);
      }
      return items.length > 0 ? { type: "QUEUE_ADD_MANY", items } : null;
    }
    case "QUEUE_REMOVE":
      if (typeof m.itemId === "string" && m.itemId.length <= 64) {
        return { type: "QUEUE_REMOVE", itemId: m.itemId };
      }
      return null;
    case "QUEUE_CLEAR":
      return { type: "QUEUE_CLEAR" };
    case "QUEUE_NEXT":
      return { type: "QUEUE_NEXT" };
    case "QUEUE_REORDER":
      if (
        typeof m.itemId === "string" &&
        m.itemId.length <= 64 &&
        typeof m.to === "number" &&
        Number.isInteger(m.to) &&
        m.to >= 0
      ) {
        return { type: "QUEUE_REORDER", itemId: m.itemId, to: m.to };
      }
      return null;
    case "SET_MODE": {
      if (!m.mode || typeof m.mode !== "object") return null;
      const raw = m.mode as Record<string, unknown>;
      const mode: Partial<PlaybackMode> = {};
      if (typeof raw.shuffle === "boolean") mode.shuffle = raw.shuffle;
      if (raw.repeat === "off" || raw.repeat === "all" || raw.repeat === "one") {
        mode.repeat = raw.repeat;
      }
      if (typeof raw.guestCanUpload === "boolean") mode.guestCanUpload = raw.guestCanUpload;
      return Object.keys(mode).length > 0 ? { type: "SET_MODE", mode } : null;
    }
    case "CHAT":
      if (typeof m.text === "string") {
        const text = m.text.trim().slice(0, 500);
        return text ? { type: "CHAT", text } : null;
      }
      return null;
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

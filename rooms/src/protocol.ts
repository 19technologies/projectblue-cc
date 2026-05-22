/**
 * Wire protocol for the room WebSocket — synchronized YouTube watching.
 *
 * Manual validation (no zod) to keep the Worker bundle tiny. Every inbound
 * message is checked by parseClientMessage before use.
 */

export interface PeerInfo {
  id: string;
  name: string;
}

/** Authoritative playback state, held by the RoomDO. */
export interface VideoState {
  videoId: string;
  playing: boolean;
  /** Playhead position (seconds) at anchorServerMs. */
  positionSec: number;
  /** Server Date.now() when this state was set. */
  anchorServerMs: number;
}

/* ── Client → server ───────────────────────────────────────────── */

export type ClientMessage =
  | { type: "HELLO"; clientId: string; name: string }
  | { type: "SET_VIDEO"; videoId: string }
  | { type: "PLAY"; positionSec: number }
  | { type: "PAUSE"; positionSec: number }
  | { type: "SEEK"; positionSec: number }
  | { type: "PING"; t0: number };

/* ── Server → client ───────────────────────────────────────────── */

export type ServerMessage =
  | { type: "ROOM_STATE"; selfId: string; peers: PeerInfo[]; video: VideoState | null }
  | { type: "PEER_JOINED"; peer: PeerInfo }
  | { type: "PEER_LEFT"; peerId: string }
  | { type: "PLAYBACK"; video: VideoState }
  | { type: "PONG"; t0: number; serverMs: number };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

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
    case "SET_VIDEO":
      if (typeof m.videoId === "string" && YT_ID.test(m.videoId)) {
        return { type: "SET_VIDEO", videoId: m.videoId };
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

/**
 * Project Blue — rooms Worker.
 *
 * One Durable Object instance per 6-character room code. The browser opens
 * a WebSocket to wss://rooms.projectblue.cc/room/<CODE>; the Worker routes
 * it to that room's DO, which coordinates synchronized YouTube playback.
 */

import {
  encode,
  parseClientMessage,
  type PeerInfo,
  type ServerMessage,
  type VideoState,
} from "./protocol";

interface Env {
  ROOM: DurableObjectNamespace;
}

const ROOM_CODE = /^[A-Z0-9]{6}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{6})$/);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }
    const code = match[1].toUpperCase();
    if (!ROOM_CODE.test(code)) {
      return new Response("Bad room code", { status: 400 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const id = env.ROOM.idFromName(code);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};

interface Session {
  ws: WebSocket;
  peer: PeerInfo;
  helloed: boolean;
}

export class RoomDO {
  private sessions = new Set<Session>();
  private video: VideoState | null = null;

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const session: Session = {
      ws: server,
      peer: { id: crypto.randomUUID(), name: "guest" },
      helloed: false,
    };
    this.sessions.add(session);

    server.addEventListener("message", (event) => {
      if (typeof event.data === "string") this.onMessage(session, event.data);
    });
    const drop = () => this.onClose(session);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    return new Response(null, { status: 101, webSocket: client });
  }

  private send(session: Session, msg: ServerMessage) {
    try {
      session.ws.send(encode(msg));
    } catch {
      /* socket already gone */
    }
  }

  private broadcast(msg: ServerMessage, except?: Session) {
    const payload = encode(msg);
    for (const s of this.sessions) {
      if (s === except) continue;
      try {
        s.ws.send(payload);
      } catch {
        /* skip dead socket */
      }
    }
  }

  /** Re-anchor the video state to "now" so late joiners compute the right
   *  playhead. Returns the freshened state. */
  private freshenVideo(): VideoState | null {
    if (!this.video) return null;
    const now = Date.now();
    if (this.video.playing) {
      const elapsed = (now - this.video.anchorServerMs) / 1000;
      this.video = {
        ...this.video,
        positionSec: this.video.positionSec + elapsed,
        anchorServerMs: now,
      };
    }
    return this.video;
  }

  private onMessage(session: Session, raw: string) {
    const msg = parseClientMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case "HELLO": {
        session.peer = { id: session.peer.id, name: msg.name || "guest" };
        session.helloed = true;
        // Hand the newcomer the current room + a re-anchored video state.
        const peers = [...this.sessions]
          .filter((s) => s.helloed)
          .map((s) => s.peer);
        this.send(session, {
          type: "ROOM_STATE",
          selfId: session.peer.id,
          peers,
          video: this.freshenVideo(),
        });
        this.broadcast({ type: "PEER_JOINED", peer: session.peer }, session);
        break;
      }
      case "SET_VIDEO": {
        this.video = {
          videoId: msg.videoId,
          playing: false,
          positionSec: 0,
          anchorServerMs: Date.now(),
        };
        this.broadcast({ type: "PLAYBACK", video: this.video });
        break;
      }
      case "PLAY": {
        if (!this.video) return;
        this.video = {
          ...this.video,
          playing: true,
          positionSec: msg.positionSec,
          anchorServerMs: Date.now(),
        };
        this.broadcast({ type: "PLAYBACK", video: this.video });
        break;
      }
      case "PAUSE": {
        if (!this.video) return;
        this.video = {
          ...this.video,
          playing: false,
          positionSec: msg.positionSec,
          anchorServerMs: Date.now(),
        };
        this.broadcast({ type: "PLAYBACK", video: this.video });
        break;
      }
      case "SEEK": {
        if (!this.video) return;
        this.video = {
          ...this.video,
          positionSec: msg.positionSec,
          anchorServerMs: Date.now(),
        };
        this.broadcast({ type: "PLAYBACK", video: this.video });
        break;
      }
      case "PING": {
        this.send(session, { type: "PONG", t0: msg.t0, serverMs: Date.now() });
        break;
      }
    }
  }

  private onClose(session: Session) {
    if (!this.sessions.has(session)) return;
    this.sessions.delete(session);
    if (session.helloed) {
      this.broadcast({ type: "PEER_LEFT", peerId: session.peer.id });
    }
  }
}

/**
 * Project Blue — rooms Worker.
 *
 * One Durable Object instance per 6-character room code. The browser opens
 * a WebSocket to wss://rooms.projectblue.cc/room/<CODE>; the Worker routes
 * it to that room's DO, which coordinates synchronized playback of either
 * an uploaded audio file or a YouTube video.
 *
 * The DO is a thin "fast pipe" state broker: parse → mutate small state →
 * broadcast a JSON payload. No audio bytes, no decoding, no buffering on
 * the server. Clients schedule playback locally with the Web Audio API
 * and an NTP-style clock offset (see app/src/components/Room.tsx).
 *
 * State (media + queue + chat history) is persisted to DurableObjectState
 * storage so rooms survive eviction. hostId is intentionally NOT persisted
 * — fresh election runs on cold start to avoid handing the room to an
 * absent peer.
 */

import { DurableObject } from "cloudflare:workers";
import {
  encode,
  parseClientMessage,
  type ChatMsg,
  type MediaState,
  type PeerInfo,
  type QueueItem,
  type ServerMessage,
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
  /** Monotonic counter at join — used to elect the next host on disconnect. */
  joinedAt: number;
}

/**
 * Lead time on PLAY / play-while-SEEK so every client can schedule the
 * audio start at the *same* server timestamp. Without this, the first
 * client starts ~immediately and the second starts after one network
 * hop — they drift by the propagation delta. 250ms is enough for the
 * slowest realistic connection while still feeling instantaneous.
 */
const SCHEDULE_LEAD_MS = 250;

/** Hard cap on queue length — keep memory bounded and broadcasts small. */
const MAX_QUEUE = 200;

/** Chat scroll-back kept on the server so late joiners see context. */
const MAX_CHAT_HISTORY = 80;

/** Per-session chat rate limit — 12 msgs/10s. */
const CHAT_WINDOW_MS = 10_000;
const CHAT_MAX_PER_WINDOW = 12;

const SK = {
  state: "v1:state",
  queue: "v1:queue",
  chat: "v1:chat",
} as const;

export class RoomDO extends DurableObject<Env> {
  private sessions = new Set<Session>();
  private state: MediaState | null = null;
  private queue: QueueItem[] = [];
  private chat: ChatMsg[] = [];
  private hostId: string | null = null;
  private joinCounter = 0;
  private chatBuckets = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Hydrate persisted state before any fetch() is dispatched —
    // blockConcurrencyWhile defers incoming work until this resolves.
    ctx.blockConcurrencyWhile(async () => {
      const [s, q, c] = await Promise.all([
        ctx.storage.get<MediaState>(SK.state),
        ctx.storage.get<QueueItem[]>(SK.queue),
        ctx.storage.get<ChatMsg[]>(SK.chat),
      ]);
      if (s) this.state = s;
      if (q) this.queue = q;
      if (c) this.chat = c;
    });
  }

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const session: Session = {
      ws: server,
      peer: { id: crypto.randomUUID(), name: "guest" },
      helloed: false,
      joinedAt: ++this.joinCounter,
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

  /** Fire-and-forget storage write. Failure is non-fatal — the live state
   *  is in-memory; persistence is best-effort recovery for evictions. */
  private persist(key: (typeof SK)[keyof typeof SK], value: unknown) {
    void this.ctx.storage.put(key, value).catch(() => {});
  }

  /** Re-anchor playback state to "now" so late joiners compute the right
   *  playhead. We skip the re-anchor when the existing anchor is still in
   *  the future (within the SCHEDULE_LEAD window) — those clients should
   *  schedule from the original target so they line up with peers. */
  private freshenState(): MediaState | null {
    if (!this.state) return null;
    if (!this.state.playing) return this.state;
    const now = Date.now();
    const elapsed = (now - this.state.anchorServerMs) / 1000;
    if (elapsed <= 0) return this.state;
    this.state = {
      ...this.state,
      positionSec: this.state.positionSec + elapsed,
      anchorServerMs: now,
    };
    // Persist so a DO eviction immediately after doesn't drop the freshened
    // anchor (the next late joiner would otherwise read the stale one).
    this.persist(SK.state, this.state);
    return this.state;
  }

  /** Pick a new host when the current one vanishes — longest-tenured
   *  helloed session wins (lowest joinedAt). */
  private electHost(): void {
    let next: Session | null = null;
    for (const s of this.sessions) {
      if (!s.helloed) continue;
      if (!next || s.joinedAt < next.joinedAt) next = s;
    }
    this.hostId = next ? next.peer.id : null;
  }

  private isHost(session: Session): boolean {
    return session.helloed && session.peer.id === this.hostId;
  }

  private rejectNonHost(session: Session) {
    this.send(session, { type: "ERROR", code: "NOT_HOST" });
  }

  /** Advance to the next queued item (or pause). Used both by an explicit
   *  QUEUE_NEXT from the host and as a hook for client-reported end-of-media. */
  private advanceQueue() {
    const next = this.queue.shift();
    if (next) {
      this.state = {
        media: next.media,
        playing: true,
        positionSec: 0,
        anchorServerMs: Date.now() + SCHEDULE_LEAD_MS,
      };
      this.broadcast({ type: "MEDIA", state: this.state });
      this.broadcast({ type: "QUEUE", queue: this.queue });
      this.persist(SK.state, this.state);
      this.persist(SK.queue, this.queue);
    } else if (this.state) {
      this.state = { ...this.state, playing: false, anchorServerMs: Date.now() };
      this.broadcast({ type: "MEDIA", state: this.state });
      this.persist(SK.state, this.state);
    }
  }

  private allowChat(peerId: string): boolean {
    const now = Date.now();
    const bucket = (this.chatBuckets.get(peerId) ?? []).filter(
      (t) => now - t < CHAT_WINDOW_MS
    );
    if (bucket.length >= CHAT_MAX_PER_WINDOW) {
      this.chatBuckets.set(peerId, bucket);
      return false;
    }
    bucket.push(now);
    this.chatBuckets.set(peerId, bucket);
    return true;
  }

  private onMessage(session: Session, raw: string) {
    const msg = parseClientMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case "HELLO": {
        session.peer = { id: session.peer.id, name: msg.name || "guest" };
        session.helloed = true;
        // First helloed peer becomes host.
        if (!this.hostId) this.hostId = session.peer.id;
        const peers = [...this.sessions]
          .filter((s) => s.helloed)
          .map((s) => s.peer);
        this.send(session, {
          type: "ROOM_STATE",
          selfId: session.peer.id,
          hostId: this.hostId,
          peers,
          state: this.freshenState(),
          queue: this.queue,
          chat: this.chat,
        });
        this.broadcast({ type: "PEER_JOINED", peer: session.peer }, session);
        // Tell everyone (including this peer if it became host) who's host.
        this.broadcast({ type: "HOST", hostId: this.hostId });
        break;
      }
      case "SET_MEDIA": {
        if (!this.isHost(session)) return this.rejectNonHost(session);
        this.state = {
          media: msg.media,
          playing: false,
          positionSec: 0,
          anchorServerMs: Date.now(),
        };
        this.broadcast({ type: "MEDIA", state: this.state });
        this.persist(SK.state, this.state);
        break;
      }
      case "PLAY": {
        if (!this.isHost(session)) return this.rejectNonHost(session);
        if (!this.state) return;
        this.state = {
          ...this.state,
          playing: true,
          positionSec: msg.positionSec,
          anchorServerMs: Date.now() + SCHEDULE_LEAD_MS,
        };
        this.broadcast({ type: "MEDIA", state: this.state });
        this.persist(SK.state, this.state);
        break;
      }
      case "PAUSE": {
        if (!this.isHost(session)) return this.rejectNonHost(session);
        if (!this.state) return;
        this.state = {
          ...this.state,
          playing: false,
          positionSec: msg.positionSec,
          anchorServerMs: Date.now(),
        };
        this.broadcast({ type: "MEDIA", state: this.state });
        this.persist(SK.state, this.state);
        break;
      }
      case "SEEK": {
        if (!this.isHost(session)) return this.rejectNonHost(session);
        if (!this.state) return;
        const lead = this.state.playing ? SCHEDULE_LEAD_MS : 0;
        this.state = {
          ...this.state,
          positionSec: msg.positionSec,
          anchorServerMs: Date.now() + lead,
        };
        this.broadcast({ type: "MEDIA", state: this.state });
        this.persist(SK.state, this.state);
        break;
      }
      case "QUEUE_ADD": {
        if (this.queue.length >= MAX_QUEUE) {
          this.send(session, {
            type: "ERROR",
            code: "BAD_INPUT",
            message: "Queue is full",
          });
          return;
        }
        const item: QueueItem = {
          id: crypto.randomUUID(),
          media: msg.media,
          addedBy: session.peer.id,
        };
        if (!this.state) {
          this.state = {
            media: item.media,
            playing: false,
            positionSec: 0,
            anchorServerMs: Date.now(),
          };
          this.broadcast({ type: "MEDIA", state: this.state });
          this.broadcast({ type: "QUEUE", queue: this.queue });
          this.persist(SK.state, this.state);
          return;
        }
        this.queue.push(item);
        this.broadcast({ type: "QUEUE", queue: this.queue });
        this.persist(SK.queue, this.queue);
        break;
      }
      case "QUEUE_ADD_MANY": {
        const room = Math.max(0, MAX_QUEUE - this.queue.length);
        const accepted = msg.items.slice(0, room);
        if (accepted.length === 0) return;
        const items: QueueItem[] = accepted.map((media) => ({
          id: crypto.randomUUID(),
          media,
          addedBy: session.peer.id,
        }));
        // If nothing is playing, promote the first item and queue the rest.
        if (!this.state) {
          const [first, ...rest] = items;
          this.state = {
            media: first.media,
            playing: false,
            positionSec: 0,
            anchorServerMs: Date.now(),
          };
          this.queue = [...this.queue, ...rest];
          this.broadcast({ type: "MEDIA", state: this.state });
          this.broadcast({ type: "QUEUE", queue: this.queue });
          this.persist(SK.state, this.state);
          this.persist(SK.queue, this.queue);
          return;
        }
        this.queue = [...this.queue, ...items];
        this.broadcast({ type: "QUEUE", queue: this.queue });
        this.persist(SK.queue, this.queue);
        break;
      }
      case "QUEUE_REMOVE": {
        // Host can prune anything; guests can only pull their own adds.
        const before = this.queue.length;
        this.queue = this.queue.filter((q) => {
          if (q.id !== msg.itemId) return true;
          if (this.isHost(session)) return false;
          return q.addedBy !== session.peer.id;
        });
        if (this.queue.length !== before) {
          this.broadcast({ type: "QUEUE", queue: this.queue });
          this.persist(SK.queue, this.queue);
        }
        break;
      }
      case "QUEUE_CLEAR": {
        if (!this.isHost(session)) return this.rejectNonHost(session);
        if (this.queue.length === 0) return;
        this.queue = [];
        this.broadcast({ type: "QUEUE", queue: this.queue });
        this.persist(SK.queue, this.queue);
        break;
      }
      case "QUEUE_NEXT": {
        if (!this.isHost(session)) return this.rejectNonHost(session);
        this.advanceQueue();
        break;
      }
      case "CHAT": {
        if (!session.helloed) return;
        if (!this.allowChat(session.peer.id)) {
          this.send(session, {
            type: "ERROR",
            code: "BAD_INPUT",
            message: "Slow down — too many messages.",
          });
          return;
        }
        const chatMsg: ChatMsg = {
          id: crypto.randomUUID(),
          from: session.peer.id,
          fromName: session.peer.name,
          text: msg.text,
          ts: Date.now(),
        };
        this.chat.push(chatMsg);
        if (this.chat.length > MAX_CHAT_HISTORY) {
          this.chat = this.chat.slice(-MAX_CHAT_HISTORY);
        }
        this.broadcast({ type: "CHAT", msg: chatMsg });
        this.persist(SK.chat, this.chat);
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
    const wasHost = this.isHost(session);
    this.sessions.delete(session);
    this.chatBuckets.delete(session.peer.id);
    if (session.helloed) {
      this.broadcast({ type: "PEER_LEFT", peerId: session.peer.id });
    }
    if (wasHost) {
      this.electHost();
      this.broadcast({ type: "HOST", hostId: this.hostId });
    }
  }
}

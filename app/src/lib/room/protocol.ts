/**
 * Wire protocol between the room WebSocket client and the RoomDO.
 *
 * Two principles:
 *   - All messages are Zod-validated on receipt. Drop garbage at the boundary.
 *   - Three categories: ClientMsg (client→server), Broadcast (server→all
 *     clients in room), Unicast (server→single client).
 *
 * Audio sync and YouTube watch-along both layer on top of this same socket;
 * the message types here are the minimum for presence + future playback.
 */

import { z } from "zod";

/* ── Common shapes ─────────────────────────────────────────────── */

export const ClientIdSchema = z.string().uuid();
export const UsernameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_\- ]+$/);

export const ClientInfoSchema = z.object({
  id: ClientIdSchema,
  username: UsernameSchema,
  isAdmin: z.boolean().default(false),
});
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

/* ── Client → server messages ──────────────────────────────────── */

export const ClientMsgSchema = z.discriminatedUnion("type", [
  // Sent immediately after the socket opens so the DO knows who we are.
  z.object({
    type: z.literal("HELLO"),
    clientId: ClientIdSchema,
    username: UsernameSchema,
  }),

  // NTP-style time-sync probe. Server stamps t1/t2 and unicasts back.
  z.object({
    type: z.literal("NTP_REQUEST"),
    t0: z.number().int().nonnegative(),
  }),

  // Lightweight chat (single text line). Kept here so audio + chat share a socket.
  z.object({
    type: z.literal("CHAT"),
    text: z.string().min(1).max(500),
  }),

  // Heartbeat — clients can ping if they want sub-30s liveness updates.
  z.object({ type: z.literal("PING") }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

/* ── Server → client messages ──────────────────────────────────── */

const BaseServer = {
  /** monotonically increasing per-room message id (server-assigned) */
  seq: z.number().int().nonnegative(),
} as const;

export const BroadcastSchema = z.discriminatedUnion("type", [
  z.object({
    ...BaseServer,
    type: z.literal("ROOM_STATE"),
    code: z.string(),
    clients: z.array(ClientInfoSchema),
  }),
  z.object({
    ...BaseServer,
    type: z.literal("CLIENT_JOINED"),
    client: ClientInfoSchema,
  }),
  z.object({
    ...BaseServer,
    type: z.literal("CLIENT_LEFT"),
    clientId: ClientIdSchema,
  }),
  z.object({
    ...BaseServer,
    type: z.literal("CHAT"),
    from: ClientInfoSchema,
    text: z.string(),
    at: z.number().int().nonnegative(),
  }),
]);
export type Broadcast = z.infer<typeof BroadcastSchema>;

export const UnicastSchema = z.discriminatedUnion("type", [
  z.object({
    ...BaseServer,
    type: z.literal("NTP_RESPONSE"),
    t0: z.number().int().nonnegative(),
    t1: z.number().int().nonnegative(),
    t2: z.number().int().nonnegative(),
  }),
  z.object({
    ...BaseServer,
    type: z.literal("ERROR"),
    error: z.string(),
  }),
  z.object({
    ...BaseServer,
    type: z.literal("PONG"),
    at: z.number().int().nonnegative(),
  }),
]);
export type Unicast = z.infer<typeof UnicastSchema>;

export type ServerMsg = Broadcast | Unicast;

/* ── Helpers ───────────────────────────────────────────────────── */

export function parseClientMsg(raw: string): ClientMsg | null {
  try {
    const parsed = JSON.parse(raw);
    const result = ClientMsgSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function encode(msg: ServerMsg): string {
  return JSON.stringify(msg);
}

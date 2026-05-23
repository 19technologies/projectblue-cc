"use client";

/**
 * Client-only loader for the Room.
 *
 * `next/dynamic({ ssr: false })` keeps the 600+ line Room component out of
 * the server render path entirely. Combined with the redirect-based beta
 * gate in next.config.ts, the Worker's CPU budget for /room/<code> drops
 * to a near-static page emit — the cure for Error 1102.
 */

import dynamic from "next/dynamic";

const Room = dynamic(() => import("./Room").then((m) => m.Room), {
  ssr: false,
  loading: () => (
    <div className="pb-welcome pb-room">
      <div className="pb-topbar" aria-hidden />
      <main className="pb-welcome-main pb-room-main pb-room-booting">
        <p className="pb-room-empty-sub">Loading room…</p>
      </main>
    </div>
  ),
});

export default function RoomShell({ code }: { code: string }) {
  return <Room code={code} />;
}

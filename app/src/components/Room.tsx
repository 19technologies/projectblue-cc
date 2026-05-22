"use client";

import { WordMark } from "@/components/BrandMark";
import {
  extractVideoId,
  loadYouTubeAPI,
  YT_PAUSED,
  YT_PLAYING,
  type YTPlayer,
} from "@/lib/youtube";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const ROOMS_WS =
  process.env.NEXT_PUBLIC_ROOMS_WS ?? "wss://rooms.projectblue.cc";

/* Wire types — mirror rooms/src/protocol.ts */
interface VideoState {
  videoId: string;
  playing: boolean;
  positionSec: number;
  anchorServerMs: number;
}
interface Peer {
  id: string;
  name: string;
}
type ServerMessage =
  | { type: "ROOM_STATE"; selfId: string; peers: Peer[]; video: VideoState | null }
  | { type: "PEER_JOINED"; peer: Peer }
  | { type: "PEER_LEFT"; peerId: string }
  | { type: "PLAYBACK"; video: VideoState }
  | { type: "PONG"; t0: number; serverMs: number };

const GUEST_ADJ = ["calm", "swift", "warm", "keen", "bright", "quiet", "bold"];
const GUEST_NOUN = ["otter", "heron", "lynx", "wren", "fox", "moth", "ibex"];
const guestName = () =>
  `${GUEST_ADJ[Math.floor(Math.random() * GUEST_ADJ.length)]}-${
    GUEST_NOUN[Math.floor(Math.random() * GUEST_NOUN.length)]
  }`;

export const Room = ({ code }: { code: string }) => {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [video, setVideo] = useState<VideoState | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [name] = useState(guestName);

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const playerReady = useRef(false);
  const clockOffset = useRef(0); // serverNow ≈ Date.now() + clockOffset
  const applyingRemote = useRef(false);
  const currentVideoId = useRef<string | null>(null);
  const pendingVideo = useRef<VideoState | null>(null);
  const videoRef = useRef<VideoState | null>(null);

  const send = (msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  /* ── Drive the local player to match an authoritative VideoState ─── */
  const applyPlayback = (v: VideoState) => {
    videoRef.current = v;
    setVideo(v);
    const player = playerRef.current;
    if (!player || !playerReady.current) {
      pendingVideo.current = v;
      return;
    }
    const serverNow = Date.now() + clockOffset.current;
    const target = v.playing
      ? v.positionSec + (serverNow - v.anchorServerMs) / 1000
      : v.positionSec;

    applyingRemote.current = true;
    if (currentVideoId.current !== v.videoId) {
      currentVideoId.current = v.videoId;
      player.loadVideoById({ videoId: v.videoId, startSeconds: Math.max(0, target) });
      if (!v.playing) window.setTimeout(() => player.pauseVideo(), 400);
    } else {
      const drift = Math.abs(player.getCurrentTime() - target);
      if (drift > 1.5) player.seekTo(Math.max(0, target), true);
      if (v.playing && player.getPlayerState() !== YT_PLAYING) player.playVideo();
      if (!v.playing && player.getPlayerState() === YT_PLAYING) player.pauseVideo();
    }
    window.setTimeout(() => {
      applyingRemote.current = false;
    }, 700);
  };

  /* ── WebSocket lifecycle ─────────────────────────────────────────── */
  useEffect(() => {
    const ws = new WebSocket(`${ROOMS_WS}/room/${code}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      send({ type: "HELLO", clientId: crypto.randomUUID(), name });
      send({ type: "PING", t0: Date.now() });
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "ROOM_STATE":
          setPeers(msg.peers);
          if (msg.video) applyPlayback(msg.video);
          break;
        case "PEER_JOINED":
          setPeers((p) => [...p.filter((x) => x.id !== msg.peer.id), msg.peer]);
          break;
        case "PEER_LEFT":
          setPeers((p) => p.filter((x) => x.id !== msg.peerId));
          break;
        case "PLAYBACK":
          applyPlayback(msg.video);
          break;
        case "PONG": {
          const t3 = Date.now();
          clockOffset.current = msg.serverMs - (msg.t0 + t3) / 2;
          break;
        }
      }
    };

    const ping = window.setInterval(
      () => send({ type: "PING", t0: Date.now() }),
      5000
    );
    // Drift correction — nudge the playhead back if it strays from the anchor.
    const drift = window.setInterval(() => {
      const v = videoRef.current;
      const player = playerRef.current;
      if (!v || !v.playing || !player || !playerReady.current) return;
      if (applyingRemote.current) return;
      const serverNow = Date.now() + clockOffset.current;
      const target = v.positionSec + (serverNow - v.anchorServerMs) / 1000;
      if (Math.abs(player.getCurrentTime() - target) > 1.5) {
        applyingRemote.current = true;
        player.seekTo(Math.max(0, target), true);
        window.setTimeout(() => {
          applyingRemote.current = false;
        }, 700);
      }
    }, 1000);

    return () => {
      window.clearInterval(ping);
      window.clearInterval(drift);
      ws.close();
    };
  }, [code, name]);

  /* ── YouTube player ──────────────────────────────────────────────── */
  useEffect(() => {
    let destroyed = false;
    loadYouTubeAPI()
      .then((YT) => {
        if (destroyed) return;
        const player = new YT.Player("pb-yt-player", {
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => {
              playerReady.current = true;
              if (pendingVideo.current) {
                applyPlayback(pendingVideo.current);
                pendingVideo.current = null;
              }
            },
            onStateChange: (e) => {
              if (applyingRemote.current) return;
              const player = playerRef.current;
              if (!player) return;
              const pos = player.getCurrentTime();
              if (e.data === YT_PLAYING) send({ type: "PLAY", positionSec: pos });
              else if (e.data === YT_PAUSED) send({ type: "PAUSE", positionSec: pos });
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => toast.error("Couldn't load the YouTube player."));

    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      playerReady.current = false;
    };
  }, []);

  const onSetVideo = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractVideoId(urlInput);
    if (!id) {
      toast.error("Paste a YouTube link or 11-character video ID.");
      return;
    }
    send({ type: "SET_VIDEO", videoId: id });
    setUrlInput("");
  };

  const onCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Room code copied.");
    } catch {
      toast.error("Copy failed — copy it manually.");
    }
  };

  return (
    <div className="pb-welcome pb-room">
      <div className="pb-topbar" aria-hidden />
      <header className="pb-welcome-header">
        <WordMark asLink />
        <div className="pb-room-meta">
          <button type="button" onClick={onCopyCode} className="pb-room-code" title="Copy">
            {code}
          </button>
          <span className={`pb-room-dot ${connected ? "is-live" : ""}`} aria-hidden />
          <span className="pb-room-status">
            {connected ? `${peers.length || 1} here` : "connecting…"}
          </span>
        </div>
      </header>

      <main id="main" className="pb-welcome-main pb-room-main">
        <div className="pb-yt-frame">
          <div id="pb-yt-player" className="pb-yt-player" />
          {!video && (
            <div className="pb-yt-empty">
              <p>No video yet. Paste a YouTube link to start.</p>
            </div>
          )}
        </div>

        <form onSubmit={onSetVideo} className="pb-room-form">
          <label className="pb-action-label" htmlFor="yt-url">
            {video ? "Change video" : "Set a video"}
          </label>
          <div className="pb-room-form-row">
            <input
              id="yt-url"
              type="text"
              className="pb-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
            />
            <button type="submit" className="pb-action-btn">
              Load
            </button>
          </div>
          <p className="pb-room-hint">
            Play, pause and seek stay in sync for everyone in the room. Share
            the code <strong>{code}</strong> to bring people in.
          </p>
        </form>

        {peers.length > 0 && (
          <p className="pb-room-peers">
            In the room:{" "}
            {peers.map((p) => p.name).join(", ")}
          </p>
        )}
      </main>
    </div>
  );
};

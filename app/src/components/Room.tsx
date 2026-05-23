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
type Media =
  | { kind: "youtube"; videoId: string }
  | { kind: "audio"; url: string; title?: string };

interface MediaState {
  media: Media;
  playing: boolean;
  positionSec: number;
  anchorServerMs: number;
}
interface Peer {
  id: string;
  name: string;
}
type ServerMessage =
  | { type: "ROOM_STATE"; selfId: string; peers: Peer[]; state: MediaState | null }
  | { type: "PEER_JOINED"; peer: Peer }
  | { type: "PEER_LEFT"; peerId: string }
  | { type: "MEDIA"; state: MediaState }
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
  const [state, setState] = useState<MediaState | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [showYtForm, setShowYtForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [name] = useState(guestName);

  const wsRef = useRef<WebSocket | null>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const ytReady = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef<MediaState | null>(null);
  const clockOffset = useRef(0); // serverNow ≈ Date.now() + clockOffset
  const applyingRemote = useRef(false);
  const lastMediaKey = useRef<string | null>(null);

  const send = (msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const serverNow = () => Date.now() + clockOffset.current;
  const targetPosition = (s: MediaState): number =>
    s.playing ? s.positionSec + (serverNow() - s.anchorServerMs) / 1000 : s.positionSec;

  /* ── Drive the local player to match an authoritative MediaState ─── */
  const applyState = (s: MediaState) => {
    stateRef.current = s;
    setState(s);
    const target = Math.max(0, targetPosition(s));
    const mediaKey = `${s.media.kind}:${
      s.media.kind === "youtube" ? s.media.videoId : s.media.url
    }`;
    const mediaChanged = lastMediaKey.current !== mediaKey;
    lastMediaKey.current = mediaKey;

    applyingRemote.current = true;
    if (s.media.kind === "youtube") {
      const player = ytRef.current;
      if (!player || !ytReady.current) {
        // The YT useEffect drains this once the player is ready.
        window.setTimeout(() => {
          applyingRemote.current = false;
        }, 600);
        return;
      }
      if (mediaChanged) {
        player.loadVideoById({ videoId: s.media.videoId, startSeconds: target });
        if (!s.playing) window.setTimeout(() => player.pauseVideo(), 400);
      } else {
        if (Math.abs(player.getCurrentTime() - target) > 1.5) {
          player.seekTo(target, true);
        }
        if (s.playing && player.getPlayerState() !== YT_PLAYING) player.playVideo();
        if (!s.playing && player.getPlayerState() === YT_PLAYING) player.pauseVideo();
      }
    } else {
      const audio = audioRef.current;
      if (!audio) {
        window.setTimeout(() => {
          applyingRemote.current = false;
        }, 600);
        return;
      }
      if (mediaChanged) {
        audio.src = s.media.url;
        audio.currentTime = target;
      } else if (Math.abs(audio.currentTime - target) > 1.5) {
        audio.currentTime = target;
      }
      if (s.playing) {
        audio.play().catch(() => setAutoplayBlocked(true));
      } else {
        audio.pause();
      }
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
          if (msg.state) applyState(msg.state);
          break;
        case "PEER_JOINED":
          setPeers((p) => [...p.filter((x) => x.id !== msg.peer.id), msg.peer]);
          break;
        case "PEER_LEFT":
          setPeers((p) => p.filter((x) => x.id !== msg.peerId));
          break;
        case "MEDIA":
          applyState(msg.state);
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
    // Drift correction — nudge the playhead back if it strays.
    const drift = window.setInterval(() => {
      const s = stateRef.current;
      if (!s || !s.playing || applyingRemote.current) return;
      const target = targetPosition(s);
      if (s.media.kind === "youtube") {
        const p = ytRef.current;
        if (!p || !ytReady.current) return;
        if (Math.abs(p.getCurrentTime() - target) > 1.5) {
          applyingRemote.current = true;
          p.seekTo(Math.max(0, target), true);
          window.setTimeout(() => {
            applyingRemote.current = false;
          }, 700);
        }
      } else {
        const a = audioRef.current;
        if (!a) return;
        if (Math.abs(a.currentTime - target) > 1.5) {
          applyingRemote.current = true;
          a.currentTime = Math.max(0, target);
          window.setTimeout(() => {
            applyingRemote.current = false;
          }, 700);
        }
      }
    }, 1000);

    return () => {
      window.clearInterval(ping);
      window.clearInterval(drift);
      ws.close();
    };
  }, [code, name]);

  /* ── YouTube IFrame player ───────────────────────────────────────── */
  useEffect(() => {
    let destroyed = false;
    loadYouTubeAPI()
      .then((YT) => {
        if (destroyed) return;
        const player = new YT.Player("pb-yt-player", {
          // Explicit "100%" so the iframe fills the .pb-yt-frame container.
          // (Without these, YT defaults to 640x390 and looks broken.)
          ...({ width: "100%", height: "100%" } as Record<string, string>),
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => {
              ytReady.current = true;
              // Drain pending state if the room set a YT video before ready.
              const s = stateRef.current;
              if (s && s.media.kind === "youtube") applyState(s);
            },
            onStateChange: (e) => {
              if (applyingRemote.current) return;
              const p = ytRef.current;
              if (!p) return;
              const pos = p.getCurrentTime();
              if (e.data === YT_PLAYING) send({ type: "PLAY", positionSec: pos });
              else if (e.data === YT_PAUSED) send({ type: "PAUSE", positionSec: pos });
            },
          },
        });
        ytRef.current = player;
      })
      .catch(() => toast.error("Couldn't load the YouTube player."));

    return () => {
      destroyed = true;
      ytRef.current?.destroy();
      ytRef.current = null;
      ytReady.current = false;
    };
  }, []);

  /* ── Audio element handlers ──────────────────────────────────────── */
  const onAudioPlay = () => {
    if (applyingRemote.current) return;
    const a = audioRef.current;
    if (!a) return;
    setAutoplayBlocked(false);
    send({ type: "PLAY", positionSec: a.currentTime });
  };
  const onAudioPause = () => {
    if (applyingRemote.current) return;
    const a = audioRef.current;
    if (!a) return;
    send({ type: "PAUSE", positionSec: a.currentTime });
  };
  const onAudioSeeked = () => {
    if (applyingRemote.current) return;
    const a = audioRef.current;
    if (!a) return;
    send({ type: "SEEK", positionSec: a.currentTime });
  };

  /* ── Upload + URL actions ────────────────────────────────────────── */
  const onUploadFile = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/upload/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          base64,
          title: file.name,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Upload failed.");
        return;
      }
      const { url, title } = (await res.json()) as { url: string; title: string };
      send({ type: "SET_MEDIA", media: { kind: "audio", url, title } });
      toast.success(`Loaded "${title}"`);
    } finally {
      setUploading(false);
    }
  };

  const onSetYouTube = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractVideoId(ytUrl);
    if (!id) {
      toast.error("Paste a YouTube link or 11-character video ID.");
      return;
    }
    send({ type: "SET_MEDIA", media: { kind: "youtube", videoId: id } });
    setYtUrl("");
    setShowYtForm(false);
  };

  const onResyncTap = () => {
    setAutoplayBlocked(false);
    const s = stateRef.current;
    if (s) applyState(s);
  };

  const onCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Room code copied.");
    } catch {
      toast.error("Copy failed — copy it manually.");
    }
  };

  const isYouTube = state?.media.kind === "youtube";
  const isAudio = state?.media.kind === "audio";

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
        {/* YouTube frame — present but hidden when the media isn't YT.
            The YT.Player needs to mount its iframe on a real element on
            first render, so we keep the container in the tree always. */}
        <div className="pb-yt-frame" style={{ display: isYouTube ? "block" : "none" }}>
          <div id="pb-yt-player" className="pb-yt-player" />
        </div>

        {/* Audio player */}
        {isAudio && state?.media.kind === "audio" && (
          <div className="pb-audio-frame">
            <p className="pb-audio-title">{state.media.title ?? "Now playing"}</p>
            <audio
              ref={audioRef}
              controls
              preload="auto"
              onPlay={onAudioPlay}
              onPause={onAudioPause}
              onSeeked={onAudioSeeked}
              className="pb-audio-element"
            />
          </div>
        )}

        {/* Empty state — show both load options */}
        {!state && (
          <div className="pb-room-empty">
            <p className="pb-room-empty-title">Nothing playing yet.</p>
            <p className="pb-room-empty-sub">
              Load music from your device, or paste a YouTube link.
            </p>
          </div>
        )}

        {autoplayBlocked && (
          <button type="button" onClick={onResyncTap} className="pb-action-btn pb-action-btn-secondary" style={{ marginBottom: "1.5rem" }}>
            Tap to start playback (browser blocked autoplay)
          </button>
        )}

        {/* Load controls — always available so you can swap mid-room */}
        <section className="pb-room-controls">
          <p className="pb-action-label" style={{ marginBottom: "1rem" }}>
            {state ? "Change media" : "What are we listening to?"}
          </p>
          <div className="pb-room-actions">
            <label className="pb-action-btn" style={{ cursor: uploading ? "progress" : "pointer" }}>
              {uploading ? "Uploading…" : "Upload music"}
              <input
                type="file"
                accept="audio/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUploadFile(f);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
            <button
              type="button"
              onClick={() => setShowYtForm((v) => !v)}
              className="pb-action-btn pb-action-btn-secondary"
            >
              {showYtForm ? "Cancel" : "Add YouTube link"}
            </button>
          </div>
          {showYtForm && (
            <form onSubmit={onSetYouTube} className="pb-room-form" style={{ marginTop: "1rem" }}>
              <div className="pb-room-form-row">
                <input
                  type="text"
                  className="pb-input"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=…"
                  autoFocus
                />
                <button type="submit" className="pb-action-btn">Load</button>
              </div>
            </form>
          )}
          <p className="pb-room-hint">
            Play, pause and seek stay in sync. Share <strong>{code}</strong> to
            bring people in. Audio uploads are capped at 15&nbsp;MB.
          </p>
        </section>

        {peers.length > 0 && (
          <p className="pb-room-peers">
            In the room: {peers.map((p) => p.name).join(", ")}
          </p>
        )}
      </main>
    </div>
  );
};

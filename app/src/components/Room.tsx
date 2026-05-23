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

const formatTime = (sec: number) => {
  const s = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

export const Room = ({ code }: { code: string }) => {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [state, setState] = useState<MediaState | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [showYtForm, setShowYtForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioPosition, setAudioPosition] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [name] = useState(guestName);

  const wsRef = useRef<WebSocket | null>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const ytReady = useRef(false);

  /* Web Audio — sample-accurate scheduled playback */
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const bufferUrlRef = useRef<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ctxStartedAtRef = useRef(0); // audioContext.currentTime when current source started
  const offsetAtStartRef = useRef(0); // buffer offset (sec) at that start

  const stateRef = useRef<MediaState | null>(null);
  /* NTP-style clock sync — many samples, lowest-RTT quartile, median */
  const clockOffsetRef = useRef(0);
  const clockSamplesRef = useRef<{ offset: number; rtt: number }[]>([]);

  const applyingRemote = useRef(false);
  const lastMediaKey = useRef<string | null>(null);

  const send = (msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const serverNow = () => Date.now() + clockOffsetRef.current;
  const targetPosition = (s: MediaState): number =>
    s.playing
      ? s.positionSec + Math.max(0, (serverNow() - s.anchorServerMs) / 1000)
      : s.positionSec;

  /* ── Web Audio plumbing ───────────────────────────────────────────── */

  const ensureAudioCtx = (): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current;
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    gainRef.current = gain;
    return ctx;
  };

  const stopSource = () => {
    const src = sourceRef.current;
    if (src) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
      sourceRef.current = null;
    }
  };

  /** Live playhead while the buffer source is running. */
  const audioPlayheadNow = (): number => {
    const ctx = audioCtxRef.current;
    const src = sourceRef.current;
    const buf = bufferRef.current;
    if (!ctx || !src || !buf) return stateRef.current?.positionSec ?? 0;
    return Math.min(
      buf.duration,
      Math.max(0, offsetAtStartRef.current + (ctx.currentTime - ctxStartedAtRef.current))
    );
  };

  /** Schedule the decoded buffer to match `s`. */
  const scheduleAudio = (s: MediaState) => {
    if (s.media.kind !== "audio") return;
    const ctx = audioCtxRef.current;
    const gain = gainRef.current;
    const buf = bufferRef.current;
    if (!ctx || !gain || !buf) return;
    stopSource();
    if (!s.playing) return;

    // localStartMs = local Date.now() at which the audio should be at positionSec.
    const localStartMs = s.anchorServerMs - clockOffsetRef.current;
    const delayMs = localStartMs - Date.now();

    let when: number;
    let offset: number;
    if (delayMs >= 0) {
      when = ctx.currentTime + delayMs / 1000;
      offset = s.positionSec;
    } else {
      when = ctx.currentTime;
      offset = s.positionSec + -delayMs / 1000;
    }
    if (offset >= buf.duration) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    try {
      src.start(when, Math.max(0, offset));
    } catch {
      setAutoplayBlocked(true);
      return;
    }
    sourceRef.current = src;
    ctxStartedAtRef.current = when;
    offsetAtStartRef.current = offset;

    if (ctx.state === "suspended") {
      setAutoplayBlocked(true);
      void ctx.resume().then(() => {
        if (ctx.state === "running") setAutoplayBlocked(false);
      });
    } else {
      setAutoplayBlocked(false);
    }
  };

  const decodeAudio = async (url: string) => {
    setAudioReady(false);
    setAudioDuration(0);
    setAudioPosition(0);
    bufferRef.current = null;
    bufferUrlRef.current = url;
    stopSource();
    const ctx = ensureAudioCtx();
    if (!ctx) {
      toast.error("Web Audio isn't supported in this browser.");
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const bytes = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes);
      // Bail if a newer media took over while we were decoding.
      if (bufferUrlRef.current !== url) return;
      bufferRef.current = decoded;
      setAudioDuration(decoded.duration);
      setAudioReady(true);
      const s = stateRef.current;
      if (s && s.media.kind === "audio" && s.media.url === url) scheduleAudio(s);
    } catch {
      toast.error("Couldn't load that audio file.");
    }
  };

  /* ── Apply authoritative state ────────────────────────────────────── */

  const applyState = (s: MediaState) => {
    stateRef.current = s;
    setState(s);
    const mediaKey = `${s.media.kind}:${
      s.media.kind === "youtube" ? s.media.videoId : s.media.url
    }`;
    const mediaChanged = lastMediaKey.current !== mediaKey;
    lastMediaKey.current = mediaKey;

    applyingRemote.current = true;
    if (s.media.kind === "youtube") {
      // Swapped from audio → YT — tear the audio source down.
      stopSource();
      bufferRef.current = null;
      bufferUrlRef.current = null;
      setAudioReady(false);

      const target = Math.max(0, targetPosition(s));
      const player = ytRef.current;
      if (!player || !ytReady.current) {
        // YT useEffect drains this once ready.
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
      if (mediaChanged || bufferUrlRef.current !== s.media.url) {
        void decodeAudio(s.media.url);
      } else {
        scheduleAudio(s);
      }
    }
    window.setTimeout(() => {
      applyingRemote.current = false;
    }, 700);
  };

  /* ── WebSocket lifecycle + NTP burst ──────────────────────────────── */
  useEffect(() => {
    const ws = new WebSocket(`${ROOMS_WS}/room/${code}`);
    wsRef.current = ws;

    const sendPing = () => send({ type: "PING", t0: Date.now() });
    const burstTimers: number[] = [];

    ws.onopen = () => {
      setConnected(true);
      send({ type: "HELLO", clientId: crypto.randomUUID(), name });
      // Burst: 8 pings @ 100ms — settles clockOffset to ~5ms before any PLAY.
      for (let i = 0; i < 8; i++) {
        burstTimers.push(window.setTimeout(sendPing, i * 100));
      }
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
          const rtt = Math.max(1, t3 - msg.t0);
          const offset = msg.serverMs - (msg.t0 + t3) / 2;
          const samples = clockSamplesRef.current;
          samples.push({ offset, rtt });
          if (samples.length > 50) samples.shift();
          // Lowest-RTT quartile, then median — beatsync-style robust estimator.
          const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
          const take = Math.max(1, Math.ceil(sorted.length / 4));
          const best = sorted
            .slice(0, take)
            .map((x) => x.offset)
            .sort((a, b) => a - b);
          clockOffsetRef.current = best[Math.floor(best.length / 2)];
          break;
        }
      }
    };

    const ping = window.setInterval(sendPing, 3000);

    return () => {
      burstTimers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(ping);
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, name]);

  /* ── YouTube IFrame player ───────────────────────────────────────── */
  useEffect(() => {
    let destroyed = false;
    loadYouTubeAPI()
      .then((YT) => {
        if (destroyed) return;
        const player = new YT.Player("pb-yt-player", {
          ...({ width: "100%", height: "100%" } as Record<string, string>),
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            // Origin avoids the "blocked: api.youtube.com sandbox" error.
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              ytReady.current = true;
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
            onError: (e) => {
              // 2 = invalid id, 5 = HTML5 player error, 100 = removed/private,
              // 101 / 150 = embedding disabled by the uploader.
              const map: Record<number, string> = {
                2: "Invalid YouTube ID.",
                5: "YouTube can't play that here.",
                100: "Video is private or removed.",
                101: "The uploader doesn't allow embedded playback.",
                150: "The uploader doesn't allow embedded playback.",
              };
              toast.error(map[e.data] ?? "YouTube playback error.");
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

  /* ── Position tick (for the seek-bar) ─────────────────────────────── */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = stateRef.current;
      if (s?.media.kind === "audio" && !scrubbing) {
        if (s.playing && sourceRef.current) {
          setAudioPosition(audioPlayheadNow());
        } else {
          setAudioPosition(s.positionSec);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrubbing]);

  /* ── YouTube drift correction (audio is sample-accurate via Web Audio) */
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (!s || !s.playing || applyingRemote.current) return;
      if (s.media.kind !== "youtube") return;
      const p = ytRef.current;
      if (!p || !ytReady.current) return;
      const target = targetPosition(s);
      if (Math.abs(p.getCurrentTime() - target) > 1.5) {
        applyingRemote.current = true;
        p.seekTo(Math.max(0, target), true);
        window.setTimeout(() => {
          applyingRemote.current = false;
        }, 700);
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Audio control buttons ────────────────────────────────────────── */
  const onAudioPlay = () => {
    const ctx = audioCtxRef.current;
    if (ctx?.state === "suspended") void ctx.resume();
    const pos = stateRef.current?.positionSec ?? 0;
    send({ type: "PLAY", positionSec: pos });
  };
  const onAudioPause = () => {
    const pos = audioPlayheadNow();
    send({ type: "PAUSE", positionSec: pos });
  };
  const onAudioSeekCommit = (pos: number) => {
    setScrubbing(false);
    send({ type: "SEEK", positionSec: pos });
  };

  /* ── Upload + YT URL handlers ─────────────────────────────────────── */
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
      // Prime AudioContext on this user gesture so playback isn't blocked.
      ensureAudioCtx();
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
    const ctx = audioCtxRef.current;
    if (ctx?.state === "suspended") void ctx.resume();
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
        {/* YT frame — always mounted so YT.Player has a stable target. */}
        <div className="pb-yt-frame" style={{ display: isYouTube ? "block" : "none" }}>
          <div id="pb-yt-player" className="pb-yt-player" />
        </div>

        {isAudio && state?.media.kind === "audio" && (
          <div className="pb-audio-frame">
            <p className="pb-audio-title">{state.media.title ?? "Now playing"}</p>
            {!audioReady ? (
              <p className="pb-audio-loading">Loading…</p>
            ) : (
              <div className="pb-audio-player">
                <button
                  type="button"
                  className="pb-audio-btn"
                  onClick={state.playing ? onAudioPause : onAudioPlay}
                  aria-label={state.playing ? "Pause" : "Play"}
                >
                  {state.playing ? "❚❚" : "▶"}
                </button>
                <span className="pb-audio-time">{formatTime(audioPosition)}</span>
                <input
                  type="range"
                  className="pb-audio-seek"
                  min={0}
                  max={Math.max(audioDuration, 0.1)}
                  step={0.1}
                  value={Math.min(audioPosition, audioDuration)}
                  onChange={(e) => {
                    setScrubbing(true);
                    setAudioPosition(Number(e.target.value));
                  }}
                  onMouseUp={(e) =>
                    onAudioSeekCommit(Number((e.target as HTMLInputElement).value))
                  }
                  onTouchEnd={(e) =>
                    onAudioSeekCommit(Number((e.target as HTMLInputElement).value))
                  }
                  onKeyUp={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      onAudioSeekCommit(Number((e.target as HTMLInputElement).value));
                    }
                  }}
                />
                <span className="pb-audio-time">{formatTime(audioDuration)}</span>
              </div>
            )}
          </div>
        )}

        {!state && (
          <div className="pb-room-empty">
            <p className="pb-room-empty-title">Nothing playing yet.</p>
            <p className="pb-room-empty-sub">
              Load music from your device, or paste a YouTube link.
            </p>
          </div>
        )}

        {autoplayBlocked && (
          <button
            type="button"
            onClick={onResyncTap}
            className="pb-action-btn pb-action-btn-secondary"
            style={{ marginBottom: "1.5rem" }}
          >
            Tap to start playback
          </button>
        )}

        <section className="pb-room-controls">
          <p className="pb-action-label" style={{ marginBottom: "1rem" }}>
            {state ? "Change media" : "What are we listening to?"}
          </p>
          <div className="pb-room-actions">
            <label
              className="pb-action-btn"
              style={{ cursor: uploading ? "progress" : "pointer" }}
            >
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
                <button type="submit" className="pb-action-btn">
                  Load
                </button>
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

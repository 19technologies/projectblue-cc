"use client";

import { WordMark } from "@/components/BrandMark";
import {
  extractVideoId,
  loadYouTubeAPI,
  YT_ENDED,
  YT_PAUSED,
  YT_PLAYING,
  type YTPlayer,
} from "@/lib/youtube";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
interface QueueItem {
  id: string;
  media: Media;
  addedBy: string;
}
interface ChatMsg {
  id: string;
  from: string;
  fromName: string;
  text: string;
  ts: number;
}
interface Peer {
  id: string;
  name: string;
}
type ServerMessage =
  | {
      type: "ROOM_STATE";
      selfId: string;
      hostId: string | null;
      peers: Peer[];
      state: MediaState | null;
      queue: QueueItem[];
      chat: ChatMsg[];
    }
  | { type: "PEER_JOINED"; peer: Peer }
  | { type: "PEER_LEFT"; peerId: string }
  | { type: "HOST"; hostId: string | null }
  | { type: "MEDIA"; state: MediaState }
  | { type: "QUEUE"; queue: QueueItem[] }
  | { type: "CHAT"; msg: ChatMsg }
  | { type: "PONG"; t0: number; serverMs: number }
  | { type: "ERROR"; code: "NOT_HOST" | "BAD_INPUT"; message?: string };

const GUEST_ADJ = ["calm", "swift", "warm", "keen", "bright", "quiet", "bold"];
const GUEST_NOUN = ["otter", "heron", "lynx", "wren", "fox", "moth", "ibex"];
const generateName = () =>
  `${GUEST_ADJ[Math.floor(Math.random() * GUEST_ADJ.length)]}-${
    GUEST_NOUN[Math.floor(Math.random() * GUEST_NOUN.length)]
  }`;

const formatTime = (sec: number) => {
  const s = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

const formatChatTime = (ts: number): string => {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
};

/** Desktop breakpoint — at/above this width we split into media + sidebar. */
const DESKTOP_MIN_PX = 900;

const useIsDesktop = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_PX}px)`);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isDesktop;
};

const mediaLabel = (m: Media): string =>
  m.kind === "youtube" ? `YouTube · ${m.videoId}` : (m.title ?? "Uploaded audio");

const mediaKey = (m: Media): string =>
  m.kind === "youtube" ? `youtube:${m.videoId}` : `audio:${m.url}`;

const AUDIO_EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  webm: "audio/webm",
};
const guessAudioType = (filename: string): string => {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return AUDIO_EXT_MIME[ext] ?? "";
};
const isLikelyAudio = (f: File): boolean => {
  if (f.type.startsWith("audio/")) return true;
  return guessAudioType(f.name) !== "";
};

/** Upload a single file → returns the queueable Media descriptor. Throws on failure. */
async function uploadAudioFile(file: File): Promise<{ url: string; title: string }> {
  const guessed = file.type || guessAudioType(file.name);
  const res = await fetch("/api/upload/audio", {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": guessed || "application/octet-stream",
      "X-Filename": encodeURIComponent(file.name),
    },
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error || `HTTP ${res.status}`);
  }
  return (await res.json()) as { url: string; title: string };
}

export const Room = ({ code }: { code: string }) => {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [state, setState] = useState<MediaState | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [selfId, setSelfId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [showYtForm, setShowYtForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioPosition, setAudioPosition] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [mobileTab, setMobileTab] = useState<"queue" | "chat" | "people">("queue");
  // Lazy init so we don't trigger a second render just to read localStorage.
  const [volume, setVolume] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    try {
      const v = Number(localStorage.getItem("pb-volume"));
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
    } catch {
      return 1;
    }
  });
  const [name] = useState<string>(() => {
    if (typeof window === "undefined") return generateName();
    try {
      return localStorage.getItem("pb-name") ?? generateName();
    } catch {
      return generateName();
    }
  });

  const isDesktop = useIsDesktop();
  const isHost = selfId !== null && hostId !== null && selfId === hostId;

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
  const isHostRef = useRef(false);
  // Mirror isHost into a ref so long-lived callbacks (YT onStateChange,
  // AudioBufferSource.onended) see the current value without resubscribing.
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  /* NTP-style clock sync — many samples, lowest-RTT quartile, median */
  const clockOffsetRef = useRef(0);
  const clockSamplesRef = useRef<{ offset: number; rtt: number }[]>([]);

  const applyingRemote = useRef(false);
  const lastMediaKey = useRef<string | null>(null);
  const endHandledForKey = useRef<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  /* Persist the first-ever generated name so reconnects keep the same handle. */
  useEffect(() => {
    try {
      if (!localStorage.getItem("pb-name")) localStorage.setItem("pb-name", name);
    } catch {
      /* private mode / disabled storage */
    }
  }, [name]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

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
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    gainRef.current = gain;
    return ctx;
  };

  /* Apply volume to both pipes whenever the slider moves. Local-only —
     each user has their own gain; nothing syncs to the room. */
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
    const yt = ytRef.current;
    if (yt && ytReady.current) {
      try {
        yt.setVolume(Math.round(volume * 100));
      } catch {
        /* player may not be ready */
      }
    }
    try {
      localStorage.setItem("pb-volume", String(volume));
    } catch {
      /* storage disabled */
    }
  }, [volume]);

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
    // Auto-advance: when audio ends and we're the host, pull the next item.
    src.onended = () => {
      if (!isHostRef.current) return;
      const cur = stateRef.current;
      if (!cur) return;
      const key = mediaKey(cur.media);
      if (endHandledForKey.current === key) return;
      endHandledForKey.current = key;
      send({ type: "QUEUE_NEXT" });
    };
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
    const key = mediaKey(s.media);
    const mediaChanged = lastMediaKey.current !== key;
    lastMediaKey.current = key;
    if (mediaChanged) endHandledForKey.current = null;

    applyingRemote.current = true;
    if (s.media.kind === "youtube") {
      stopSource();
      bufferRef.current = null;
      bufferUrlRef.current = null;
      setAudioReady(false);

      const target = Math.max(0, targetPosition(s));
      const player = ytRef.current;
      if (!player || !ytReady.current) {
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
          setSelfId(msg.selfId);
          setHostId(msg.hostId);
          setQueue(msg.queue);
          setChat(msg.chat);
          if (msg.state) applyState(msg.state);
          break;
        case "PEER_JOINED":
          setPeers((p) => [...p.filter((x) => x.id !== msg.peer.id), msg.peer]);
          break;
        case "PEER_LEFT":
          setPeers((p) => p.filter((x) => x.id !== msg.peerId));
          break;
        case "HOST":
          setHostId(msg.hostId);
          break;
        case "MEDIA":
          applyState(msg.state);
          break;
        case "QUEUE":
          setQueue(msg.queue);
          break;
        case "CHAT":
          setChat((c) => [...c, msg.msg]);
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
        case "ERROR":
          if (msg.code === "NOT_HOST") {
            toast.error("Only the host can control playback.");
          } else if (msg.message) {
            toast.error(msg.message);
          }
          break;
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
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: () => {
              ytReady.current = true;
              try {
                player.setVolume(Math.round(volume * 100));
              } catch {
                /* not ready */
              }
              const s = stateRef.current;
              if (s && s.media.kind === "youtube") applyState(s);
            },
            onStateChange: (e) => {
              if (e.data === YT_ENDED) {
                if (!isHostRef.current) return;
                const cur = stateRef.current;
                if (!cur) return;
                const key = mediaKey(cur.media);
                if (endHandledForKey.current === key) return;
                endHandledForKey.current = key;
                send({ type: "QUEUE_NEXT" });
                return;
              }
              if (applyingRemote.current) return;
              if (!isHostRef.current) return; // Guests can't drive playback
              const p = ytRef.current;
              if (!p) return;
              const pos = p.getCurrentTime();
              if (e.data === YT_PLAYING) send({ type: "PLAY", positionSec: pos });
              else if (e.data === YT_PAUSED) send({ type: "PAUSE", positionSec: pos });
            },
            onError: (e) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ── Auto-scroll chat to bottom on new message ───────────────────── */
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  /* ── Host control handlers ────────────────────────────────────────── */
  const onAudioPlay = () => {
    if (!isHost) return;
    const ctx = audioCtxRef.current;
    if (ctx?.state === "suspended") void ctx.resume();
    const pos = stateRef.current?.positionSec ?? 0;
    send({ type: "PLAY", positionSec: pos });
  };
  const onAudioPause = () => {
    if (!isHost) return;
    const pos = audioPlayheadNow();
    send({ type: "PAUSE", positionSec: pos });
  };
  const onAudioSeekCommit = (pos: number) => {
    setScrubbing(false);
    if (!isHost) return;
    send({ type: "SEEK", positionSec: pos });
  };
  const onSkip = () => {
    if (!isHost) return;
    endHandledForKey.current = stateRef.current
      ? mediaKey(stateRef.current.media)
      : null;
    send({ type: "QUEUE_NEXT" });
  };
  const onPlayNow = (item: QueueItem) => {
    if (!isHost) return;
    send({ type: "SET_MEDIA", media: item.media });
    send({ type: "QUEUE_REMOVE", itemId: item.id });
  };
  const onRemoveQueueItem = (item: QueueItem) => {
    send({ type: "QUEUE_REMOVE", itemId: item.id });
  };
  const onClearQueue = () => {
    if (!isHost) return;
    if (queue.length === 0) return;
    send({ type: "QUEUE_CLEAR" });
  };

  /* ── Bulk upload + drag-drop ──────────────────────────────────────── */
  const onUploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    // Filter out anything we can't reasonably treat as audio.
    const audio = files.filter(isLikelyAudio);
    const skipped = files.length - audio.length;
    if (skipped > 0) {
      toast.message(`Skipped ${skipped} non-audio file${skipped === 1 ? "" : "s"}.`);
    }
    if (audio.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: audio.length });
    // Prime AudioContext on the user gesture so playback isn't blocked later.
    ensureAudioCtx();

    const uploaded: Media[] = [];
    const failures: string[] = [];

    // Serial uploads — predictable for the user, gentle on the Worker CPU.
    for (let i = 0; i < audio.length; i++) {
      const file = audio[i];
      try {
        const { url, title } = await uploadAudioFile(file);
        uploaded.push({ kind: "audio", url, title });
      } catch (err) {
        failures.push(`${file.name}: ${(err as Error).message}`);
      }
      setUploadProgress({ done: i + 1, total: audio.length });
    }

    if (uploaded.length > 0) {
      if (uploaded.length === 1) {
        send({ type: "QUEUE_ADD", media: uploaded[0] });
      } else {
        send({ type: "QUEUE_ADD_MANY", items: uploaded });
      }
      toast.success(
        uploaded.length === 1
          ? `Queued "${(uploaded[0] as { title?: string }).title ?? "track"}"`
          : `Queued ${uploaded.length} tracks`
      );
    }
    if (failures.length > 0) {
      toast.error(
        failures.length === 1
          ? `Upload failed — ${failures[0]}`
          : `${failures.length} uploads failed (first: ${failures[0]})`
      );
    }
    setUploading(false);
    setUploadProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void onUploadFiles(files);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files") && !dragOver) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    // Ignore enter/leave between children.
    if (e.currentTarget === e.target) setDragOver(false);
  };

  const onSetYouTube = (e: React.FormEvent) => {
    e.preventDefault();
    // Multi-line input — extract every YouTube ID we can find.
    const ids = ytUrl
      .split(/\s+/)
      .map((s) => extractVideoId(s))
      .filter((id): id is string => !!id);
    if (ids.length === 0) {
      toast.error("Paste at least one YouTube link or 11-character video ID.");
      return;
    }
    if (ids.length === 1) {
      send({ type: "QUEUE_ADD", media: { kind: "youtube", videoId: ids[0] } });
    } else {
      send({
        type: "QUEUE_ADD_MANY",
        items: ids.map((videoId) => ({ kind: "youtube", videoId })),
      });
    }
    setYtUrl("");
    setShowYtForm(false);
    toast.success(ids.length === 1 ? "Added to queue" : `Added ${ids.length} videos`);
  };

  /* ── Chat ─────────────────────────────────────────────────────────── */
  const onSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    send({ type: "CHAT", text });
    setChatInput("");
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

  const hostPeer = useMemo(
    () => peers.find((p) => p.id === hostId) ?? null,
    [peers, hostId]
  );

  /* ── Sidebar panels (rendered on desktop or in mobile tabs) ───────── */
  const queuePanel = (
    <section
      className={`pb-side-panel pb-side-queue ${dragOver ? "is-drop-target" : ""}`}
      aria-label="Queue"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <header className="pb-side-head">
        <h2 className="pb-side-title">Up next</h2>
        <span className="pb-side-count">{queue.length}</span>
        {isHost && queue.length > 0 && (
          <button
            type="button"
            className="pb-side-action"
            onClick={onClearQueue}
            title="Clear queue"
          >
            Clear
          </button>
        )}
      </header>
      {queue.length === 0 ? (
        <p className="pb-side-empty">
          Nothing queued. Drop audio files here, or add below.
        </p>
      ) : (
        <ol className="pb-queue-list">
          {queue.map((item, i) => {
            const canRemove = isHost || item.addedBy === selfId;
            return (
              <li key={item.id} className="pb-queue-item">
                <span className="pb-queue-index">{i + 1}</span>
                <span className="pb-queue-title" title={mediaLabel(item.media)}>
                  {mediaLabel(item.media)}
                </span>
                <span className="pb-queue-actions">
                  {isHost && (
                    <button
                      type="button"
                      className="pb-queue-btn"
                      onClick={() => onPlayNow(item)}
                      title="Play now"
                      aria-label="Play now"
                    >
                      ▶
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      className="pb-queue-btn pb-queue-btn-faint"
                      onClick={() => onRemoveQueueItem(item)}
                      title="Remove"
                      aria-label="Remove from queue"
                    >
                      ×
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="pb-room-controls" style={{ marginTop: "1rem" }}>
        <p className="pb-action-label" style={{ marginBottom: "0.6rem" }}>
          {isHost ? "Add to queue" : "Suggest tracks"}
          {uploadProgress &&
            ` · ${uploadProgress.done}/${uploadProgress.total}`}
        </p>
        <div className="pb-room-actions">
          <label
            className="pb-action-btn"
            style={{ cursor: uploading ? "progress" : "pointer" }}
          >
            {uploading ? "Uploading…" : "+ Upload music"}
            <input
              type="file"
              multiple
              // Explicit extensions first — `accept="audio/*"` alone makes
              // Android offer Voice Recorder + Photos/Videos instead of
              // the Files app, and iOS hides music files entirely.
              accept=".mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.webm,audio/*"
              disabled={uploading}
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length > 0) void onUploadFiles(fs);
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
            {showYtForm ? "Cancel" : "+ YouTube link"}
          </button>
        </div>
        {showYtForm && (
          <form onSubmit={onSetYouTube} className="pb-room-form" style={{ marginTop: "0.75rem" }}>
            <div className="pb-room-form-row pb-room-form-col">
              <textarea
                className="pb-input pb-textarea"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder={"Paste one or more YouTube links — one per line"}
                rows={3}
                autoFocus
              />
              <button type="submit" className="pb-action-btn">
                Add
              </button>
            </div>
          </form>
        )}
        <p className="pb-room-hint" style={{ marginTop: "0.6rem" }}>
          Pick many at once, or drag a folder of tracks here. 15&nbsp;MB per file.
        </p>
      </div>
    </section>
  );

  const peoplePanel = (
    <section className="pb-side-panel pb-side-people" aria-label="People">
      <header className="pb-side-head">
        <h2 className="pb-side-title">In the room</h2>
        <span className="pb-side-count">{peers.length || 1}</span>
      </header>
      <ul className="pb-people-list">
        {peers.map((p) => {
          const you = p.id === selfId;
          const host = p.id === hostId;
          return (
            <li key={p.id} className="pb-people-item">
              <span className="pb-people-dot" aria-hidden />
              <span className="pb-people-name">
                {p.name}
                {you && <span className="pb-people-tag"> · you</span>}
              </span>
              {host && <span className="pb-people-badge">host</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );

  const chatPanel = (
    <section className="pb-side-panel pb-side-chat" aria-label="Chat">
      <header className="pb-side-head">
        <h2 className="pb-side-title">Chat</h2>
        <span className="pb-side-count">{chat.length}</span>
      </header>
      <div className="pb-chat-scroll" ref={chatScrollRef}>
        {chat.length === 0 ? (
          <p className="pb-side-empty">Say hi.</p>
        ) : (
          <ul className="pb-chat-list">
            {chat.map((m) => {
              const mine = m.from === selfId;
              return (
                <li
                  key={m.id}
                  className={`pb-chat-msg ${mine ? "is-mine" : ""}`}
                >
                  <span className="pb-chat-meta">
                    <span className="pb-chat-from">{m.fromName}</span>
                    <span className="pb-chat-time">{formatChatTime(m.ts)}</span>
                  </span>
                  <span className="pb-chat-text">{m.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form onSubmit={onSendChat} className="pb-chat-form">
        <input
          type="text"
          className="pb-input pb-chat-input"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
        />
        <button type="submit" className="pb-action-btn" disabled={!chatInput.trim()}>
          Send
        </button>
      </form>
    </section>
  );

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

      <main id="main" className={`pb-welcome-main pb-room-main ${isDesktop ? "pb-room-grid" : ""}`}>
        <div className="pb-room-stage">
          {/* 16:9 frame for the YT iframe — always mounted so YT.Player has a stable target. */}
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
                    disabled={!isHost}
                    title={isHost ? undefined : "Only the host can control playback"}
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
                    disabled={!isHost}
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
                {isHost
                  ? "Drop tracks into the queue — the first one plays right away."
                  : hostPeer
                    ? `Waiting for ${hostPeer.name} to start something.`
                    : "Waiting for someone to take the host seat."}
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

          {/* Transport row — host gets play/pause/skip; everyone gets a local volume slider. */}
          <div className="pb-transport-row">
            {isHost && state && (
              <div className="pb-host-bar">
                <button
                  type="button"
                  className="pb-host-btn"
                  onClick={state.playing ? onAudioPause : onAudioPlay}
                  aria-label={state.playing ? "Pause" : "Play"}
                  title={state.playing ? "Pause" : "Play"}
                >
                  {state.playing ? "❚❚" : "▶"}
                </button>
                <button
                  type="button"
                  className="pb-host-btn"
                  onClick={onSkip}
                  disabled={queue.length === 0}
                  aria-label="Skip to next"
                  title="Skip to next"
                >
                  ⏭
                </button>
                <span className="pb-host-bar-label">Hosting</span>
              </div>
            )}
            <label className="pb-volume" title="Your volume (local)">
              <span className="pb-volume-icon" aria-hidden>
                {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="pb-volume-slider"
                aria-label="Your volume"
              />
            </label>
          </div>

          <p className="pb-room-hint">
            Share <strong>{code}</strong> to bring people in. Audio uploads are
            capped at 15&nbsp;MB.
            {!isHost && hostPeer && (
              <>
                {" "}
                <span style={{ color: "var(--pb-text-soft)" }}>
                  {hostPeer.name} is the host.
                </span>
              </>
            )}
          </p>
        </div>

        {/* Sidebar — pinned on desktop, tabbed on mobile */}
        {isDesktop ? (
          <aside className="pb-room-side">
            {queuePanel}
            {peoplePanel}
            {chatPanel}
          </aside>
        ) : (
          <div className="pb-mobile-tabs">
            <div className="pb-mobile-tabbar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "queue"}
                className={`pb-mobile-tab ${mobileTab === "queue" ? "is-active" : ""}`}
                onClick={() => setMobileTab("queue")}
              >
                Queue · {queue.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "chat"}
                className={`pb-mobile-tab ${mobileTab === "chat" ? "is-active" : ""}`}
                onClick={() => setMobileTab("chat")}
              >
                Chat · {chat.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "people"}
                className={`pb-mobile-tab ${mobileTab === "people" ? "is-active" : ""}`}
                onClick={() => setMobileTab("people")}
              >
                People · {peers.length || 1}
              </button>
            </div>
            <div className="pb-mobile-tabpanel">
              {mobileTab === "queue"
                ? queuePanel
                : mobileTab === "chat"
                  ? chatPanel
                  : peoplePanel}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

"use client";

import { WordMark } from "@/components/BrandMark";
import {
  extractPlaylistId,
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
type RepeatMode = "off" | "all" | "one";
interface PlaybackMode {
  shuffle: boolean;
  repeat: RepeatMode;
  guestCanUpload: boolean;
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
      mode: PlaybackMode;
    }
  | { type: "PEER_JOINED"; peer: Peer }
  | { type: "PEER_LEFT"; peerId: string }
  | { type: "HOST"; hostId: string | null }
  | { type: "MEDIA"; state: MediaState }
  | { type: "QUEUE"; queue: QueueItem[] }
  | { type: "MODE"; mode: PlaybackMode }
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
  // Read matchMedia synchronously on the first client render so desktop
  // users don't see a brief flash of the mobile layout. SSR is impossible
  // here — the parent uses dynamic({ ssr: false }) — so `window` is safe.
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(min-width: ${DESKTOP_MIN_PX}px)`).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_PX}px)`);
    const apply = () => setIsDesktop(mq.matches);
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
async function uploadAudioFile(
  file: File,
  signal?: AbortSignal
): Promise<{ url: string; title: string }> {
  const guessed = file.type || guessAudioType(file.name);
  const res = await fetch("/api/upload/audio", {
    method: "POST",
    body: file,
    signal,
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
  const [mode, setMode] = useState<PlaybackMode>({ shuffle: false, repeat: "off", guestCanUpload: false });
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  /** Index of the queue item being dragged (for reorder drag-and-drop). */
  const [dragItemIdx, setDragItemIdx] = useState<number | null>(null);
  const [importingPlaylist, setImportingPlaylist] = useState(false);
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

  /** Map of audio URL → decoded AudioBuffer for pre-fetched tracks. */
  const audioBufsRef = useRef<Map<string, AudioBuffer>>(new Map());

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
  /** Controller for in-flight uploads — aborted on unmount so we don't
   *  call setState after the component is gone. */
  const uploadAbortRef = useRef<AbortController | null>(null);
  /** Counter for dragenter/dragleave — flat equality check (currentTarget
   *  === target) flickers as you cross child boundaries. */
  const dragCounterRef = useRef(0);
  /** Debounce timer for volume → localStorage. */
  const volumeWriteTimerRef = useRef<number | null>(null);
  /** Mirror of volume for unmount-time flush (closure would capture stale value). */
  const volumeRef = useRef<number>(0);

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
    // Force 44100 Hz — mobile devices (especially Android) sometimes default
    // to 22050 Hz or 16000 Hz (voice call rate) which causes the "old radio" sound.
    const ctx = new Ctor({ sampleRate: 44100 });
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    gainRef.current = gain;
    return ctx;
  };

  /* Apply volume to both pipes whenever the slider moves. Local-only —
     each user has their own gain; nothing syncs to the room. The
     localStorage write is debounced so dragging the slider doesn't thrash
     storage (mobile Safari serialises every write to disk). */
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
    volumeRef.current = volume;
    if (volumeWriteTimerRef.current !== null) {
      window.clearTimeout(volumeWriteTimerRef.current);
    }
    volumeWriteTimerRef.current = window.setTimeout(() => {
      volumeWriteTimerRef.current = null;
      try {
        localStorage.setItem("pb-volume", String(volume));
      } catch {
        /* storage disabled */
      }
    }, 250);
  }, [volume]);
  // Flush the pending debounce on unmount so the last value isn't lost,
  // and abort any in-flight uploads so we don't setState post-unmount.
  useEffect(() => {
    return () => {
      if (volumeWriteTimerRef.current !== null) {
        window.clearTimeout(volumeWriteTimerRef.current);
        try {
          localStorage.setItem("pb-volume", String(volumeRef.current));
        } catch {
          /* storage disabled */
        }
      }
      uploadAbortRef.current?.abort();
    };
  }, []);

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
      // Use pre-decoded buffer from prefetch cache if available — this lets
      // scheduleAudio fire within the 250 ms lead window without waiting for
      // a fresh fetch + decode round-trip.
      let decoded = audioBufsRef.current.get(url) ?? null;
      if (!decoded) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const bytes = await res.arrayBuffer();
        decoded = await ctx.decodeAudioData(bytes);
        audioBufsRef.current.set(url, decoded);
      }
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

  /* ── WebSocket lifecycle + NTP burst + auto-reconnect ─────────────── */
  useEffect(() => {
    let disposed = false;
    let pingTimer: number | null = null;
    const burstTimers: number[] = [];
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;

    const sendPing = () => send({ type: "PING", t0: Date.now() });

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(`${ROOMS_WS}/room/${code}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
        setConnected(true);
        send({ type: "HELLO", clientId: crypto.randomUUID(), name });
        // Burst: 8 pings @ 100ms — settles clockOffset to ~5ms before any PLAY.
        for (let i = 0; i < 8; i++) {
          burstTimers.push(window.setTimeout(sendPing, i * 100));
        }
        if (pingTimer !== null) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(sendPing, 3000);
      };
      ws.onclose = () => {
        setConnected(false);
        if (pingTimer !== null) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (disposed) return;
        // Exponential backoff with jitter, capped at 15s. Browsers fire
        // `close` on network flap; without this, the user would have to
        // refresh.
        const delay =
          Math.min(15_000, 500 * Math.pow(2, reconnectAttempts)) +
          Math.floor(Math.random() * 250);
        reconnectAttempts += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        // onerror always pairs with onclose — let close drive reconnect.
        setConnected(false);
      };
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
            setMode(msg.mode);
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
          case "MODE":
            setMode(msg.mode);
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
    };

    connect();

    return () => {
      disposed = true;
      burstTimers.forEach((t) => window.clearTimeout(t));
      if (pingTimer !== null) window.clearInterval(pingTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      // Clear handlers before close so a late onclose doesn't kick off a
      // reconnect that lives past unmount.
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* already closing */
        }
      }
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

  /* ── Auto-scroll chat to bottom on new message, but only if the user
   *  was already near the bottom — don't yank them out of history. */
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chat.length]);

  /* ── Pre-decode next queued audio track ──────────────────────────── */
  useEffect(() => {
    const first = queue[0];
    if (!first || first.media.kind !== "audio") return;
    const url = first.media.url;
    if (audioBufsRef.current.has(url)) return;
    let isCancelled = false;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    void (async () => {
      try {
        const res = await fetch(url);
        if (isCancelled || !res.ok) return;
        const bytes = await res.arrayBuffer();
        if (isCancelled) return;
        const decoded = await ctx.decodeAudioData(bytes);
        if (isCancelled) return;
        audioBufsRef.current.set(url, decoded);
      } catch {
        /* prefetch failed silently — no toast, no state update */
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

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
  const onToggleShuffle = () => {
    if (!isHost) return;
    send({ type: "SET_MODE", mode: { shuffle: !mode.shuffle } });
  };
  const onCycleRepeat = () => {
    if (!isHost) return;
    const next: RepeatMode =
      mode.repeat === "off" ? "all" : mode.repeat === "all" ? "one" : "off";
    send({ type: "SET_MODE", mode: { repeat: next } });
  };
  /** HTML5 drag-and-drop reorder for queue items (host only). */
  const onQueueItemDragStart = (idx: number) => {
    if (!isHost) return;
    setDragItemIdx(idx);
  };
  const onQueueItemDragOver = (e: React.DragEvent) => {
    if (!isHost || dragItemIdx === null) return;
    e.preventDefault();
  };
  const onQueueItemDrop = (toIdx: number) => {
    if (!isHost || dragItemIdx === null) {
      setDragItemIdx(null);
      return;
    }
    const item = queue[dragItemIdx];
    setDragItemIdx(null);
    if (!item || toIdx === dragItemIdx) return;
    send({ type: "QUEUE_REORDER", itemId: item.id, to: toIdx });
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

    // Cancel any prior in-flight batch.
    uploadAbortRef.current?.abort();
    const ctrl = new AbortController();
    uploadAbortRef.current = ctrl;

    setUploading(true);
    setUploadProgress({ done: 0, total: audio.length });
    // Prime AudioContext on the user gesture so playback isn't blocked later.
    ensureAudioCtx();

    const uploaded: Media[] = [];
    const failures: string[] = [];

    // Serial uploads — predictable for the user, gentle on the Worker CPU.
    for (let i = 0; i < audio.length; i++) {
      if (ctrl.signal.aborted) break;
      const file = audio[i];
      try {
        const { url, title } = await uploadAudioFile(file, ctrl.signal);
        uploaded.push({ kind: "audio", url, title });
      } catch (err) {
        if (ctrl.signal.aborted) break;
        failures.push(`${file.name}: ${(err as Error).message}`);
      }
      if (!ctrl.signal.aborted) {
        setUploadProgress({ done: i + 1, total: audio.length });
      }
    }

    if (ctrl.signal.aborted) {
      uploadAbortRef.current = null;
      return;
    }

    if (uploaded.length > 0) {
      if (uploaded.length === 1) {
        send({ type: "QUEUE_ADD", media: uploaded[0] });
      } else {
        send({ type: "QUEUE_ADD_MANY", items: uploaded });
      }
      toast.success(
        uploaded.length === 1
          ? `Added "${(uploaded[0] as { title?: string }).title ?? "track"}" to playlist`
          : `Added ${uploaded.length} tracks to playlist`
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
    uploadAbortRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void onUploadFiles(files);
  };
  const onDragOver = (e: React.DragEvent) => {
    // Required so the drop event fires at all.
    e.preventDefault();
  };
  const onDragEnter = (e: React.DragEvent) => {
    // Counter-based tracking — `currentTarget === target` flickers as you
    // move over child nodes because dragleave fires per element.
    const types = e.dataTransfer?.types;
    if (!types || !Array.from(types).includes("Files")) return;
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setDragOver(true);
  };
  const onDragLeave = () => {
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragOver(false);
  };

  const onSetYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = ytUrl.split(/\s+/).filter(Boolean);
    if (lines.length === 0) {
      toast.error("Paste at least one YouTube link or 11-character video ID.");
      return;
    }

    const videoIds = new Set<string>();
    const playlistIds: string[] = [];
    for (const line of lines) {
      const v = extractVideoId(line);
      if (v) videoIds.add(v);
      const list = extractPlaylistId(line);
      // Pure ?list=... URLs have no v=. Watch URLs may carry both; prefer
      // the explicit video, but still expand the playlist alongside.
      if (list && !v) playlistIds.push(list);
    }

    if (playlistIds.length > 0) {
      setImportingPlaylist(true);
      try {
        for (const pid of playlistIds) {
          const res = await fetch(`/api/youtube/playlist/${encodeURIComponent(pid)}`);
          if (!res.ok) {
            const { error } = (await res.json().catch(() => ({}))) as { error?: string };
            toast.error(error || `Couldn't import playlist (${res.status}).`);
            continue;
          }
          const body = (await res.json()) as { videoIds: string[]; truncated?: boolean };
          for (const v of body.videoIds) videoIds.add(v);
          if (body.truncated) {
            toast.message("Playlist was long — only the first 200 tracks were imported.");
          }
        }
      } finally {
        setImportingPlaylist(false);
      }
    }

    const ids = [...videoIds];
    if (ids.length === 0) {
      toast.error("Couldn't find any YouTube videos in that input.");
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
    toast.success(
      ids.length === 1
        ? "Added to playlist"
        : `Added ${ids.length} videos to playlist`
    );
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
      aria-label="Playlist"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <header className="pb-side-head">
        <h2 className="pb-side-title">Playlist</h2>
        <span className="pb-side-count">{queue.length}</span>
        {isHost && queue.length > 0 && (
          <button
            type="button"
            className="pb-side-action"
            onClick={onClearQueue}
            title="Clear playlist"
          >
            Clear
          </button>
        )}
      </header>
      {state && (
        <div className="pb-now-playing" aria-label="Now playing">
          <span className="pb-now-label">Now playing</span>
          <span
            className="pb-now-title"
            title={mediaLabel(state.media)}
          >
            {mediaLabel(state.media)}
          </span>
          <span className={`pb-now-dot ${state.playing ? "is-playing" : ""}`} aria-hidden />
        </div>
      )}
      {queue.length === 0 ? (
        <p className="pb-side-empty">
          Drop audio files here, pick many at once, or paste YouTube links below.
        </p>
      ) : (
        <ol className="pb-queue-list">
          {queue.map((item, i) => {
            const canRemove = isHost || item.addedBy === selfId;
            const isDragging = dragItemIdx === i;
            return (
              <li
                key={item.id}
                className={`pb-queue-item ${isDragging ? "is-dragging" : ""}`}
                draggable={isHost}
                onDragStart={() => onQueueItemDragStart(i)}
                onDragOver={onQueueItemDragOver}
                onDrop={(e) => {
                  e.stopPropagation();
                  onQueueItemDrop(i);
                }}
                onDragEnd={() => setDragItemIdx(null)}
              >
                {isHost ? (
                  <span className="pb-queue-handle" aria-hidden title="Drag to reorder">⋮⋮</span>
                ) : (
                  <span className="pb-queue-index">{i + 1}</span>
                )}
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
                      aria-label="Remove from playlist"
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

      {(isHost || mode.guestCanUpload) ? (
        <div className="pb-room-controls" style={{ marginTop: "1rem" }}>
          <p className="pb-action-label" style={{ marginBottom: "0.6rem" }}>
            {isHost ? "Build the playlist" : "Add tracks"}
            {uploadProgress &&
              ` · uploading ${uploadProgress.done}/${uploadProgress.total}`}
          </p>
          <div className="pb-room-actions">
            <label
              className="pb-action-btn"
              style={{ cursor: uploading ? "progress" : "pointer" }}
            >
              {uploading ? "Uploading…" : "+ Add tracks"}
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
              {showYtForm ? "Cancel" : "+ YouTube"}
            </button>
          </div>
          {showYtForm && (
            <form onSubmit={onSetYouTube} className="pb-room-form" style={{ marginTop: "0.75rem" }}>
              <div className="pb-room-form-row pb-room-form-col">
                <textarea
                  className="pb-input pb-textarea"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder={
                    "Paste videos or playlists (?list=…) — one per line"
                  }
                  rows={3}
                  autoFocus
                  disabled={importingPlaylist}
                />
                <button type="submit" className="pb-action-btn" disabled={importingPlaylist}>
                  {importingPlaylist ? "Importing…" : "Add"}
                </button>
              </div>
            </form>
          )}
          <p className="pb-room-hint" style={{ marginTop: "0.6rem" }}>
            Pick many tracks at once, drop a folder here, or paste a YouTube
            playlist URL. 15&nbsp;MB per file.
          </p>
        </div>
      ) : (
        <p className="pb-admin-card-body" style={{ textAlign: "center", marginTop: "1rem" }}>
          Only the host can add tracks.
        </p>
      )}
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
                  ? "Drop tracks into the playlist — the first one plays right away."
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
                  disabled={queue.length === 0 && mode.repeat === "off"}
                  aria-label="Skip to next"
                  title="Skip to next"
                >
                  ⏭
                </button>
                <button
                  type="button"
                  className={`pb-host-btn pb-host-btn-toggle ${mode.shuffle ? "is-on" : ""}`}
                  onClick={onToggleShuffle}
                  aria-pressed={mode.shuffle}
                  title={mode.shuffle ? "Shuffle on" : "Shuffle off"}
                  aria-label="Toggle shuffle"
                >
                  ⤮
                </button>
                <button
                  type="button"
                  className={`pb-host-btn pb-host-btn-toggle ${mode.repeat !== "off" ? "is-on" : ""}`}
                  onClick={onCycleRepeat}
                  title={
                    mode.repeat === "off"
                      ? "Repeat off"
                      : mode.repeat === "all"
                        ? "Repeat all"
                        : "Repeat one"
                  }
                  aria-label="Cycle repeat mode"
                >
                  {mode.repeat === "one" ? "🔂" : "🔁"}
                </button>
                <button
                  type="button"
                  className={`pb-host-btn pb-host-btn-toggle ${mode.guestCanUpload ? "is-on" : ""}`}
                  onClick={() => send({ type: "SET_MODE", mode: { guestCanUpload: !mode.guestCanUpload } })}
                  aria-pressed={mode.guestCanUpload}
                  title={mode.guestCanUpload ? "Guest uploads on — click to restrict" : "Allow guests to add tracks"}
                  aria-label="Toggle guest uploads"
                >
                  ↑G
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
                Playlist · {queue.length}
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

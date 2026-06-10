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
import {
  GripVertical,
  Headphones,
  ListMusic,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X as XIcon,
} from "lucide-react";
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

/** Tablet breakpoint — at/above this width we split into media + sidebar. */
const DESKTOP_MIN_PX = 768;

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
  const [activeTab, setActiveTab] = useState<"session" | "media" | "chat">("session");
  // Lazy init so we don't trigger a second render just to read localStorage.
  const [volume, setVolume] = useState<number>(1);
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

  // Native <audio> element — no Web Audio graph so there's zero resampling
  // or processing overhead. Volume is controlled via el.volume directly.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const ensureAudioEl = (): HTMLAudioElement | null => {
    if (audioElRef.current) return audioElRef.current;
    if (typeof window === "undefined") return null;
    const el = new Audio();
    el.volume = volume;
    audioElRef.current = el;
    return el;
  };

  const stopAudio = () => {
    const el = audioElRef.current;
    if (el && !el.paused) {
      el.pause();
      el.onended = null;
    }
  };

  const audioPlayheadNow = (): number =>
    audioElRef.current?.currentTime ?? stateRef.current?.positionSec ?? 0;

  useEffect(() => {
    const el = audioElRef.current;
    if (el) el.volume = volume;
    const yt = ytRef.current;
    if (yt && ytReady.current) {
      try {
        yt.setVolume(Math.round(volume * 100));
      } catch {
        /* player may not be ready */
      }
    }
  }, [volume]);
  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
      const el = audioElRef.current;
      if (el) {
        el.pause();
        el.onended = null;
        el.onloadedmetadata = null;
        el.src = "";
      }
    };
  }, []);


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
      stopAudio();
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
      // Streaming audio via <audio> element — starts immediately without
      // downloading the whole file first.
      const url = s.media.url;
      const el = ensureAudioEl();
      if (el) {
        const isNewTrack = mediaChanged || currentAudioUrlRef.current !== url;

        const attachEndedHandler = () => {
          el.onended = () => {
            if (!isHostRef.current) return;
            const cur = stateRef.current;
            if (!cur) return;
            const key = mediaKey(cur.media);
            if (endHandledForKey.current === key) return;
            endHandledForKey.current = key;
            send({ type: "QUEUE_NEXT" });
          };
        };

        if (isNewTrack) {
          stopAudio();
          setAudioReady(false);
          setAudioDuration(0);
          setAudioPosition(0);
          // Clear any pending canplay handler from the previous track so it
          // doesn't fire after we've already switched to a new URL.
          el.oncanplay = null;
          el.src = url;
          el.volume = volume;
          currentAudioUrlRef.current = url;
        }

        if (s.playing) {
          // Re-derive the playhead at the moment we actually start — loading
          // takes time on mobile, so the correct position must be calculated
          // inside startSynced(), not here at applyState call time.
          const startSynced = () => {
            if (currentAudioUrlRef.current !== url) return;
            const cur = stateRef.current;
            if (!cur || cur.media.kind !== "audio" || !cur.playing) return;
            const localStartMs = cur.anchorServerMs - clockOffsetRef.current;
            const delayMs = localStartMs - Date.now();
            const seekTo = Math.max(0, cur.positionSec + Math.max(0, -delayMs / 1000));
            el.currentTime = seekTo;
            attachEndedHandler();
            void el.play().catch(() => setAutoplayBlocked(true));
            setAutoplayBlocked(false);
          };

          // HAVE_FUTURE_DATA (3) or HAVE_ENOUGH_DATA (4): data is buffered,
          // seek and play immediately. Otherwise wait — on Android, setting
          // currentTime before any data is buffered is silently ignored and
          // playback starts from position 0 instead of the intended seek target.
          if (el.readyState >= 3) {
            startSynced();
          } else {
            el.oncanplay = () => {
              el.oncanplay = null;
              startSynced();
            };
          }
          el.onloadedmetadata = () => {
            if (currentAudioUrlRef.current !== url) return;
            setAudioDuration(el.duration);
            setAudioReady(true);
          };
        } else {
          // Paused: cancel any pending canplay/play, seek to the correct position.
          el.oncanplay = null;
          if (!isNewTrack) {
            el.pause();
            el.currentTime = s.positionSec;
            el.onloadedmetadata = null;
          } else {
            // New track in paused state — defer seek until metadata is loaded.
            el.onloadedmetadata = () => {
              if (currentAudioUrlRef.current !== url) return;
              setAudioDuration(el.duration);
              setAudioReady(true);
              el.currentTime = s.positionSec;
            };
          }
        }

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
        const el = audioElRef.current;
        setAudioPosition(el ? el.currentTime : s.positionSec);
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


  /* ── Host control handlers ────────────────────────────────────────── */
  const onAudioPlay = () => {
    if (!isHost) return;
    const pos = audioElRef.current?.currentTime ?? stateRef.current?.positionSec ?? 0;
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
    // Prime AudioContext + audio element on user gesture so autoplay isn't blocked later.
    ensureAudioEl();

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

  const openFilePicker = async () => {
    // showOpenFilePicker opens Chrome's own file browser, bypassing Samsung's
    // media intent chooser which never shows "Files". Falls back to the hidden
    // <input> on browsers that don't support the File System Access API.
    const fsp = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<{ getFile(): Promise<File> }[]> }).showOpenFilePicker;
    if (fsp) {
      try {
        const handles = await fsp({
          multiple: true,
          types: [{ description: "Audio", accept: { "audio/*": [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus", ".flac", ".webm", ".wma", ".aiff", ".aif"] } }],
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        if (files.length > 0) void onUploadFiles(files);
      } catch (err) {
        if ((err as Error).name !== "AbortError") fileInputRef.current?.click();
      }
    } else {
      fileInputRef.current?.click();
    }
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
    const el = audioElRef.current;
    const s = stateRef.current;
    if (el && s?.media.kind === "audio" && s.playing && el.paused) {
      void el.play().catch(() => setAutoplayBlocked(true));
      return;
    }
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
  // Mini-player shows on mobile when media is playing but user is not on the session tab.
  const hasMiniPlayer = !isDesktop && state !== null && activeTab !== "session";

  const hostPeer = useMemo(
    () => peers.find((p) => p.id === hostId) ?? null,
    [peers, hostId]
  );

  /* ── Volume icon helper ───────────────────────────────────────────── */
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  /* ── Transport controls (shared between desktop stage and mobile session tab) ── */
  const transportRow = (
    <div className="pb-transport-row">
      {isHost && state && (
        <div className="pb-primary-controls">
          <button
            type="button"
            className="pb-play-pill"
            onClick={state.playing ? onAudioPause : onAudioPlay}
            aria-label={state.playing ? "Pause" : "Play"}
          >
            {state.playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
            {state.playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="pb-skip-pill"
            onClick={onSkip}
            disabled={queue.length === 0 && mode.repeat === "off"}
            aria-label="Skip to next"
          >
            <SkipForward size={16} aria-hidden /> Skip
          </button>
        </div>
      )}
      <div className="pb-secondary-volume-row">
        {isHost && state && (
          <div className="pb-secondary-controls">
            <button
              type="button"
              className={`pb-host-btn pb-host-btn-toggle${mode.shuffle ? " is-on" : ""}`}
              onClick={onToggleShuffle}
              aria-pressed={mode.shuffle}
              title={mode.shuffle ? "Shuffle on" : "Shuffle off"}
              aria-label="Toggle shuffle"
            >
              <Shuffle size={15} aria-hidden />
            </button>
            <button
              type="button"
              className={`pb-host-btn pb-host-btn-toggle${mode.repeat !== "off" ? " is-on" : ""}`}
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
              {mode.repeat === "one"
                ? <Repeat1 size={15} aria-hidden />
                : <Repeat size={15} aria-hidden />}
            </button>
            <span className="pb-host-bar-label">Hosting</span>
          </div>
        )}
        <label className="pb-volume" title="Your volume (local)">
          <VolumeIcon size={16} aria-hidden className="pb-volume-icon" />
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
    </div>
  );

  /* ── Stage content (player + seek bar + empty state) ─────────────── */
  const stageContent = (
    <>
      {/* 16:9 frame for the YT iframe — always mounted so YT.Player has a stable target. */}
      <div className="pb-yt-frame" style={{ display: isYouTube ? "block" : "none" }}>
        <div id="pb-yt-player" className="pb-yt-player" />
      </div>

      {isAudio && state?.media.kind === "audio" && (
        <>
          {/* Square now-playing card — solid ink, no gradient */}
          <div className="pb-now-playing-stage">
            {audioReady ? (
              <div
                className={`pb-playing-bars pb-np-bars${state.playing ? "" : " is-paused"}`}
                aria-hidden
              >
                <span /><span /><span />
              </div>
            ) : (
              <p className="pb-np-loading">Loading…</p>
            )}
          </div>
          <p className="pb-np-title-below">{state.media.title ?? "Now playing"}</p>
          {/* Seek bar */}
          {audioReady && (
            <div className="pb-audio-player" style={{ marginBottom: "0.75rem" }}>
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
        </>
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

      {autoplayBlocked && (isDesktop || activeTab === "session") && (
        <button
          type="button"
          onClick={onResyncTap}
          className="pb-action-btn pb-action-btn-secondary"
          style={{ marginBottom: "1.5rem" }}
        >
          Tap to start playback
        </button>
      )}
    </>
  );

  /* ── Queue rows — shared between desktop center column and mobile media tab ── */
  const queueRows = (
    <div
      className={`pb-queue-section${dragOver ? " is-drop-target" : ""}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <header className="pb-side-head">
        <h2 className="pb-side-title">Queue</h2>
        <span className="pb-side-count">{queue.length}</span>
        {isHost && queue.length > 0 && (
          <button type="button" className="pb-side-action" onClick={onClearQueue} title="Clear queue">
            Clear
          </button>
        )}
      </header>
      {queue.length === 0 && !state ? (
        <p className="pb-side-empty">
          {isHost || mode.guestCanUpload ? "Drop audio files here." : "Only the host can add tracks."}
        </p>
      ) : queue.length === 0 ? null : (
        <>
          <p className="pb-up-next-label">Up next</p>
          <ol className="pb-queue-list">
            {queue.map((item, i) => {
              const canRemove = isHost || item.addedBy === selfId;
              const isDragging = dragItemIdx === i;
              const isAudioItem = item.media.kind === "audio";
              const trackTitle = item.media.kind === "audio"
                ? (item.media.title ?? "Untitled")
                : `YouTube · ${item.media.videoId}`;
              return (
                <li
                  key={item.id}
                  className={`pb-queue-item${isDragging ? " is-dragging" : ""}`}
                  draggable={isHost}
                  onDragStart={() => onQueueItemDragStart(i)}
                  onDragOver={onQueueItemDragOver}
                  onDrop={(e) => { e.stopPropagation(); onQueueItemDrop(i); }}
                  onDragEnd={() => setDragItemIdx(null)}
                >
                  <div className="pb-track-thumb" aria-hidden>
                    {isAudioItem ? <Music2 size={15} /> : <span className="pb-yt-label">YT</span>}
                  </div>
                  <div className="pb-track-info">
                    <span className="pb-queue-title" title={trackTitle}>{trackTitle}</span>
                    <span className="pb-track-badge">{isAudioItem ? "audio" : "YouTube"}</span>
                  </div>
                  <span className="pb-queue-actions">
                    {isHost && (
                      <button type="button" className="pb-queue-btn" onClick={() => onPlayNow(item)} title="Play now" aria-label="Play now">
                        <Play size={13} aria-hidden />
                      </button>
                    )}
                    {canRemove && (
                      <button type="button" className="pb-queue-btn pb-queue-btn-faint" onClick={() => onRemoveQueueItem(item)} title="Remove" aria-label="Remove from queue">
                        <XIcon size={13} aria-hidden />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {!isHost && !mode.guestCanUpload && queue.length > 0 && (
        <p className="pb-side-empty" style={{ marginTop: "0.75rem" }}>Only the host can add tracks.</p>
      )}
    </div>
  );

  /* ── Add controls — upload button + YouTube form, used in left sidebar (desktop) and media tab (mobile) ── */
  const addControls = (isHost || mode.guestCanUpload) ? (
    <div className="pb-add-controls">
      <div className="pb-room-actions">
        <button
          type="button"
          className="pb-action-btn"
          style={{ cursor: uploading ? "progress" : "pointer", fontSize: "0.85rem", padding: "0.6rem 1rem" }}
          disabled={uploading}
          onClick={() => void openFilePicker()}
        >
          {uploading
            ? `Uploading… ${uploadProgress ? `${uploadProgress.done}/${uploadProgress.total}` : ""}`
            : <><Plus size={13} aria-hidden style={{ display: "inline", marginRight: "0.3rem", verticalAlign: "middle" }} />Add audio</>}
        </button>
        <button
          type="button"
          onClick={() => setShowYtForm((v) => !v)}
          className="pb-action-btn pb-action-btn-secondary"
          style={{ fontSize: "0.85rem", padding: "0.6rem 1rem" }}
        >
          {showYtForm ? "Cancel" : <><Plus size={13} aria-hidden style={{ display: "inline", marginRight: "0.3rem", verticalAlign: "middle" }} />YouTube</>}
        </button>
      </div>
      {showYtForm && (
        <form onSubmit={onSetYouTube} className="pb-room-form" style={{ marginTop: "0.65rem" }}>
          <div className="pb-room-form-row pb-room-form-col">
            <textarea
              className="pb-input pb-textarea"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="Paste videos or playlists (?list=…) — one per line"
              rows={3}
              autoFocus
              disabled={importingPlaylist}
            />
            <button type="submit" className="pb-action-btn" disabled={importingPlaylist} style={{ fontSize: "0.85rem", padding: "0.6rem 1rem" }}>
              {importingPlaylist ? "Importing…" : "Add"}
            </button>
          </div>
        </form>
      )}
      <p className="pb-room-hint" style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>
        Pick many tracks at once or drop here. 15&nbsp;MB per file.
      </p>
      {isHost && (
        <div className="pb-guest-toggle-row">
          <span className="pb-guest-toggle-label">Allow guest uploads</span>
          <button
            type="button"
            className={`pb-guest-toggle-btn${mode.guestCanUpload ? " is-on" : ""}`}
            onClick={() => send({ type: "SET_MODE", mode: { guestCanUpload: !mode.guestCanUpload } })}
            aria-pressed={mode.guestCanUpload}
          >
            {mode.guestCanUpload ? "On" : "Off"}
          </button>
        </div>
      )}
    </div>
  ) : null;

  /* ── Mobile media panel — queue + add controls in a card ────────── */
  const mediaPanel = (
    <section className={`pb-side-panel pb-side-queue${dragOver ? " is-drop-target" : ""}`} aria-label="Media">
      {queueRows}
      {addControls && <div style={{ marginTop: "0.75rem" }}>{addControls}</div>}
    </section>
  );

  /* ── People — horizontal chips for mobile session tab ───────────── */
  const peoplePillRow = peers.length > 0 ? (
    <div className="pb-people-chips" aria-label="People in the room">
      {peers.map((p) => {
        const you = p.id === selfId;
        const host = p.id === hostId;
        return (
          <span key={p.id} className={`pb-people-chip${host ? " is-host" : ""}`}>
            {p.name}
            {you && <span className="pb-chip-tag">you</span>}
            {host && <span className="pb-chip-tag">host</span>}
          </span>
        );
      })}
    </div>
  ) : null;

  /* ── Chat panel ───────────────────────────────────────────────────── */
  const chatPanel = (
    <section className="pb-side-panel pb-side-chat" aria-label="Chat">
      <header className="pb-side-head">
        <MessageCircle size={13} aria-hidden style={{ color: "var(--pb-text-soft)", flexShrink: 0 }} />
        <h2 className="pb-side-title" style={{ marginLeft: "0.35rem" }}>Chat</h2>
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

  /* Hidden file input — always in the DOM so openFilePicker() can trigger it */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="audio/*"
      multiple
      disabled={uploading}
      onChange={(e) => {
        const fs = Array.from(e.target.files ?? []);
        if (fs.length > 0) void onUploadFiles(fs);
        e.target.value = "";
      }}
      style={{ display: "none" }}
    />
  );

  return (
    <div className={`pb-welcome pb-room${hasMiniPlayer ? " pb-has-mini" : ""}`}>
      {fileInput}
      <div className="pb-topbar" aria-hidden />
      <header className="pb-welcome-header">
        <WordMark asLink />
        <div className="pb-room-meta">
          <button type="button" onClick={onCopyCode} className="pb-room-code" title="Copy room code">
            {code}
          </button>
          <span className={`pb-room-dot ${connected ? "is-live" : ""}`} aria-hidden />
          <span className="pb-room-status">
            {connected ? `${peers.length || 1} here` : "connecting…"}
          </span>
        </div>
      </header>

      {isDesktop ? (
        /* ── Desktop: three-column layout ─────────────────────────── */
        <>
          <div className="pb-room-body">
            {/* Left sidebar — people + upload controls */}
            <aside className="pb-room-left">
              <p className="pb-left-label">In the room</p>
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
              {addControls && (
                <>
                  <div className="pb-left-divider" />
                  {addControls}
                </>
              )}
              <p className="pb-room-hint" style={{ marginTop: "auto", paddingTop: "1rem" }}>
                Share <strong>{code}</strong> to bring people in.
                {!isHost && hostPeer && (
                  <>{" "}{hostPeer.name} is the host.</>
                )}
              </p>
            </aside>

            {/* Center — player stage + queue */}
            <main id="main" className="pb-room-center">
              <div className="pb-room-stage">{stageContent}</div>
              {queueRows}
            </main>

            {/* Right sidebar — chat */}
            <aside className="pb-room-right">
              {chatPanel}
            </aside>
          </div>

          {/* Transport bar — full-width strip at bottom */}
          <div className="pb-room-transport">
            {transportRow}
          </div>
        </>
      ) : (
        /* ── Mobile: tab bar + tab panels ─────────────────────────── */
        <>
          <nav className="pb-room-tabbar" aria-label="Room sections">
            <button
              id="pb-tab-btn-session"
              role="tab"
              aria-controls="pb-tab-session"
              aria-selected={activeTab === "session"}
              className={`pb-room-tab${activeTab === "session" ? " is-active" : ""}`}
              onClick={() => setActiveTab("session")}
            >
              <Headphones size={20} aria-hidden />
              <span>Session</span>
            </button>
            <button
              id="pb-tab-btn-media"
              role="tab"
              aria-controls="pb-tab-media"
              aria-selected={activeTab === "media"}
              className={`pb-room-tab${activeTab === "media" ? " is-active" : ""}`}
              onClick={() => setActiveTab("media")}
            >
              <ListMusic size={20} aria-hidden />
              <span>Media{queue.length > 0 ? ` · ${queue.length}` : ""}</span>
            </button>
            <button
              id="pb-tab-btn-chat"
              role="tab"
              aria-controls="pb-tab-chat"
              aria-selected={activeTab === "chat"}
              className={`pb-room-tab${activeTab === "chat" ? " is-active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              <MessageCircle size={20} aria-hidden />
              <span>Chat{chat.length > 0 ? ` · ${chat.length}` : ""}</span>
            </button>
          </nav>

          <main id="main" className="pb-welcome-main pb-room-main">
            {/* Session tab */}
            <div role="tabpanel" id="pb-tab-session" aria-labelledby="pb-tab-btn-session" hidden={activeTab !== "session"}>
              <div className="pb-room-stage">{stageContent}</div>
              {transportRow}
              {peoplePillRow}
              <p className="pb-room-hint" style={{ marginTop: "0.5rem" }}>
                Share <strong>{code}</strong> to bring people in.
                {!isHost && hostPeer && (
                  <>{" "}<span style={{ color: "var(--pb-text-soft)" }}>{hostPeer.name} is the host.</span></>
                )}
              </p>
            </div>

            {/* Media tab */}
            <div role="tabpanel" id="pb-tab-media" aria-labelledby="pb-tab-btn-media" hidden={activeTab !== "media"}>
              {mediaPanel}
            </div>

            {/* Chat tab */}
            <div role="tabpanel" id="pb-tab-chat" aria-labelledby="pb-tab-btn-chat" hidden={activeTab !== "chat"}>
              {chatPanel}
            </div>
          </main>

          {/* Mini-player — mobile only, when playing away from session tab */}
          {hasMiniPlayer && (
            <aside className="pb-mini-player" aria-label="Now playing">
              <div className={`pb-playing-bars pb-mini-bars${state!.playing ? "" : " is-paused"}`} aria-hidden>
                <span /><span /><span />
              </div>
              <div className="pb-mini-info">
                <p className="pb-mini-title">{mediaLabel(state!.media)}</p>
                {autoplayBlocked && <p className="pb-mini-sub">Tap to start</p>}
              </div>
              {(isHost || autoplayBlocked) && (
                <button
                  type="button"
                  className="pb-mini-btn"
                  onClick={autoplayBlocked ? onResyncTap : (state!.playing ? onAudioPause : onAudioPlay)}
                  aria-label={state!.playing && !autoplayBlocked ? "Pause" : "Play"}
                >
                  {state!.playing && !autoplayBlocked
                    ? <Pause size={16} aria-hidden />
                    : <Play size={16} aria-hidden />}
                </button>
              )}
            </aside>
          )}
        </>
      )}
    </div>
  );
};

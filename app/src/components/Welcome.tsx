"use client";

import {
  generateRoomCode,
  normalizeRoomCode,
  validatePartialRoomCode,
  validateRoomCode,
} from "@/lib/roomCode";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Footer } from "./Footer";
import { Header } from "./Header";

export const Welcome = () => {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate after mount to avoid SSR/client hydration mismatch.
  useEffect(() => {
    const fresh = generateRoomCode();
    setCode(fresh);
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const openRoom = (raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!validateRoomCode(value)) {
      toast.error("Room codes are six characters — letters and numbers.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    router.push(`/room/${value}`);
  };

  const onShuffle = () => {
    setCode(generateRoomCode());
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    openRoom(code);
  };

  return (
    <div className="pb-welcome">
      <div className="pb-topbar" aria-hidden />
      <Header brandAsLink={false} />

      <main id="main" className="pb-welcome-main">
        <h1 className="pb-welcome-headline">
          Listen <span className="pb-emph">together</span>.<br />
          Even when you&apos;re apart.
        </h1>

        <hr className="pb-welcome-rule" />

        <section className="pb-welcome-actions">
          <form onSubmit={onSubmit} className="pb-action-form">
            <label htmlFor="room-code" className="pb-action-label">
              Room code
            </label>
            <input
              ref={inputRef}
              id="room-code"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              maxLength={6}
              className="pb-code-input"
              value={code}
              placeholder="4ED678"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const v = normalizeRoomCode(e.target.value);
                if (validatePartialRoomCode(v)) setCode(v);
              }}
            />
            <div className="pb-action-row">
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="pb-action-btn"
              >
                {busy ? "Opening…" : "Open room"}
              </button>
              <button
                type="button"
                onClick={onShuffle}
                className="pb-shuffle"
              >
                Shuffle code
              </button>
            </div>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  );
};

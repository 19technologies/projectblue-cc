"use client";

import { WordMark } from "@/components/BrandMark";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function BetaGatePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Enter your invite code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/beta/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, who }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Couldn't verify code.");
        setBusy(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Network error.");
      setBusy(false);
    }
  };

  return (
    <div className="pb-welcome pb-beta-page">
      <div className="pb-topbar" aria-hidden />

      <header className="pb-welcome-header">
        <WordMark />
        <span className="pb-admin-pill" style={{ background: "var(--pb-accent)" }}>
          BETA
        </span>
      </header>

      <main id="main" className="pb-welcome-main">
        <p className="pb-legal-updated pb-beta-eyebrow">Private beta</p>
        <h1 className="pb-beta-headline">
          Welcome, <span className="pb-emph pb-beta-emph">beta tester</span>.
        </h1>
        <p className="pb-beta-sub">
          You&apos;re early. Drop your invite code below.
        </p>

        <hr className="pb-welcome-rule" />

        <form onSubmit={onSubmit} className="pb-form-stack" style={{ maxWidth: "32rem" }}>
          <label className="pb-action-label" htmlFor="beta-code">
            Invite code
          </label>
          <input
            id="beta-code"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            className="pb-beta-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-YYY-ZZZ"
          />

          <label
            className="pb-action-label"
            htmlFor="beta-who"
            style={{ marginTop: "1.75rem" }}
          >
            Your name or email (for the record)
          </label>
          <input
            id="beta-who"
            type="text"
            className="pb-input"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="optional but appreciated"
            style={{ maxWidth: "32rem" }}
          />

          <div className="pb-action-row">
            <button type="submit" disabled={busy} className="pb-action-btn">
              {busy ? "Verifying…" : "Enter Project Blue"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

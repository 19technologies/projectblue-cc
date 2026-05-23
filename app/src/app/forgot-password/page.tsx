"use client";

import { PublicShell } from "@/components/PublicShell";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Email required.");
      return;
    }
    setBusy(true);
    // Email-driven resets aren't wired during beta. Be honest about it
    // rather than pretending — the team handles resets manually.
    setTimeout(() => {
      toast.info("Email hello@projectblue.cc — we reset passwords by hand during beta.");
      setBusy(false);
    }, 400);
  };

  return (
    <PublicShell kicker="It happens" title={<>Reset your <span className="pb-emph">password</span>.</>}>
      <p className="pb-legal-body" style={{ marginBottom: "2rem", color: "var(--pb-text-soft)" }}>
        Enter your email and we&apos;ll send you a link to choose a new password.
      </p>

      <form onSubmit={onSubmit} className="pb-form-stack">
        <label className="pb-action-label" htmlFor="reset-email">Email</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          className="pb-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <div className="pb-action-row">
          <button type="submit" disabled={busy} className="pb-action-btn">
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </div>

        <p className="pb-legal-body" style={{ marginTop: "2rem", color: "var(--pb-text-soft)" }}>
          Remembered it?{" "}
          <Link href="/signin" className="pb-shuffle">Sign in</Link>
        </p>
      </form>
    </PublicShell>
  );
}

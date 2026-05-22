"use client";

import { PublicShell } from "@/components/PublicShell";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Sign-in failed.");
        setBusy(false);
        return;
      }
      toast.success("Signed in.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Network error.");
      setBusy(false);
    }
  };

  return (
    <PublicShell kicker="Welcome back" title={<>Sign <span className="pb-emph">in</span>.</>}>
      <form onSubmit={onSubmit} className="pb-form-stack">
        <label className="pb-action-label" htmlFor="signin-email">Email</label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          className="pb-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <label className="pb-action-label" htmlFor="signin-password" style={{ marginTop: "1.75rem" }}>
          Password
        </label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          className="pb-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <div style={{ marginTop: "0.75rem" }}>
          <Link href="/forgot-password" className="pb-shuffle">
            Forgot password?
          </Link>
        </div>

        <div className="pb-action-row">
          <button type="submit" disabled={busy} className="pb-action-btn">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p className="pb-legal-body" style={{ marginTop: "2rem", color: "var(--pb-text-soft)" }}>
          New to Project Blue?{" "}
          <Link href="/signup" className="pb-shuffle">
            Create an account
          </Link>
        </p>
      </form>
    </PublicShell>
  );
}

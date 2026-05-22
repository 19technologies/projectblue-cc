"use client";

import { PublicShell } from "@/components/PublicShell";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignUpPage() {
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
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Couldn't create account.");
        setBusy(false);
        return;
      }
      toast.success("Account created.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Network error.");
      setBusy(false);
    }
  };

  return (
    <PublicShell kicker="Make it yours" title={<>Create an <span className="pb-emph">account</span>.</>}>
      <p className="pb-legal-body" style={{ marginBottom: "2rem", color: "var(--pb-text-soft)" }}>
        Accounts are optional. You can open or join rooms without one — sign up only
        if you want to keep your rooms across devices.
      </p>

      <form onSubmit={onSubmit} className="pb-form-stack">
        <label className="pb-action-label" htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          className="pb-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <label className="pb-action-label" htmlFor="signup-password" style={{ marginTop: "1.75rem" }}>
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          className="pb-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
        />

        <div className="pb-action-row">
          <button type="submit" disabled={busy} className="pb-action-btn">
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>

        <p className="pb-legal-body" style={{ marginTop: "2rem", color: "var(--pb-text-soft)" }}>
          By creating an account you agree to our{" "}
          <Link href="/terms" className="pb-shuffle">Terms</Link> and{" "}
          <Link href="/privacy" className="pb-shuffle">Privacy notice</Link>.
        </p>

        <p className="pb-legal-body" style={{ marginTop: "1rem", color: "var(--pb-text-soft)" }}>
          Already on Project Blue?{" "}
          <Link href="/signin" className="pb-shuffle">Sign in</Link>
        </p>
      </form>
    </PublicShell>
  );
}

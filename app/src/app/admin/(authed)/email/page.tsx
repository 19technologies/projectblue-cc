"use client";

import { AdminNav } from "@/components/AdminNav";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminEmailPage() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("You're invited to Project Blue beta");
  const [message, setMessage] = useState(
    "Hi there,\n\nYou've been invited to join the Project Blue beta — synchronized listening across all your devices.\n\nUse your invite code below to get started. Let me know if you have any questions.\n\nCheers,\nThe Project Blue team"
  );
  const [betaCode, setBetaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, message, betaCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send.");
        return;
      }
      toast.success(`Email sent to ${to}`);
      setLastSent(to);
      setTo("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-welcome pb-admin-page">
      <div className="pb-topbar" aria-hidden />
      <AdminNav page="Email" />

      <main id="main" className="pb-welcome-main">
        <p className="pb-legal-updated">Admin · Email</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Send <span className="pb-emph">email</span>
        </h1>
        <hr className="pb-welcome-rule" />

        {lastSent && (
          <p style={{ color: "var(--pb-text-soft)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            Last sent to <strong style={{ color: "var(--pb-text)" }}>{lastSent}</strong>
          </p>
        )}

        <form onSubmit={onSend} className="pb-form-stack" style={{ maxWidth: "36rem" }}>
          <label className="pb-action-label" htmlFor="email-to">
            Recipient email
          </label>
          <input
            id="email-to"
            type="email"
            className="pb-input"
            placeholder="someone@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            autoComplete="off"
          />

          <label className="pb-action-label" htmlFor="email-subject" style={{ marginTop: "1.25rem" }}>
            Subject
          </label>
          <input
            id="email-subject"
            type="text"
            className="pb-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />

          <label className="pb-action-label" htmlFor="email-body" style={{ marginTop: "1.25rem" }}>
            Message
          </label>
          <textarea
            id="email-body"
            className="pb-input"
            rows={10}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
          />

          <label className="pb-action-label" htmlFor="email-code" style={{ marginTop: "1.25rem" }}>
            Beta invite code{" "}
            <span style={{ color: "var(--pb-text-soft)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="email-code"
            type="text"
            className="pb-input"
            placeholder="e.g. BLUE-XXXX-XXXX"
            value={betaCode}
            onChange={(e) => setBetaCode(e.target.value)}
            style={{ fontFamily: '"SF Mono","JetBrains Mono","Menlo","Consolas",monospace', letterSpacing: "0.06em" }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--pb-text-soft)", marginTop: "0.4rem" }}>
            When filled, a styled code block is appended to the email with a link to beta.projectblue.cc.
          </p>

          <div className="pb-action-row" style={{ marginTop: "1.75rem" }}>
            <button type="submit" disabled={busy} className="pb-action-btn">
              {busy ? "Sending…" : "Send email"}
            </button>
          </div>
        </form>

        <hr className="pb-welcome-rule" style={{ marginTop: "3rem" }} />

        <section style={{ marginTop: "2rem" }}>
          <h2 className="pb-admin-card-title" style={{ marginBottom: "0.75rem" }}>Setup</h2>
          <p className="pb-admin-card-body" style={{ maxWidth: "36rem" }}>
            Email is sent via <strong>Resend</strong>. You need to add your API key as a Worker secret:
          </p>
          <pre
            style={{
              background: "rgba(91,123,196,0.08)",
              border: "1px solid rgba(91,123,196,0.2)",
              borderRadius: "8px",
              padding: "1rem 1.25rem",
              fontSize: "0.8rem",
              color: "var(--pb-text)",
              fontFamily: '"SF Mono","JetBrains Mono","Menlo","Consolas",monospace',
              overflowX: "auto",
              marginTop: "0.75rem",
              maxWidth: "36rem",
            }}
          >{`cd app
npx wrangler secret put RESEND_API_KEY
# paste your key from resend.com/api-keys`}</pre>
          <p className="pb-admin-card-body" style={{ maxWidth: "36rem", marginTop: "0.75rem" }}>
            The From address is <code>admin@projectblue.cc</code> (set via <code>ADMIN_EMAIL</code> in wrangler.jsonc).
            Make sure the domain is verified in your Resend dashboard.
          </p>
        </section>
      </main>
    </div>
  );
}

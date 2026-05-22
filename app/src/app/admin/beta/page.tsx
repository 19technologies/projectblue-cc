"use client";

import { WordMark } from "@/components/BrandMark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface BetaInvite {
  code: string;
  createdAt: string;
  note?: string;
  usedAt?: string;
  usedBy?: string;
}

export default function AdminBetaPage() {
  const [invites, setInvites] = useState<BetaInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/beta/codes");
      setInvites((await res.json()) as BetaInvite[]);
    } catch {
      toast.error("Couldn't load invites.");
    } finally {
      setLoading(false);
    }
  };
  const refresh = async () => {
    setLoading(true);
    await load();
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const onMint = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/beta/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, note }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Couldn't mint codes.");
        return;
      }
      const made = (await res.json()) as BetaInvite[];
      toast.success(`Minted ${made.length} code${made.length === 1 ? "" : "s"}.`);
      setNote("");
      setCount(1);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (code: string) => {
    if (!confirm(`Revoke ${code}?`)) return;
    const res = await fetch(`/api/admin/beta/codes/${code}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error || "Couldn't revoke.");
      return;
    }
    toast.success("Revoked.");
    await refresh();
  };

  const onCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — copy it manually.");
    }
  };

  const unused = invites.filter((i) => !i.usedAt);
  const used = invites.filter((i) => i.usedAt);

  return (
    <div className="pb-welcome pb-admin-page">
      <div className="pb-topbar" aria-hidden />
      <header className="pb-welcome-header">
        <WordMark asLink />
        <nav className="pb-welcome-nav" aria-label="Admin">
          <Link href="/admin" className="pb-nav-link">Dashboard</Link>
          <span className="pb-admin-pill">ADMIN</span>
        </nav>
      </header>

      <main id="main" className="pb-welcome-main">
        <p className="pb-legal-updated">Admin · Beta access</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Invite <span className="pb-emph">testers</span>
        </h1>
        <hr className="pb-welcome-rule" />

        <section style={{ marginBottom: "3rem" }}>
          <h2 className="pb-admin-card-title" style={{ marginBottom: "1rem" }}>
            Mint codes
          </h2>
          <form onSubmit={onMint} className="pb-form-stack">
            <label className="pb-action-label" htmlFor="mint-count">
              How many?
            </label>
            <input
              id="mint-count"
              type="number"
              min={1}
              max={50}
              className="pb-input"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
              style={{ maxWidth: "8rem" }}
            />
            <label
              className="pb-action-label"
              htmlFor="mint-note"
              style={{ marginTop: "1.25rem" }}
            >
              Note (optional)
            </label>
            <input
              id="mint-note"
              type="text"
              className="pb-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. friends batch, twitter wave 1"
              style={{ maxWidth: "32rem" }}
            />
            <div className="pb-action-row">
              <button type="submit" disabled={busy} className="pb-action-btn">
                {busy ? "Minting…" : "Mint codes"}
              </button>
            </div>
          </form>
        </section>

        <hr className="pb-welcome-rule" />

        <section style={{ marginBottom: "3rem" }}>
          <h2 className="pb-admin-card-title" style={{ marginBottom: "1rem" }}>
            Unused codes <span style={{ color: "var(--pb-text-soft)", fontWeight: 400 }}>({unused.length})</span>
          </h2>
          {loading ? (
            <p className="pb-admin-card-body">Loading…</p>
          ) : unused.length === 0 ? (
            <p className="pb-admin-card-body">No unused codes. Mint some above.</p>
          ) : (
            <table className="pb-admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Note</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {unused.map((inv) => (
                  <tr key={inv.code}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onCopy(inv.code)}
                        className="pb-shuffle"
                        style={{
                          fontFamily:
                            '"SF Mono","JetBrains Mono","Menlo","Consolas",monospace',
                          fontSize: "1rem",
                          letterSpacing: "0.08em",
                          color: "var(--pb-text)",
                          textDecoration: "none",
                        }}
                        title="Copy"
                      >
                        {inv.code}
                      </button>
                    </td>
                    <td style={{ color: "var(--pb-text-soft)" }}>
                      {inv.note ?? "—"}
                    </td>
                    <td>{new Date(inv.createdAt).toISOString().slice(0, 10)}</td>
                    <td>
                      <button
                        type="button"
                        className="pb-shuffle"
                        onClick={() => onRevoke(inv.code)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="pb-admin-card-title" style={{ marginBottom: "1rem" }}>
            Used codes <span style={{ color: "var(--pb-text-soft)", fontWeight: 400 }}>({used.length})</span>
          </h2>
          {used.length === 0 ? (
            <p className="pb-admin-card-body">Nothing yet.</p>
          ) : (
            <table className="pb-admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Used by</th>
                  <th>Used on</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {used.map((inv) => (
                  <tr key={inv.code}>
                    <td
                      style={{
                        fontFamily:
                          '"SF Mono","JetBrains Mono","Menlo","Consolas",monospace',
                        color: "var(--pb-text-soft)",
                      }}
                    >
                      {inv.code}
                    </td>
                    <td>{inv.usedBy ?? "—"}</td>
                    <td>{new Date(inv.usedAt!).toISOString().slice(0, 10)}</td>
                    <td style={{ color: "var(--pb-text-soft)" }}>
                      {inv.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

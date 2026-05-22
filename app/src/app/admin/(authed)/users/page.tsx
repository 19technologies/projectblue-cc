"use client";

import { WordMark } from "@/components/BrandMark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PublicUser {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/users");
      setUsers((await res.json()) as PublicUser[]);
    } catch {
      toast.error("Couldn't load users.");
    } finally {
      setLoading(false);
    }
  };
  const refresh = async () => {
    setLoading(true);
    await load();
  };
  useEffect(() => {
    // load() sets state only after awaiting fetch — fetch-on-mount, allowed pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Couldn't create user.");
        return;
      }
      toast.success("User created.");
      setEmail("");
      setPassword("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string, em: string) => {
    if (!confirm(`Delete ${em}?`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error || "Couldn't delete user.");
      return;
    }
    toast.success("User deleted.");
    await refresh();
  };

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
        <p className="pb-legal-updated">Admin · Users</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Who can <span className="pb-emph">edit</span>?
        </h1>
        <hr className="pb-welcome-rule" />

        <section style={{ marginBottom: "3rem" }}>
          <h2 className="pb-admin-card-title" style={{ marginBottom: "1rem" }}>
            Existing users
          </h2>
          {loading ? (
            <p className="pb-admin-card-body">Loading…</p>
          ) : users.length === 0 ? (
            <p className="pb-admin-card-body">No users yet.</p>
          ) : (
            <table className="pb-admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.isAdmin ? "Admin" : "User"}</td>
                    <td>{new Date(u.createdAt).toISOString().slice(0, 10)}</td>
                    <td>
                      <button
                        type="button"
                        className="pb-shuffle"
                        onClick={() => onDelete(u.id, u.email)}
                      >
                        Delete
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
            Add a user
          </h2>
          <form onSubmit={onCreate} className="pb-form-stack">
            <label className="pb-action-label" htmlFor="new-email">Email</label>
            <input
              id="new-email"
              type="email"
              className="pb-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="someone@example.com"
            />
            <label className="pb-action-label" htmlFor="new-password" style={{ marginTop: "1.25rem" }}>
              Password
            </label>
            <input
              id="new-password"
              type="password"
              className="pb-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
            />
            <div className="pb-action-row">
              <button type="submit" disabled={busy} className="pb-action-btn">
                {busy ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

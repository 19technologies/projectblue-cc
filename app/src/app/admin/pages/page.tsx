"use client";

import { WordMark } from "@/components/BrandMark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PageSummary {
  id: string;
  slug: string;
  kind: "blog" | "doc";
  title: string;
  excerpt?: string;
  updatedAt: string;
}

export default function AdminPagesPage() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pages");
      setPages((await res.json()) as PageSummary[]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    const res = await fetch(`/api/admin/pages/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error || "Couldn't delete.");
      return;
    }
    toast.success("Page deleted.");
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
        <p className="pb-legal-updated">Admin · Pages</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Blog &amp; <span className="pb-emph">docs</span>
        </h1>
        <hr className="pb-welcome-rule" />

        <div className="pb-action-row" style={{ marginTop: 0, marginBottom: "2rem" }}>
          <Link
            href="/admin/pages/new?kind=blog"
            className="pb-action-btn"
            style={{ textDecoration: "none" }}
          >
            New blog post
          </Link>
          <Link
            href="/admin/pages/new?kind=doc"
            className="pb-action-btn pb-action-btn-secondary"
            style={{ textDecoration: "none" }}
          >
            New doc
          </Link>
        </div>

        {loading ? (
          <p className="pb-admin-card-body">Loading…</p>
        ) : pages.length === 0 ? (
          <p className="pb-admin-card-body">No pages yet.</p>
        ) : (
          <table className="pb-admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Kind</th>
                <th>Slug</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/pages/${p.id}`} className="pb-footer-link">
                      {p.title}
                    </Link>
                  </td>
                  <td>{p.kind === "blog" ? "Blog" : "Doc"}</td>
                  <td>
                    <code style={{ fontSize: "0.85rem" }}>
                      /{p.kind}/{p.slug}
                    </code>
                  </td>
                  <td>{new Date(p.updatedAt).toISOString().slice(0, 10)}</td>
                  <td>
                    <button
                      type="button"
                      className="pb-shuffle"
                      onClick={() => onDelete(p.id, p.title)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

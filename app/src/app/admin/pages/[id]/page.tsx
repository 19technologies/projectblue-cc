"use client";

import { WordMark } from "@/components/BrandMark";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface CMSPage {
  id: string;
  slug: string;
  kind: "blog" | "doc";
  title: string;
  body: string;
  excerpt?: string;
  updatedAt: string;
}

export default function AdminEditPagePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState<CMSPage | null>(null);
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");

  useEffect(() => {
    fetch(`/api/admin/pages/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CMSPage | null) => {
        if (!data) return;
        setPage(data);
        setSlug(data.slug);
        setExcerpt(data.excerpt ?? "");
      });
  }, [id]);

  const onSave = async ({ title, body }: { title: string; body: string }) => {
    const res = await fetch(`/api/admin/pages/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, slug, excerpt }),
    });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error || "Couldn't save.");
      return;
    }
    const updated = (await res.json()) as CMSPage;
    setPage(updated);
    setSlug(updated.slug);
    toast.success("Saved.");
  };

  const onDelete = async () => {
    if (!page || !confirm(`Delete "${page.title}"?`)) return;
    const res = await fetch(`/api/admin/pages/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't delete.");
      return;
    }
    toast.success("Deleted.");
    router.push("/admin/pages");
  };

  return (
    <div className="pb-welcome pb-admin-page">
      <div className="pb-topbar" aria-hidden />
      <header className="pb-welcome-header">
        <WordMark asLink />
        <nav className="pb-welcome-nav" aria-label="Admin">
          <Link href="/admin/pages" className="pb-nav-link">Pages</Link>
          <span className="pb-admin-pill">ADMIN</span>
        </nav>
      </header>

      <main id="main" className="pb-welcome-main">
        <p className="pb-legal-updated">
          Admin · Edit {page ? (page.kind === "blog" ? "blog post" : "doc") : "page"}
        </p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Edit <span className="pb-emph">{page?.title ?? id}</span>
        </h1>
        <hr className="pb-welcome-rule" />

        {!page ? (
          <p className="pb-admin-card-body">Loading…</p>
        ) : (
          <>
            <div className="pb-form-stack" style={{ marginBottom: "1.5rem" }}>
              <label className="pb-action-label" htmlFor="page-slug">Slug</label>
              <input
                id="page-slug"
                type="text"
                className="pb-input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                style={{ maxWidth: "40rem" }}
              />
              <p className="pb-admin-card-body" style={{ marginTop: "0.4rem" }}>
                Public URL · <code>/{page.kind}/{slug}</code>
              </p>
              <label
                className="pb-action-label"
                htmlFor="page-excerpt"
                style={{ marginTop: "1.25rem" }}
              >
                Excerpt
              </label>
              <input
                id="page-excerpt"
                type="text"
                className="pb-input"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                style={{ maxWidth: "40rem" }}
              />
            </div>

            <MarkdownEditor
              key={page.id}
              initialTitle={page.title}
              initialBody={page.body}
              saveLabel="Save changes"
              onSave={onSave}
              showTitle
            />

            <hr className="pb-welcome-rule" style={{ marginTop: "3rem" }} />
            <button type="button" onClick={onDelete} className="pb-shuffle">
              Delete this {page.kind === "blog" ? "post" : "doc"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}

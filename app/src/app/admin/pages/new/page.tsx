"use client";

import { WordMark } from "@/components/BrandMark";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

export default function AdminNewPagePage() {
  return (
    <Suspense fallback={null}>
      <AdminNewPageInner />
    </Suspense>
  );
}

function AdminNewPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const kindParam = params.get("kind");
  const kind = kindParam === "doc" ? "doc" : "blog";
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");

  const onSave = async ({ title, body }: { title: string; body: string }) => {
    if (!title) {
      toast.error("Title is required.");
      return;
    }
    const res = await fetch("/api/admin/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, body, slug, excerpt }),
    });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error || "Couldn't create page.");
      return;
    }
    const created = (await res.json()) as { id: string };
    toast.success("Page created.");
    router.push(`/admin/pages/${created.id}`);
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
          Admin · New {kind === "blog" ? "blog post" : "doc"}
        </p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Write something <span className="pb-emph">new</span>
        </h1>
        <hr className="pb-welcome-rule" />

        <div className="pb-form-stack" style={{ marginBottom: "1.5rem" }}>
          <label className="pb-action-label" htmlFor="page-slug">Slug (optional)</label>
          <input
            id="page-slug"
            type="text"
            className="pb-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="leave blank to derive from title"
            style={{ maxWidth: "40rem" }}
          />
          <label
            className="pb-action-label"
            htmlFor="page-excerpt"
            style={{ marginTop: "1.25rem" }}
          >
            Excerpt (optional)
          </label>
          <input
            id="page-excerpt"
            type="text"
            className="pb-input"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="One-line summary shown on the index"
            style={{ maxWidth: "40rem" }}
          />
        </div>

        <MarkdownEditor
          initialTitle=""
          initialBody=""
          saveLabel="Publish"
          onSave={onSave}
          showTitle
        />
      </main>
    </div>
  );
}

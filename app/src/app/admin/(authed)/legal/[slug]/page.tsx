"use client";

import { AdminNav } from "@/components/AdminNav";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface LegalDoc {
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
}

export default function AdminLegalEditPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/legal/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LegalDoc | null) => {
        if (cancelled) return;
        if (!data) setError("Couldn't load.");
        else setDoc(data);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onSave = async (next: { title: string; body: string }) => {
    const res = await fetch(`/api/admin/legal/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      toast.error("Couldn't save.");
      return;
    }
    toast.success("Saved. Live within a minute.");
    router.refresh();
  };

  return (
    <div className="pb-welcome pb-admin-page">
      <div className="pb-topbar" aria-hidden />
      <AdminNav page="Edit" />

      <main id="main" className="pb-welcome-main">
        <p className="pb-legal-updated">Admin · Edit</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Edit <span className="pb-emph">{doc?.title ?? slug}</span>
        </h1>
        <hr className="pb-welcome-rule" />

        {error && <p className="pb-admin-card-body">{error}</p>}
        {!doc && !error && <p className="pb-admin-card-body">Loading…</p>}
        {doc && (
          <MarkdownEditor
            initialTitle={doc.title}
            initialBody={doc.body}
            saveLabel="Save & publish"
            onSave={onSave}
            showTitle
          />
        )}
      </main>
    </div>
  );
}

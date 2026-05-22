"use client";

import { WordMark } from "@/components/BrandMark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Branding {
  line1: string;
  line2: string;
  hasImage: boolean;
}

export default function AdminBrandingPage() {
  const [line1, setLine1] = useState("PROJECT");
  const [line2, setLine2] = useState("BLUE");
  const [hasImage, setHasImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Cache-buster so the preview <img> refreshes after an upload.
  const [imgVersion, setImgVersion] = useState(0);

  const load = async () => {
    try {
      const res = await fetch("/api/branding");
      const b = (await res.json()) as Branding;
      setLine1(b.line1);
      setLine2(b.line2);
      setHasImage(b.hasImage);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const onSaveText = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line1, line2 }),
      });
      if (!res.ok) {
        toast.error("Couldn't save.");
        return;
      }
      toast.success("Word-mark saved.");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // strip the "data:...;base64," prefix
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/admin/branding/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, base64 }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Upload failed.");
        return;
      }
      toast.success("Logo uploaded.");
      setHasImage(true);
      setImgVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };

  const onRemoveImage = async () => {
    if (!confirm("Remove the image logo and fall back to the text word-mark?")) return;
    const res = await fetch("/api/admin/branding/logo", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't remove.");
      return;
    }
    toast.success("Image removed.");
    setHasImage(false);
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
        <p className="pb-legal-updated">Admin · Branding</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          The <span className="pb-emph">word-mark</span>
        </h1>
        <hr className="pb-welcome-rule" />

        {loading ? (
          <p className="pb-admin-card-body">Loading…</p>
        ) : (
          <>
            <section style={{ marginBottom: "3rem" }}>
              <h2 className="pb-admin-card-title" style={{ marginBottom: "1rem" }}>
                Text word-mark
              </h2>
              <p className="pb-admin-card-body" style={{ marginBottom: "1.5rem", maxWidth: "32rem" }}>
                Two stacked lines, set in Archivo 800. Used everywhere unless an
                image logo is uploaded below.
              </p>
              <form onSubmit={onSaveText} className="pb-form-stack">
                <label className="pb-action-label" htmlFor="b-line1">Line one</label>
                <input
                  id="b-line1"
                  type="text"
                  className="pb-input"
                  value={line1}
                  maxLength={24}
                  onChange={(e) => setLine1(e.target.value)}
                  style={{ maxWidth: "20rem" }}
                />
                <label className="pb-action-label" htmlFor="b-line2" style={{ marginTop: "1.25rem" }}>
                  Line two
                </label>
                <input
                  id="b-line2"
                  type="text"
                  className="pb-input"
                  value={line2}
                  maxLength={24}
                  onChange={(e) => setLine2(e.target.value)}
                  style={{ maxWidth: "20rem" }}
                />
                <div className="pb-action-row">
                  <button type="submit" disabled={busy} className="pb-action-btn">
                    {busy ? "Saving…" : "Save word-mark"}
                  </button>
                </div>
              </form>
            </section>

            <hr className="pb-welcome-rule" />

            <section>
              <h2 className="pb-admin-card-title" style={{ marginBottom: "1rem" }}>
                Image logo {hasImage && <span style={{ color: "var(--pb-text-soft)", fontWeight: 400 }}>· active</span>}
              </h2>
              <p className="pb-admin-card-body" style={{ marginBottom: "1.5rem", maxWidth: "32rem" }}>
                Optional. PNG, SVG, WebP or JPEG, up to 512&nbsp;KB. When set, it
                replaces the text word-mark across the site.
              </p>

              {hasImage && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1.25rem",
                    border: "2px solid var(--pb-hairline)",
                    display: "inline-block",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/branding/logo?v=${imgVersion}`}
                    alt="Current logo"
                    style={{ height: "3rem", display: "block" }}
                  />
                </div>
              )}

              <div className="pb-form-stack">
                <label className="pb-action-label" htmlFor="b-logo">
                  {hasImage ? "Replace image" : "Upload image"}
                </label>
                <input
                  id="b-logo"
                  type="file"
                  accept="image/png,image/svg+xml,image/webp,image/jpeg"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file);
                    e.target.value = "";
                  }}
                  style={{ marginBottom: "1rem", color: "var(--pb-text-soft)" }}
                />
                {hasImage && (
                  <div>
                    <button type="button" onClick={onRemoveImage} className="pb-shuffle">
                      Remove image, use text word-mark
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

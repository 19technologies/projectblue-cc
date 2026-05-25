"use client";

import { AdminNav } from "@/components/AdminNav";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type LogoVariant = "light" | "dark" | "favicon-light" | "favicon-dark";

const LOGO_VARIANTS: { key: LogoVariant; label: string; desc: string }[] = [
  { key: "light", label: "Light mode", desc: "Shown in the top-left nav on light backgrounds. PNG, WebP or JPEG." },
  { key: "dark", label: "Dark mode", desc: "Shown in the top-left nav on dark backgrounds. PNG, WebP or JPEG." },
];

const FAVICON_VARIANTS: { key: LogoVariant; label: string; desc: string }[] = [
  { key: "favicon-light", label: "Light mode", desc: "Shown in the browser tab when the OS is in light mode. PNG, ICO or WebP." },
  { key: "favicon-dark", label: "Dark mode", desc: "Shown in the browser tab when the OS is in dark mode. PNG, ICO or WebP." },
];

interface Branding {
  line1: string;
  line2: string;
  logos: Partial<Record<LogoVariant, boolean>>;
  hasImage: boolean;
}

export default function AdminBrandingPage() {
  const [line1, setLine1] = useState("PROJECT");
  const [line2, setLine2] = useState("BLUE");
  const [logos, setLogos] = useState<Partial<Record<LogoVariant, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [imgVersions, setImgVersions] = useState<Partial<Record<LogoVariant, number>>>({});
  const [textDirty, setTextDirty] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/branding");
      const b = (await res.json()) as Branding;
      setLine1(b.line1);
      setLine2(b.line2);
      setLogos(b.logos ?? {});
    } finally {
      setLoading(false);
      setTextDirty(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const onSaveText = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line1, line2 }),
      });
      if (!res.ok) { toast.error("Couldn't save."); return; }
      toast.success("Word-mark saved.");
      setTextDirty(false);
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (variant: LogoVariant, file: File) => {
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).slice((reader.result as string).indexOf(",") + 1));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/admin/branding/logo/${variant}`, {
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
      setLogos((prev) => ({ ...prev, [variant]: true }));
      setImgVersions((prev) => ({ ...prev, [variant]: (prev[variant] ?? 0) + 1 }));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (variant: LogoVariant) => {
    if (!confirm(`Remove the ${variant} logo?`)) return;
    const res = await fetch(`/api/admin/branding/logo/${variant}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't remove."); return; }
    toast.success("Removed.");
    setLogos((prev) => ({ ...prev, [variant]: false }));
  };

  return (
    <div className="pb-welcome pb-admin-page">
      <div className="pb-topbar" aria-hidden />
      <AdminNav page="Branding" />

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
            {/* Text word-mark */}
            <section style={{ marginBottom: "3rem" }}>
              <h2 className="pb-admin-card-title" style={{ marginBottom: "1rem" }}>
                Text word-mark
              </h2>
              <p className="pb-admin-card-body" style={{ marginBottom: "1.5rem", maxWidth: "32rem" }}>
                Two stacked lines set in Archivo 800. Used when no image logo is uploaded for the current colour scheme.
              </p>
              <form onSubmit={onSaveText} className="pb-form-stack">
                <label className="pb-action-label" htmlFor="b-line1">Line one</label>
                <input
                  id="b-line1"
                  type="text"
                  className="pb-input"
                  value={line1}
                  maxLength={24}
                  onChange={(e) => { setLine1(e.target.value); setTextDirty(true); }}
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
                  onChange={(e) => { setLine2(e.target.value); setTextDirty(true); }}
                  style={{ maxWidth: "20rem" }}
                />
                <div className="pb-action-row" style={{ gap: "0.75rem" }}>
                  <button type="submit" disabled={busy || !textDirty} className="pb-action-btn">
                    {busy ? "Saving…" : "Save word-mark"}
                  </button>
                  {textDirty && (
                    <button
                      type="button"
                      className="pb-shuffle"
                      onClick={() => { void load(); }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>

            <hr className="pb-welcome-rule" />

            {/* Logo variants */}
            <section style={{ marginBottom: "3rem" }}>
              <h2 className="pb-admin-card-title" style={{ marginBottom: "0.5rem" }}>
                Logo image
              </h2>
              <p className="pb-admin-card-body" style={{ marginBottom: "2rem", maxWidth: "36rem" }}>
                Replaces the text word-mark in the top-left nav. Upload a light and/or dark
                version — the correct one is chosen automatically. Up to 512&nbsp;KB.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "1.5rem" }}>
                {LOGO_VARIANTS.map(({ key, label, desc }) => (
                  <div
                    key={key}
                    style={{
                      border: "1px solid var(--pb-hairline)",
                      borderRadius: "8px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.25rem" }}>{label}</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--pb-text-soft)" }}>{desc}</p>
                    </div>

                    {logos[key] && (
                      <div
                        style={{
                          padding: "0.75rem",
                          background: key.includes("light") ? "#f5f5f5" : "#0A0D1A",
                          border: "1px solid var(--pb-hairline)",
                          borderRadius: "6px",
                          display: "inline-flex",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/branding/logo/${key}?v=${imgVersions[key] ?? 0}`}
                          alt={`${label} logo`}
                          style={{ height: "2.5rem", display: "block" }}
                        />
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                      <label
                        htmlFor={`logo-${key}`}
                        className="pb-action-btn pb-action-btn-secondary"
                        style={{ cursor: "pointer", fontSize: "0.8rem", padding: "0.45rem 0.9rem" }}
                      >
                        {logos[key] ? "Replace" : "Upload"}
                      </label>
                      <input
                        id={`logo-${key}`}
                        type="file"
                        accept="image/png,image/svg+xml,image/webp,image/jpeg"
                        disabled={busy}
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void onUpload(key, file);
                          e.target.value = "";
                        }}
                      />
                      {logos[key] && (
                        <button
                          type="button"
                          className="pb-shuffle"
                          style={{ fontSize: "0.8rem", color: "var(--pb-text-soft)" }}
                          onClick={() => onRemove(key)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <hr className="pb-welcome-rule" />

            {/* Favicon variants */}
            <section style={{ marginBottom: "3rem" }}>
              <h2 className="pb-admin-card-title" style={{ marginBottom: "0.5rem" }}>
                Favicon
              </h2>
              <p className="pb-admin-card-body" style={{ marginBottom: "2rem", maxWidth: "36rem" }}>
                Appears in the browser tab and bookmarks. Upload a light and/or dark version —
                the correct one is picked automatically based on the visitor's OS preference.
                PNG, ICO or WebP, up to 512&nbsp;KB. Square images work best (32×32 or 64×64).
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "1.5rem" }}>
                {FAVICON_VARIANTS.map(({ key, label, desc }) => (
                  <div
                    key={key}
                    style={{
                      border: "1px solid var(--pb-hairline)",
                      borderRadius: "8px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.25rem" }}>{label}</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--pb-text-soft)" }}>{desc}</p>
                    </div>

                    {logos[key] && (
                      <div
                        style={{
                          padding: "0.75rem",
                          background: key === "favicon-light" ? "#f5f5f5" : "#0A0D1A",
                          border: "1px solid var(--pb-hairline)",
                          borderRadius: "6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/branding/logo/${key}?v=${imgVersions[key] ?? 0}`}
                          alt={`${label} favicon`}
                          style={{ width: "2rem", height: "2rem", objectFit: "contain", display: "block" }}
                        />
                        <span style={{ fontSize: "0.7rem", color: key === "favicon-light" ? "#555" : "#aaa" }}>
                          Browser tab preview
                        </span>
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                      <label
                        htmlFor={`favicon-${key}`}
                        className="pb-action-btn pb-action-btn-secondary"
                        style={{ cursor: "pointer", fontSize: "0.8rem", padding: "0.45rem 0.9rem" }}
                      >
                        {logos[key] ? "Replace" : "Upload"}
                      </label>
                      <input
                        id={`favicon-${key}`}
                        type="file"
                        accept="image/png,image/x-icon,image/webp,image/jpeg"
                        disabled={busy}
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void onUpload(key, file);
                          e.target.value = "";
                        }}
                      />
                      {logos[key] && (
                        <button
                          type="button"
                          className="pb-shuffle"
                          style={{ fontSize: "0.8rem", color: "var(--pb-text-soft)" }}
                          onClick={() => onRemove(key)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

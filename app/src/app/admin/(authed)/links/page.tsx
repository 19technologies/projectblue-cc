"use client";

import { AdminNav } from "@/components/AdminNav";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type LinkMap = Record<string, string>;

const KNOWN_SLOTS = [
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X" },
  { key: "discord", label: "Discord" },
];

export default function AdminLinksPage() {
  const [values, setValues] = useState<LinkMap>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/links")
      .then((r) => r.json())
      .then((data: LinkMap) => {
        if (!cancelled) setValues(data ?? {});
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = (key: string, v: string) =>
    setValues((p) => ({ ...p, [key]: v }));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Couldn't save.");
        return;
      }
      toast.success("Links saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-welcome pb-admin-page">
      <div className="pb-topbar" aria-hidden />
      <AdminNav page="Links" />

      <main id="main" className="pb-welcome-main">
        <p className="pb-legal-updated">Admin · Links</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Public <span className="pb-emph">footer</span> links
        </h1>
        <hr className="pb-welcome-rule" />

        {loading ? (
          <p className="pb-admin-card-body">Loading…</p>
        ) : (
          <form onSubmit={onSave} className="pb-form-stack">
            {KNOWN_SLOTS.map(({ key, label }) => (
              <div key={key} style={{ marginBottom: "1.5rem" }}>
                <label className="pb-action-label" htmlFor={`link-${key}`}>
                  {label}
                </label>
                <input
                  id={`link-${key}`}
                  type="url"
                  inputMode="url"
                  className="pb-input"
                  value={values[key] ?? ""}
                  onChange={(e) => onChange(key, e.target.value)}
                  placeholder={`https://${key}.com/projectbluecc`}
                  style={{ maxWidth: "32rem" }}
                />
              </div>
            ))}

            <p
              className="pb-admin-card-body"
              style={{ maxWidth: "32rem", marginTop: "0.5rem" }}
            >
              Leave a field blank to hide that social link from the public
              footer. Saves are live within a minute.
            </p>

            <div className="pb-action-row">
              <button type="submit" disabled={busy} className="pb-action-btn">
                {busy ? "Saving…" : "Save links"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

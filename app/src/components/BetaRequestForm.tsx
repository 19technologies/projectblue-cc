"use client";

import { useState } from "react";
import { toast } from "sonner";

export const BetaRequestForm = () => {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Enter a real email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/beta/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error || "Couldn't send request.");
        return;
      }
      setSubmitted(true);
      toast.success("On the list. We'll be in touch.");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <p className="pb-beta-prompt">
        On the list. We&apos;ll send your invite code when a spot opens.
      </p>
    );
  }

  if (!expanded) {
    return (
      <p className="pb-beta-prompt">
        Project Blue is in private beta.{" "}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="pb-shuffle"
        >
          Request access
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="pb-form-stack pb-beta-form">
      <label className="pb-action-label" htmlFor="beta-email">
        Your email
      </label>
      <input
        id="beta-email"
        type="email"
        autoComplete="email"
        className="pb-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ maxWidth: "28rem" }}
      />
      <label
        className="pb-action-label"
        htmlFor="beta-message"
        style={{ marginTop: "1.25rem" }}
      >
        Anything to say? (optional)
      </label>
      <input
        id="beta-message"
        type="text"
        className="pb-input"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="One line is plenty."
        style={{ maxWidth: "28rem" }}
      />
      <div className="pb-action-row">
        <button type="submit" disabled={busy} className="pb-action-btn">
          {busy ? "Sending…" : "Request invite"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="pb-shuffle"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

"use client";

import { marked } from "marked";
import { useMemo, useState } from "react";

interface MarkdownEditorProps {
  initialBody: string;
  initialTitle?: string;
  saveLabel?: string;
  onSave: (next: { title: string; body: string }) => Promise<void>;
  showTitle?: boolean;
  busy?: boolean;
}

export const MarkdownEditor = ({
  initialBody,
  initialTitle = "",
  saveLabel = "Save",
  onSave,
  showTitle = false,
  busy = false,
}: MarkdownEditorProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);

  const html = useMemo(
    () => marked.parse(body ?? "", { gfm: true }) as string,
    [body]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave({ title: title.trim(), body });
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || busy;

  return (
    <form onSubmit={onSubmit} className="pb-form-stack">
      {showTitle && (
        <>
          <label className="pb-action-label" htmlFor="md-title">Title</label>
          <input
            id="md-title"
            type="text"
            className="pb-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title"
            style={{ maxWidth: "40rem", marginBottom: "1.5rem" }}
          />
        </>
      )}

      <div className="pb-md-grid">
        <div>
          <label
            className="pb-action-label"
            htmlFor="md-body"
            style={{ marginBottom: "0.75rem" }}
          >
            Markdown
          </label>
          <textarea
            id="md-body"
            className="pb-md-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck
            rows={24}
          />
        </div>
        <div>
          <p className="pb-action-label" style={{ marginBottom: "0.75rem" }}>
            Preview
          </p>
          <div
            className="pb-md-preview pb-legal-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <div className="pb-action-row">
        <button type="submit" disabled={disabled} className="pb-action-btn">
          {submitting ? "Saving…" : saveLabel}
        </button>
      </div>
    </form>
  );
};

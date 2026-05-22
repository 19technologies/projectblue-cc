import { PublicShell } from "@/components/PublicShell";
import { LEGAL_SEED } from "@/lib/legalSeed";
import { renderMarkdown } from "@/lib/markdown";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules of using Project Blue.",
};

export default async function TermsPage() {
  // Once the admin/legal editor ships, swap LEGAL_SEED.terms for
  // `await getLegal("terms")` — same shape, KV-backed.
  const doc = LEGAL_SEED.terms;
  const html = renderMarkdown(doc.body);
  const updated = new Date(doc.updatedAt).toISOString().slice(0, 10);
  return (
    <PublicShell kicker={`Last updated · ${updated}`} title={doc.title}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </PublicShell>
  );
}

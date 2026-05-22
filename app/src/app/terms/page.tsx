import { PublicShell } from "@/components/PublicShell";
import { getLegal } from "@/lib/legal";
import { renderMarkdown } from "@/lib/markdown";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules of using Project Blue.",
};

export default async function TermsPage() {
  const doc = await getLegal("terms");
  const html = renderMarkdown(doc.body);
  const updated = new Date(doc.updatedAt).toISOString().slice(0, 10);
  return (
    <PublicShell kicker={`Last updated · ${updated}`} title={doc.title}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </PublicShell>
  );
}

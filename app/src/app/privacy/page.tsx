import { PublicShell } from "@/components/PublicShell";
import { getLegal } from "@/lib/legal";
import { renderMarkdown } from "@/lib/markdown";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How Project Blue handles your data.",
};

export default async function PrivacyPage() {
  const doc = await getLegal("privacy");
  const html = renderMarkdown(doc.body);
  const updated = new Date(doc.updatedAt).toISOString().slice(0, 10);
  return (
    <PublicShell kicker={`Last updated · ${updated}`} title={doc.title}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </PublicShell>
  );
}

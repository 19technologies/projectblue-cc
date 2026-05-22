import { PublicShell } from "@/components/PublicShell";
import { renderMarkdown } from "@/lib/markdown";
import { getPageBySlug } from "@/lib/pages";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug("doc", slug);
  if (!page) return { title: "Not found" };
  return { title: page.title, description: page.excerpt };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug("doc", slug);
  if (!page) notFound();
  const html = renderMarkdown(page.body);
  return (
    <PublicShell kicker="Docs" title={page.title}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </PublicShell>
  );
}

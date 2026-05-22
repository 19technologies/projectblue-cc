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
  const page = await getPageBySlug("blog", slug);
  if (!page) return { title: "Not found" };
  return { title: page.title, description: page.excerpt };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug("blog", slug);
  if (!page) notFound();
  const html = renderMarkdown(page.body);
  const updated = new Date(page.updatedAt).toISOString().slice(0, 10);
  return (
    <PublicShell kicker={`Blog · ${updated}`} title={page.title}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </PublicShell>
  );
}

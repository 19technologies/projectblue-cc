import { WordMark } from "@/components/BrandMark";
import { LEGAL_SLUGS, getLegal } from "@/lib/legal";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminLegalPage() {
  const docs = await Promise.all(LEGAL_SLUGS.map((s) => getLegal(s)));
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
        <p className="pb-legal-updated">Admin · Legal</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          Terms &amp; <span className="pb-emph">Privacy</span>
        </h1>
        <hr className="pb-welcome-rule" />

        <div className="pb-admin-grid">
          {docs.map((doc) => (
            <article key={doc.slug} className="pb-admin-card">
              <h2 className="pb-admin-card-title">{doc.title}</h2>
              <p className="pb-admin-card-body">
                Last updated{" "}
                {new Date(doc.updatedAt).toISOString().slice(0, 10)}.
              </p>
              <div>
                <Link
                  href={`/admin/legal/${doc.slug}`}
                  className="pb-action-btn pb-action-btn-secondary"
                  style={{ textDecoration: "none" }}
                >
                  Edit
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

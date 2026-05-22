import { WordMark } from "@/components/BrandMark";
import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <div className="pb-welcome pb-admin-page">
      <div className="pb-topbar" aria-hidden />

      <header className="pb-welcome-header">
        <WordMark asLink />
        <nav className="pb-welcome-nav" aria-label="Admin">
          <span className="pb-admin-pill">ADMIN</span>
          <form action="/api/admin/logout" method="post" style={{ display: "inline" }}>
            <button
              type="submit"
              className="pb-nav-link"
              style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <main id="main" className="pb-welcome-main">
        <p className="pb-legal-updated">Dashboard</p>
        <h1 className="pb-welcome-headline pb-legal-title">
          What needs <span className="pb-emph">editing</span>?
        </h1>
        <hr className="pb-welcome-rule" />

        <div className="pb-admin-grid">
          <AdminCard
            title="Beta access"
            body="Mint single-use invite codes for beta testers and review who's redeemed what."
            cta="Manage beta"
            href="/admin/beta"
          />
          <AdminCard
            title="Users"
            body="Add admin users and revoke access. Passwords are PBKDF2-hashed."
            cta="Manage users"
            href="/admin/users"
          />
          <AdminCard
            title="Branding"
            body="Edit the Project Blue word-mark text, or upload an image logo to override it."
            cta="Edit branding"
            href="/admin/branding"
          />
          <AdminCard
            title="Links"
            body="Edit the social links shown in the public footer — Instagram, X, Discord."
            cta="Manage links"
            href="/admin/links"
          />
          <AdminCard
            title="Terms & Privacy"
            body="Edit the live Terms and Privacy notice. Changes go live within a minute."
            cta="Edit legal"
            href="/admin/legal"
          />
          <AdminCard
            title="Blog & Docs"
            body="Create, edit and remove blog posts and docs pages."
            cta="Manage pages"
            href="/admin/pages"
          />
        </div>
      </main>
    </div>
  );
}

function AdminCard({
  title,
  body,
  cta,
  href,
  soon,
}: {
  title: string;
  body: string;
  cta: string;
  href?: string;
  soon?: boolean;
}) {
  const button = soon ? (
    <span
      className="pb-action-btn pb-action-btn-secondary"
      aria-disabled
      style={{ opacity: 0.55, cursor: "not-allowed" }}
    >
      {cta} · soon
    </span>
  ) : (
    <Link
      href={href ?? "#"}
      className="pb-action-btn pb-action-btn-secondary"
      style={{ textDecoration: "none" }}
    >
      {cta}
    </Link>
  );
  return (
    <article className="pb-admin-card">
      <h2 className="pb-admin-card-title">{title}</h2>
      <p className="pb-admin-card-body">{body}</p>
      <div>{button}</div>
    </article>
  );
}

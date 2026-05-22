import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

interface PublicShellProps {
  kicker?: string;
  title: ReactNode;
  children: ReactNode;
}

/**
 * Shared chrome for non-welcome public pages: /signin, /signup,
 * /forgot-password, /terms, /privacy, /blog, /docs, single posts/docs.
 *
 * Welcome uses its own shell because it owns the headline scale.
 */
export const PublicShell = ({ kicker, title, children }: PublicShellProps) => {
  return (
    <div className="pb-welcome">
      <div className="pb-topbar" aria-hidden />
      <Header />

      <main id="main" className="pb-welcome-main pb-legal">
        {kicker && <p className="pb-legal-updated">{kicker}</p>}
        <h1 className="pb-welcome-headline pb-legal-title">{title}</h1>
        <hr className="pb-welcome-rule" />
        <div className="pb-legal-body">{children}</div>
      </main>

      <Footer />
    </div>
  );
};

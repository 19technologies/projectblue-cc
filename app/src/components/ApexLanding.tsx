import { BetaRequestForm } from "./BetaRequestForm";
import { WordMark } from "./BrandMark";
import { Footer } from "./Footer";

/**
 * The projectblue.cc apex during the private beta. Deliberately minimal —
 * word-mark, a single line saying we're in beta, and the request-access
 * form. The real app lives on beta.projectblue.cc behind the invite gate.
 */
export const ApexLanding = () => {
  return (
    <div className="pb-welcome">
      <div className="pb-topbar" aria-hidden />

      <header className="pb-welcome-header">
        <WordMark />
      </header>

      <main id="main" className="pb-welcome-main">
        <h1 className="pb-welcome-headline">
          We&apos;re in <span className="pb-emph">beta testing</span>.
        </h1>
        <p
          className="pb-legal-body"
          style={{ color: "var(--pb-text-soft)", maxWidth: "32rem", marginBottom: "1rem" }}
        >
          Project Blue lets people listen to the same audio in sync, wherever
          they are. It&apos;s not open to everyone yet — request access and
          we&apos;ll send you an invite code.
        </p>

        <BetaRequestForm />
      </main>

      <Footer />
    </div>
  );
};

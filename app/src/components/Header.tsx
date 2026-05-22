import Link from "next/link";
import { WordMark } from "./BrandMark";

interface HeaderProps {
  brandAsLink?: boolean;
}

export const Header = ({ brandAsLink = true }: HeaderProps) => {
  return (
    <header className="pb-welcome-header">
      <WordMark asLink={brandAsLink} />
      <nav className="pb-welcome-nav" aria-label="Account">
        <Link href="/signin" className="pb-nav-link">
          Sign in
        </Link>
        <Link href="/signup" className="pb-nav-link pb-nav-link-primary">
          Create account
        </Link>
      </nav>
    </header>
  );
};

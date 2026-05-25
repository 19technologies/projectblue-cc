import { WordMark } from "./BrandMark";

interface HeaderProps {
  brandAsLink?: boolean;
}

export const Header = ({ brandAsLink = true }: HeaderProps) => {
  return (
    <header className="pb-welcome-header">
      <WordMark asLink={brandAsLink} />
    </header>
  );
};

/**
 * gov.uk-style phase banner. A thin strip under the header that marks the
 * whole service as beta. Shown on public pages (welcome, terms, privacy,
 * blog, docs) — not on admin or the beta gate (those are obviously beta).
 */
export const BetaBanner = () => {
  return (
    <div className="pb-phase-banner">
      <div className="pb-phase-banner-inner">
        <span className="pb-phase-tag">BETA</span>
        <span className="pb-phase-text">
          Project Blue is in beta testing — expect rough edges, and tell us
          what breaks.
        </span>
      </div>
    </div>
  );
};

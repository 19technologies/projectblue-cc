import { ApexLanding } from "@/components/ApexLanding";
import { BetaGate } from "@/components/BetaGate";
import { Welcome } from "@/components/Welcome";
import { betaSessionOptions, type BetaSession } from "@/lib/sessions";
import { getIronSession } from "iron-session";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * The home route is host-aware (replaces what proxy.ts would have done):
 *
 *   beta.projectblue.cc  + valid invite cookie  → the full app (Welcome)
 *   beta.projectblue.cc  + no cookie            → the invite gate
 *   projectblue.cc (apex) / anything else       → the minimal beta landing
 *
 * This is the hard gate: on the beta host, the app itself is never rendered
 * without a redeemed invite.
 */
export default async function HomePage() {
  const host = (await headers()).get("host") ?? "";
  const isBetaHost = host.startsWith("beta.");

  if (!isBetaHost) {
    return <ApexLanding />;
  }

  const session = await getIronSession<BetaSession>(
    await cookies(),
    betaSessionOptions
  );
  if (!session.code) {
    return <BetaGate />;
  }

  return <Welcome />;
}

import { ApexLanding } from "@/components/ApexLanding";
import { Welcome } from "@/components/Welcome";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const host = (await headers()).get("host") ?? "";
  if (!host.startsWith("beta.")) return <ApexLanding />;
  return <Welcome />;
}

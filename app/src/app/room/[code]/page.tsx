import { Room } from "@/components/Room";
import { ROOM_CODE_REGEX } from "@/lib/roomCode";
import { betaSessionOptions, type BetaSession } from "@/lib/sessions";
import { getIronSession } from "iron-session";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  return { title: `Room ${code.toUpperCase()}` };
}

export default async function RoomPage({ params }: Props) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  if (!ROOM_CODE_REGEX.test(code)) notFound();

  // Gate the room on the beta host so testers must come through /beta.
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("beta.")) {
    const session = await getIronSession<BetaSession>(
      await cookies(),
      betaSessionOptions
    );
    if (!session.code) redirect("/beta");
  }

  return <Room code={code} />;
}

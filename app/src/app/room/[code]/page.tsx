import { Room } from "@/components/Room";
import { ROOM_CODE_REGEX } from "@/lib/roomCode";
import { notFound } from "next/navigation";

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
  return <Room code={code} />;
}

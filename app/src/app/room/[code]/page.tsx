import RoomShell from "@/components/RoomShell";
import { ROOM_CODE_REGEX } from "@/lib/roomCode";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  return { title: `Room ${code.toUpperCase()}` };
}

// The beta gate runs as a zero-JS redirect in next.config.ts. The page
// itself is intentionally tiny: a dynamic param, a regex check, and a
// client-only shell. Anything heavier and a single 6-char path lookup
// could exceed the Worker CPU budget (Error 1102).
export default async function RoomPage({ params }: Props) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  if (!ROOM_CODE_REGEX.test(code)) notFound();
  return <RoomShell code={code} />;
}

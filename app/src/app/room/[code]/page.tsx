import { PublicShell } from "@/components/PublicShell";
import { ROOM_CODE_REGEX } from "@/lib/roomCode";
import { notFound } from "next/navigation";

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

  return (
    <PublicShell
      kicker="Room"
      title={
        <>
          You&apos;re <span className="pb-emph">in</span>.
        </>
      }
    >
      <p>
        Room code:{" "}
        <code style={{ fontSize: "1.1rem", letterSpacing: "0.18em" }}>
          {code}
        </code>
      </p>
      <p>
        Synchronized listening is being wired up — for now this page just
        confirms the room exists. The real playback experience arrives in a
        later slice (WebSocket time sync, audio upload, scheduled play).
      </p>
      <p>
        Share the code with anyone you want listening with you. They&apos;ll
        land on the same page.
      </p>
    </PublicShell>
  );
}

import { getKV } from "./kv";

const CODE_KEY = (code: string) => `beta_invite:${code}`;
const INDEX = "beta_invite:_index";

export interface BetaInvite {
  code: string;
  createdAt: string;
  /** Optional note set by admin when minting (e.g. tester's name/email). */
  note?: string;
  /** When the code was consumed, if ever. */
  usedAt?: string;
  /** Free-form identifier the gate page collected from the user. */
  usedBy?: string;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // ambiguity-free

function generate(): string {
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 7)}-${out.slice(7, 10)}`;
}

async function readIndex(): Promise<string[]> {
  return (await getKV().get<string[]>(INDEX)) ?? [];
}
async function writeIndex(codes: string[]): Promise<void> {
  await getKV().put<string[]>(INDEX, codes);
}

export async function listInvites(): Promise<BetaInvite[]> {
  const codes = await readIndex();
  const out: BetaInvite[] = [];
  for (const code of codes) {
    const inv = await getKV().get<BetaInvite>(CODE_KEY(code));
    if (inv) out.push(inv);
  }
  // Unused first, both groups newest-first.
  return out.sort((a, b) => {
    if (!!a.usedAt !== !!b.usedAt) return a.usedAt ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function getInvite(code: string): Promise<BetaInvite | null> {
  return getKV().get<BetaInvite>(CODE_KEY(code));
}

export async function createInvite(input?: { note?: string }): Promise<BetaInvite> {
  // Retry on the tiny chance of a collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generate();
    const existing = await getKV().get<BetaInvite>(CODE_KEY(code));
    if (existing) continue;
    const inv: BetaInvite = {
      code,
      createdAt: new Date().toISOString(),
      note: input?.note?.trim() || undefined,
    };
    await getKV().put<BetaInvite>(CODE_KEY(code), inv);
    await writeIndex([...(await readIndex()), code]);
    return inv;
  }
  throw new Error("Couldn't allocate a unique invite code");
}

export async function createInvitesBatch(
  count: number,
  note?: string
): Promise<BetaInvite[]> {
  if (count < 1 || count > 50) throw new Error("Batch must be 1–50 codes");
  const out: BetaInvite[] = [];
  for (let i = 0; i < count; i++) out.push(await createInvite({ note }));
  return out;
}

export async function deleteInvite(code: string): Promise<void> {
  await getKV().delete(CODE_KEY(code));
  await writeIndex((await readIndex()).filter((c) => c !== code));
}

/**
 * Atomically consume a code. Returns the invite on success, null if the code
 * is unknown or already used.
 */
export async function consumeInvite(
  code: string,
  usedBy: string
): Promise<BetaInvite | null> {
  const inv = await getInvite(code);
  if (!inv) return null;
  if (inv.usedAt) return null;
  const next: BetaInvite = {
    ...inv,
    usedAt: new Date().toISOString(),
    usedBy: usedBy.trim().slice(0, 200) || "unknown",
  };
  await getKV().put<BetaInvite>(CODE_KEY(code), next);
  return next;
}

import { getKV } from "./kv";

const KEY = (id: string) => `beta_request:${id}`;
const INDEX = "beta_request:_index";

export type RequestStatus = "pending" | "invited" | "declined";

export interface BetaRequest {
  id: string;
  email: string;
  message?: string;
  requestedAt: string;
  status: RequestStatus;
  /** When the admin marked it invited; lets us pair with a minted code by hand. */
  invitedAt?: string;
  /** Optional code we ended up minting for this request. */
  invitedCode?: string;
}

async function readIndex(): Promise<string[]> {
  return (await getKV().get<string[]>(INDEX)) ?? [];
}
async function writeIndex(ids: string[]): Promise<void> {
  await getKV().put<string[]>(INDEX, ids);
}

export async function listRequests(): Promise<BetaRequest[]> {
  const ids = await readIndex();
  const out: BetaRequest[] = [];
  for (const id of ids) {
    const r = await getKV().get<BetaRequest>(KEY(id));
    if (r) out.push(r);
  }
  // Pending first, then by recency.
  return out.sort((a, b) => {
    const aPending = a.status === "pending" ? 0 : 1;
    const bPending = b.status === "pending" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return b.requestedAt.localeCompare(a.requestedAt);
  });
}

export async function getRequest(id: string): Promise<BetaRequest | null> {
  return getKV().get<BetaRequest>(KEY(id));
}

/**
 * Idempotent on email: if the same email submits twice, we update the
 * existing record's `requestedAt` instead of creating a duplicate.
 */
export async function createOrTouchRequest(input: {
  email: string;
  message?: string;
}): Promise<BetaRequest> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Invalid email");

  const existing = (await listRequests()).find((r) => r.email === email);
  if (existing) {
    const next: BetaRequest = {
      ...existing,
      message: input.message?.trim() || existing.message,
      requestedAt: new Date().toISOString(),
    };
    await getKV().put<BetaRequest>(KEY(existing.id), next);
    return next;
  }

  const id = crypto.randomUUID();
  const req: BetaRequest = {
    id,
    email,
    message: input.message?.trim() || undefined,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };
  await getKV().put<BetaRequest>(KEY(id), req);
  await writeIndex([...(await readIndex()), id]);
  return req;
}

export async function updateRequestStatus(
  id: string,
  status: RequestStatus,
  invitedCode?: string
): Promise<BetaRequest> {
  const r = await getRequest(id);
  if (!r) throw new Error("Not found");
  const next: BetaRequest = {
    ...r,
    status,
    invitedAt: status === "invited" ? new Date().toISOString() : r.invitedAt,
    invitedCode: status === "invited" ? invitedCode ?? r.invitedCode : r.invitedCode,
  };
  await getKV().put<BetaRequest>(KEY(id), next);
  return next;
}

export async function deleteRequest(id: string): Promise<void> {
  await getKV().delete(KEY(id));
  await writeIndex((await readIndex()).filter((x) => x !== id));
}

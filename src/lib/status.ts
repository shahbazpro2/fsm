export const COOLDOWN_DAYS = Number(process.env.NEXT_PUBLIC_COOLDOWN_DAYS ?? 7);
export const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export type TokenStatus = "available" | "used" | "need_renew" | "expired";

export interface TokenLike {
  validUntil?: string | Date | null;
  lastUsedAt?: string | Date | null;
}

const toMs = (d?: string | Date | null) => (d ? new Date(d).getTime() : null);

/**
 * Status lifecycle rules:
 * 1. If token has been used (lastUsedAt !== null):
 *    - In cooldown period (lastUsedAt + COOLDOWN_MS > now):
 *      -> "used" (Cooldown)
 *    - Cooldown period completed (lastUsedAt + COOLDOWN_MS <= now):
 *      -> "need_renew" (Token consumed, needs new SMS/token for renewal)
 * 2. If token has NOT been used (lastUsedAt === null):
 *    - Checked for expiry only when adding/updating: if validUntil < now:
 *      -> "expired" (Not used till mentioned date)
 *    - Otherwise:
 *      -> "available" (Ready to be used)
 */
export function getStatus(t: TokenLike, now = Date.now()): {
  status: TokenStatus;
  nextAvailableAt: string | null;
} {
  const used = toMs(t.lastUsedAt);
  const valid = toMs(t.validUntil);

  if (used !== null) {
    if (used + COOLDOWN_MS > now) {
      return { status: "used", nextAvailableAt: new Date(used + COOLDOWN_MS).toISOString() };
    }
    // After cooldown period is completed, token needs renewal with a new token
    return { status: "need_renew", nextAvailableAt: null };
  }

  // Token has not been used: check expiry date
  if (valid !== null && valid < now) {
    return { status: "expired", nextAvailableAt: null };
  }

  return { status: "available", nextAvailableAt: null };
}

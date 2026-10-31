export const COOLDOWN_DAYS = Number(process.env.NEXT_PUBLIC_COOLDOWN_DAYS ?? 7);
export const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export type TokenStatus = "available" | "used" | "expired";

export interface TokenLike {
  validUntil?: string | Date | null;
  lastUsedAt?: string | Date | null;
}

const toMs = (d?: string | Date | null) => (d ? new Date(d).getTime() : null);

/**
 * Status rules:
 *  - used      → token was used less than COOLDOWN_DAYS ago (waiting to become valid again)
 *  - expired   → an SMS validity received after the last use has passed without being used
 *  - available → everything else (never used, or cooldown finished)
 */
export function getStatus(t: TokenLike, now = Date.now()): {
  status: TokenStatus;
  nextAvailableAt: string | null;
} {
  const used = toMs(t.lastUsedAt);
  const valid = toMs(t.validUntil);

  if (used !== null && used + COOLDOWN_MS > now) {
    return { status: "used", nextAvailableAt: new Date(used + COOLDOWN_MS).toISOString() };
  }
  if (valid !== null && valid < now && (used === null || valid > used)) {
    return { status: "expired", nextAvailableAt: null };
  }
  return { status: "available", nextAvailableAt: null };
}

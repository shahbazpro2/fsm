/**
 * Generates and validates the daily PIN.
 * Password changes every day because the date changes.
 * Suffix: "123321".
 *
 * Checks against both YYYYMMDD123321 (e.g. 20261031123321),
 * DDMMYYYY123321 (e.g. 31102026123321), and DD123321 (day of month, e.g. 31123321)
 * across today's date in Pakistan time (Asia/Karachi).
 */

const SUFFIX = "123321";
const TZ = "Asia/Karachi";

function getPktDateParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);

  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  return { day, month, year };
}

export function getExpectedPins(): string[] {
  // Allow today and yesterday (to handle timezone/midnight transition smoothly)
  const now = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const candidates: string[] = [];
  for (const dateObj of [now, yesterday]) {
    const { day, month, year } = getPktDateParts(dateObj);
    // YYYYMMDD123321 (e.g. 20261031123321)
    candidates.push(`${year}${month}${day}${SUFFIX}`);
    // DDMMYYYY123321 (e.g. 31102026123321)
    candidates.push(`${day}${month}${year}${SUFFIX}`);
    // DDMMYY123321 (e.g. 311026123321)
    candidates.push(`${day}${month}${year.slice(-2)}${SUFFIX}`);
    // DD123321 (e.g. 31123321)
    candidates.push(`${day}${SUFFIX}`);
  }
  return candidates;
}

import { NextRequest } from "next/server";

export function verifyPin(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const cleaned = input.trim();
  const valid = getExpectedPins();
  return valid.includes(cleaned);
}

export function isAuthenticated(req: NextRequest): boolean {
  const cookie = req.cookies.get("fsm_auth")?.value;
  if (cookie === "authenticated") return true;

  // Also support custom header for API clients or direct PIN header
  const pinHeader = req.headers.get("x-auth-pin");
  if (pinHeader && verifyPin(pinHeader)) return true;

  return false;
}

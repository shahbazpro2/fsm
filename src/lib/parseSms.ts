/**
 * Parser for government fuel-relief token SMS messages (Urdu).
 *
 * Sample:
 * آپ ٹوکن نمبر 7541879333 سے سواری نمبر NBK-11-2610 کے لیے 500 روپے کا فیول ریلیف
 * حاصل کر سکتے ہیں۔ یہ ٹوکن 22:39 02-Nov تک قابلِ استعمال ہے۔
 */

export interface ParsedToken {
  tokenNumber: string;
  vehicleNumber: string;
  amount: number | null;
  /** ISO string of the "valid until" moment (Pakistan time, UTC+5) */
  validUntil: string | null;
  /** Whether the message indicates this token was already used/availed */
  isAlreadyUsed?: boolean;
  /** ISO string of when next token can be generated if mentioned in SMS */
  nextAvailableAt?: string | null;
  raw: string;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Convert Urdu/Arabic-Indic digits to ASCII digits. */
function normalizeDigits(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function normalizeVehicle(v: string): string {
  return v.toUpperCase().replace(/\s+/g, "").replace(/[–—_]/g, "-");
}

/** Build a Date for "HH:mm DD-Mon" in Pakistan time, picking the closest year. */
function buildValidUntil(time: string, day: string, mon: string, now = new Date()): string | null {
  const m = MONTHS[mon.slice(0, 3).toLowerCase()];
  if (m === undefined) return null;
  const [hh, mm] = time.split(":").map(Number);
  const d = Number(day);
  const make = (year: number) => new Date(Date.UTC(year, m, d, hh - 5, mm));
  const year = now.getUTCFullYear();
  // choose year closest to now (handles Dec→Jan rollover)
  const candidates = [make(year - 1), make(year), make(year + 1)];
  candidates.sort(
    (a, b) => Math.abs(a.getTime() - now.getTime()) - Math.abs(b.getTime() - now.getTime())
  );
  return candidates[0].toISOString();
}

/** Parse a single SMS chunk. Returns null if no token number could be found. */
function parseOne(text: string): ParsedToken | null {
  const t = normalizeDigits(text);

  const token =
    t.match(/ٹوکن\s*نمبر\s*[:\-]?\s*(\d{6,})/)?.[1] ??
    t.match(/token\s*(?:no\.?|number|#)?\s*[:\-]?\s*(\d{6,})/i)?.[1] ??
    t.match(/\b(\d{8,})\b/)?.[1];
  if (!token) return null;

  const vehicle =
    t.match(/سواری\s*نمبر\s*[:\-]?\s*([A-Za-z0-9-]{3,20})/)?.[1] ??
    t.match(/\b([A-Za-z]{1,4}-?\d{1,4}-?\d{1,5})\b/)?.[1] ??
    "";

  const amountStr =
    t.match(/(\d[\d,]*)\s*روپے/)?.[1] ?? t.match(/(?:rs\.?|pkr)\s*(\d[\d,]*)/i)?.[1];
  const amount = amountStr ? Number(amountStr.replace(/,/g, "")) : null;

  const dt = t.match(/(\d{1,2}:\d{2})\s+(\d{1,2})[-\s/]([A-Za-z]{3,9})/);
  const validUntil = dt ? buildValidUntil(dt[1], dt[2], dt[3]) : null;

  // Check if message says relief was already availed ("حاصل کرلیا")
  const isAlreadyUsed = /حاصل\s*کر\s*لیا|حاصل\s*کیا|حاصل\s*کرلیا|utilized|availed|received/i.test(t);
  const nextTokenMatch = t.match(/اگلا\s*ٹوکن\s*(?:بنا\s*سکتے)?.*?(\d{1,2})[-\s/]([A-Za-z]{3,9})/i);
  let nextAvailableAt: string | null = null;
  if (nextTokenMatch) {
    nextAvailableAt = buildValidUntil("00:00", nextTokenMatch[1], nextTokenMatch[2]);
  }

  return {
    tokenNumber: token,
    vehicleNumber: normalizeVehicle(vehicle),
    amount,
    validUntil,
    isAlreadyUsed,
    nextAvailableAt,
    raw: text.trim(),
  };
}

/**
 * Parse one or many SMS messages pasted together.
 * Messages are split on each occurrence of "آپ ٹوکن" / blank lines.
 */
export function parseTokenSms(input: string): ParsedToken[] {
  if (!input?.trim()) return [];
  const chunks = input
    .split(/\n\s*\n|(?=آپ\s*ٹوکن\s*نمبر)/g)
    .map((c) => c.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: ParsedToken[] = [];
  for (const c of chunks) {
    const p = parseOne(c);
    if (p && !seen.has(p.tokenNumber)) {
      seen.add(p.tokenNumber);
      out.push(p);
    }
  }
  return out;
}

/** Quick check used for clipboard auto-detection. */
export function looksLikeTokenSms(text: string): boolean {
  return /ٹوکن\s*نمبر/.test(text) || (/fuel|token/i.test(text) && /\d{8,}/.test(text));
}

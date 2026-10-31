import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { parseTokenSms } from "@/lib/parseSms";

/**
 * Import one or more token SMS messages.
 * Body: { text: string, phoneNumber?: string, preview?: boolean }
 * - New token numbers are created.
 * - Existing token numbers get their validity / amount refreshed (token re-issued).
 * - Phone number is auto-filled from other tokens of the same vehicle if not supplied.
 */
export async function POST(req: NextRequest) {
  await dbConnect();
  const { text, phoneNumber, preview } = await req.json();
  const parsed = parseTokenSms(String(text ?? ""));
  if (parsed.length === 0) {
    return NextResponse.json({ error: "No token found in the message" }, { status: 400 });
  }

  const results = [];
  for (const p of parsed) {
    const existing = await Token.findOne({ tokenNumber: p.tokenNumber });
    let phone = String(phoneNumber ?? "").trim();
    if (!phone && p.vehicleNumber) {
      const sibling = await Token.findOne({ vehicleNumber: p.vehicleNumber, phoneNumber: { $ne: "" } }).lean();
      phone = sibling?.phoneNumber ?? "";
    }

    if (preview) {
      results.push({ ...p, phoneNumber: existing?.phoneNumber || phone, action: existing ? "update" : "create" });
      continue;
    }

    if (existing) {
      if (p.vehicleNumber) existing.vehicleNumber = p.vehicleNumber;
      if (p.amount !== null) existing.amount = p.amount;
      if (p.validUntil) existing.validUntil = new Date(p.validUntil);
      if (!existing.phoneNumber && phone) existing.phoneNumber = phone;
      existing.lastSms = p.raw;
      await existing.save();
      results.push({ action: "updated", token: serializeToken(existing) });
    } else {
      const doc = await Token.create({
        tokenNumber: p.tokenNumber,
        vehicleNumber: p.vehicleNumber || "UNKNOWN",
        phoneNumber: phone,
        amount: p.amount,
        validUntil: p.validUntil ? new Date(p.validUntil) : null,
        lastSms: p.raw,
      });
      results.push({ action: "created", token: serializeToken(doc) });
    }
  }
  return NextResponse.json({ results });
}

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { parseTokenSms } from "@/lib/parseSms";
import { getStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * Import one or more token SMS messages.
 * Body: { text: string, phoneNumber?: string, preview?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { text, phoneNumber, preview } = body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "No text provided in request" }, { status: 400 });
    }

    const parsed = parseTokenSms(text);
    if (!parsed || parsed.length === 0) {
      return NextResponse.json(
        { error: "Could not find a valid token number in the message. Check format." },
        { status: 400 }
      );
    }

    const results = [];
    for (const p of parsed) {
      let existing = await Token.findOne({ tokenNumber: p.tokenNumber });
      let phone = String(phoneNumber ?? "").trim();
      if (!phone && p.vehicleNumber) {
        const sibling = await Token.findOne({
          vehicleNumber: p.vehicleNumber,
          phoneNumber: { $ne: "" },
        }).lean();
        phone = sibling?.phoneNumber ?? "";
      }

      // If no token found by exact tokenNumber, check if there is an existing record
      // for the same vehicle (and phone) that is currently NOT active (used/cooldown or expired).
      // Requirement: "When again paste same number and vehicle number token sms need to update existing if already are not active"
      if (!existing && p.vehicleNumber) {
        const vehicleRegex = new RegExp(
          `^${p.vehicleNumber.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`,
          "i"
        );

        let candidate = null;
        if (phone) {
          candidate = await Token.findOne({
            vehicleNumber: vehicleRegex,
            phoneNumber: phone,
          }).sort({ updatedAt: -1 });
        }
        if (!candidate) {
          candidate = await Token.findOne({
            vehicleNumber: vehicleRegex,
          }).sort({ updatedAt: -1 });
        }

        if (candidate) {
          const statusInfo = getStatus(candidate);
          const isNotActive = statusInfo.status !== "available" || candidate.lastUsedAt != null;
          if (isNotActive) {
            existing = candidate;
          }
        }
      }

      if (preview) {
        results.push({
          ...p,
          phoneNumber: existing?.phoneNumber || phone,
          action: existing ? "update" : "create",
          isInactiveRenewal: existing && existing.tokenNumber !== p.tokenNumber,
        });
        continue;
      }

      if (existing) {
        // If updating an existing record whose tokenNumber differs, avoid collision with another doc
        if (existing.tokenNumber !== p.tokenNumber) {
          const duplicate = await Token.findOne({ tokenNumber: p.tokenNumber });
          if (duplicate && String(duplicate._id) !== String(existing._id)) {
            existing = duplicate;
          } else {
            existing.tokenNumber = p.tokenNumber;
          }
        }

        if (p.vehicleNumber) existing.vehicleNumber = p.vehicleNumber;
        if (p.amount !== null) existing.amount = p.amount;
        if (p.validUntil) existing.validUntil = new Date(p.validUntil);
        if (phone) existing.phoneNumber = phone;
        existing.lastSms = p.raw;

        if (p.isAlreadyUsed) {
          // If the imported SMS explicitly says relief was already availed:
          if (!existing.lastUsedAt) {
            existing.lastUsedAt = new Date();
            existing.usageHistory.push({
              usedAt: new Date(),
              amount: p.amount ?? existing.amount,
              note: "Marked used from SMS",
            });
          }
        } else {
          // The imported SMS is an active allocation ("حاصل کر سکتے ہیں").
          // If the token was previously inactive (marked used or expired), reactivate it!
          const statusInfo = getStatus(existing);
          if (statusInfo.status !== "available" || existing.lastUsedAt) {
            existing.lastUsedAt = null;
          }
        }

        await existing.save();
        results.push({ action: "updated", token: serializeToken(existing) });
      } else {
        const isUsed = !!p.isAlreadyUsed;
        const now = new Date();
        const doc = await Token.create({
          tokenNumber: p.tokenNumber,
          vehicleNumber: p.vehicleNumber || "UNKNOWN",
          phoneNumber: phone,
          amount: p.amount,
          validUntil: p.validUntil ? new Date(p.validUntil) : null,
          lastUsedAt: isUsed ? now : null,
          usageHistory: isUsed
            ? [{ usedAt: now, amount: p.amount, note: "Imported as availed from SMS" }]
            : [],
          lastSms: p.raw,
        });
        results.push({ action: "created", token: serializeToken(doc) });
      }
    }

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Error in /api/tokens/import:", error);

    // Return the actual error message so user sees exactly what failed
    let message = error.message || "An unexpected error occurred while importing tokens";
    if (message.includes("ENOTFOUND") || message.includes("ETIMEDOUT") || message.includes("querySrv")) {
      message = "Database connection failed. Please check your MONGODB_URI on Vercel and ensure Atlas IP Access List allows 0.0.0.0/0.";
    } else if (message.includes("bad auth") || message.includes("Authentication failed")) {
      message = "MongoDB authentication failed. Please verify your Atlas database username and password in MONGODB_URI.";
    } else if (message.includes("different case")) {
      message = "Database name case mismatch in Atlas. Please check your MONGODB_URI or ensure the database name matches 'Fsm'.";
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

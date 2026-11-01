import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { User } from "@/models/User";
import { serializeToken } from "@/lib/serialize";
import { parseTokenSms } from "@/lib/parseSms";
import { getCurrentUser, ensureSuperadminExists } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Import one or more token SMS messages.
 * Body: { text: string, phoneNumber?: string, preview?: boolean, userId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const admin = await ensureSuperadminExists();

    const currentUser = await getCurrentUser(req);

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { text, phoneNumber, preview, userId } = body || {};

    // Determine target user to assign tokens to:
    // If a specific userId was selected, verify it exists.
    let targetUserId = currentUser ? currentUser.userId : String(admin._id);
    if (userId) {
      const selectedUser = await User.findById(userId).lean();
      if (selectedUser) {
        targetUserId = String(selectedUser._id);
      }
    }

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
      const scopeQuery: Record<string, unknown> = { userId: targetUserId };

      let existing = await Token.findOne({ tokenNumber: p.tokenNumber, ...scopeQuery });
      let phone = String(phoneNumber ?? "").trim();
      if (!phone && p.vehicleNumber) {
        const sibling = await Token.findOne({
          vehicleNumber: p.vehicleNumber,
          phoneNumber: { $ne: "" },
          ...scopeQuery,
        }).lean();
        phone = sibling?.phoneNumber ?? "";
      }

      // If no token found by exact tokenNumber, match by vehicleNumber for this user!
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
            ...scopeQuery,
          }).sort({ updatedAt: -1 });
        }
        if (!candidate) {
          candidate = await Token.findOne({
            vehicleNumber: vehicleRegex,
            ...scopeQuery,
          }).sort({ updatedAt: -1 });
        }

        if (candidate) {
          existing = candidate;
        }
      }

      if (preview) {
        results.push({
          ...p,
          phoneNumber: existing?.phoneNumber || phone,
          action: existing ? "update" : "create",
          isRenewal: existing && existing.tokenNumber !== p.tokenNumber,
        });
        continue;
      }

      if (existing) {
        // If updating an existing record whose tokenNumber differs, avoid collision with another doc
        if (existing.tokenNumber !== p.tokenNumber) {
          const duplicate = await Token.findOne({ tokenNumber: p.tokenNumber });
          if (duplicate && String(duplicate._id) !== String(existing._id)) {
            await Token.deleteOne({ _id: duplicate._id });
          }
          existing.tokenNumber = p.tokenNumber;
        }

        if (p.vehicleNumber) existing.vehicleNumber = p.vehicleNumber;
        if (p.amount !== null) existing.amount = p.amount;
        if (p.validUntil) existing.validUntil = new Date(p.validUntil);
        if (phone) existing.phoneNumber = phone;
        existing.userId = new mongoose.Types.ObjectId(targetUserId);
        existing.lastSms = p.raw;

        // When a new token is pasted or imported, it is always active and available to use!
        existing.lastUsedAt = null;

        await existing.save();

        // Automatically clean up any older duplicate records for this same vehicle in user's scope
        if (p.vehicleNumber) {
          const vehicleRegex = new RegExp(
            `^${p.vehicleNumber.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`,
            "i"
          );
          await Token.deleteMany({
            vehicleNumber: vehicleRegex,
            _id: { $ne: existing._id },
            ...scopeQuery,
          });
        }

        results.push({ action: "updated", token: serializeToken(existing) });
      } else {
        const doc = await Token.create({
          userId: new mongoose.Types.ObjectId(targetUserId),
          tokenNumber: p.tokenNumber,
          vehicleNumber: p.vehicleNumber || "UNKNOWN",
          phoneNumber: phone,
          amount: p.amount,
          validUntil: p.validUntil ? new Date(p.validUntil) : null,
          lastUsedAt: null, // New token starts as Available (NEVER in cooldown)!
          usageHistory: [],
          lastSms: p.raw,
        });
        results.push({ action: "created", token: serializeToken(doc) });
      }
    }

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Error in /api/tokens/import:", error);

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

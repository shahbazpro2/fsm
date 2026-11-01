import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { User } from "@/models/User";
import { serializeToken } from "@/lib/serialize";
import { parseTokenSms } from "@/lib/parseSms";
import { getCurrentUser, ensureSuperadminExists } from "@/lib/auth";

export const dynamic = "force-dynamic";

type PopulatedUser = {
  _id?: mongoose.Types.ObjectId | string;
  username?: string;
  name?: string;
};

/**
 * Import one or more token SMS messages.
 * Body: { text: string, phoneNumber?: string, preview?: boolean, userId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    await ensureSuperadminExists();

    const currentUser = await getCurrentUser(req);

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { text, phoneNumber, preview, userId } = body || {};

    // Determine target user to assign tokens to:
    let targetUserId: string;

    if (!currentUser) {
      // Adding from public: userId MUST be explicitly specified and valid
      if (!userId) {
        return NextResponse.json(
          { error: "Please select and confirm a user to assign this token to." },
          { status: 400 }
        );
      }
      const selectedUser = await User.findById(userId).lean();
      if (!selectedUser) {
        return NextResponse.json(
          { error: "Selected user does not exist. Please choose a valid user." },
          { status: 400 }
        );
      }
      targetUserId = String(selectedUser._id);
    } else if (currentUser.role === "superadmin" && userId) {
      const selectedUser = await User.findById(userId).lean();
      targetUserId = selectedUser ? String(selectedUser._id) : currentUser.userId;
    } else {
      targetUserId = currentUser.userId;
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
      // 1. Check if tokenNumber already exists globally for ANOTHER user
      const existingTokenGlobal = await Token.findOne({ tokenNumber: p.tokenNumber })
        .populate("userId", "username name")
        .lean();

      if (existingTokenGlobal) {
        const ownerDoc = existingTokenGlobal.userId as PopulatedUser | null;
        const ownerId = ownerDoc?._id ? String(ownerDoc._id) : String(existingTokenGlobal.userId ?? "");
        if (ownerId && ownerId !== String(targetUserId)) {
          const ownerLabel = ownerDoc?.username
            ? `@${ownerDoc.username}${ownerDoc.name ? ` (${ownerDoc.name})` : ""}`
            : "another user";
          return NextResponse.json(
            {
              error: `This token (${p.tokenNumber}) is assigned to that user: ${ownerLabel}. It cannot be added or assigned to a different user.`,
            },
            { status: 409 }
          );
        }
      }

      // 2. Check if vehicleNumber already belongs to ANOTHER user
      if (p.vehicleNumber) {
        const vehicleRegex = new RegExp(
          `^${p.vehicleNumber.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`,
          "i"
        );
        const existingVehicleOther = await Token.findOne({
          vehicleNumber: vehicleRegex,
          userId: { $nin: [null, new mongoose.Types.ObjectId(targetUserId)] },
        })
          .populate("userId", "username name")
          .lean();

        if (existingVehicleOther) {
          const vOwner = existingVehicleOther.userId as PopulatedUser | null;
          const vOwnerId = vOwner?._id ? String(vOwner._id) : String(existingVehicleOther.userId ?? "");
          if (vOwnerId && vOwnerId !== String(targetUserId)) {
            const vOwnerLabel = vOwner?.username
              ? `@${vOwner.username}${vOwner.name ? ` (${vOwner.name})` : ""}`
              : "another user";
            return NextResponse.json(
              {
                error: `Vehicle ${p.vehicleNumber} is assigned to that user: ${vOwnerLabel}. This token belongs to that user.`,
              },
              { status: 409 }
            );
          }
        }
      }

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

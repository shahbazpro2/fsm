import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { normalizeVehicle } from "@/lib/parseSms";
import { getCurrentUser, ensureSuperadminExists } from "@/lib/auth";

export const dynamic = "force-dynamic";

type PopulatedUser = {
  _id?: mongoose.Types.ObjectId | string;
  username?: string;
  name?: string;
};

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please login to view records." }, { status: 401 });
    }

    await dbConnect();
    await ensureSuperadminExists();

    // Query scoping:
    // Superadmin can view all tokens or filter by ?userId=...
    // Regular users can ONLY view their own tokens.
    const query: Record<string, unknown> = {};
    const targetUserId = req.nextUrl.searchParams.get("userId");

    if (currentUser.role === "superadmin") {
      if (targetUserId && targetUserId !== "all") {
        query.userId = targetUserId;
      }
    } else {
      query.userId = currentUser.userId;
    }

    const docs = await Token.find(query)
      .populate("userId", "username name")
      .sort({ vehicleNumber: 1, tokenNumber: 1 })
      .lean();

    return NextResponse.json(docs.map(serializeToken));
  } catch (err: unknown) {
    const error = err as Error;
    console.error("GET /api/tokens error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch tokens" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please login to add tokens." }, { status: 401 });
    }

    await dbConnect();
    await ensureSuperadminExists();

    const body = await req.json();
    const tokenNumber = String(body.tokenNumber ?? "").trim();
    const vehicleNumber = normalizeVehicle(String(body.vehicleNumber ?? ""));
    if (!tokenNumber || !vehicleNumber) {
      return NextResponse.json({ error: "Token number and vehicle number are required" }, { status: 400 });
    }

    // Determine target user owner
    const targetUserId =
      currentUser.role === "superadmin" && body.userId ? body.userId : currentUser.userId;

    // 1. Check if tokenNumber already exists globally
    const existingToken = await Token.findOne({ tokenNumber })
      .populate("userId", "username name")
      .lean();

    if (existingToken) {
      const owner = existingToken.userId as PopulatedUser | null;
      const ownerId = owner?._id ? String(owner._id) : String(existingToken.userId ?? "");
      if (ownerId && ownerId !== String(targetUserId)) {
        const ownerLabel = owner?.username
          ? `@${owner.username}${owner.name ? ` (${owner.name})` : ""}`
          : "another user";
        return NextResponse.json(
          { error: `This token is assigned to that user: ${ownerLabel}.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "This token number already exists" }, { status: 409 });
    }

    // 2. Check if vehicle already exists under another user
    const vehicleRegex = new RegExp(
      `^${vehicleNumber.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`,
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
          { error: `Vehicle ${vehicleNumber} is assigned to that user: ${vOwnerLabel}. This token belongs to that user.` },
          { status: 409 }
        );
      }
    }

    // Check if vehicle already exists for this user
    const existingVehicle = await Token.findOne({
      userId: targetUserId,
      vehicleNumber: vehicleRegex,
    });

    if (existingVehicle) {
      existingVehicle.tokenNumber = tokenNumber;
      existingVehicle.vehicleNumber = vehicleNumber;
      if (body.phoneNumber !== undefined) existingVehicle.phoneNumber = String(body.phoneNumber).trim();
      if (body.ownerName !== undefined) existingVehicle.ownerName = String(body.ownerName).trim();
      if (body.amount !== undefined) existingVehicle.amount = body.amount ? Number(body.amount) : null;
      if (body.validUntil !== undefined) existingVehicle.validUntil = body.validUntil ? new Date(body.validUntil) : null;
      if (body.notes !== undefined) existingVehicle.notes = String(body.notes);
      existingVehicle.lastUsedAt = null;
      await existingVehicle.save();
      return NextResponse.json(serializeToken(existingVehicle), { status: 200 });
    }

    const doc = await Token.create({
      userId: targetUserId,
      tokenNumber,
      vehicleNumber,
      phoneNumber: String(body.phoneNumber ?? "").trim(),
      ownerName: String(body.ownerName ?? "").trim(),
      amount: body.amount ? Number(body.amount) : null,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      notes: String(body.notes ?? ""),
      lastUsedAt: null,
      usageHistory: [],
    });

    return NextResponse.json(serializeToken(doc), { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("POST /api/tokens error:", error);
    return NextResponse.json({ error: error.message || "Failed to create token" }, { status: 500 });
  }
}

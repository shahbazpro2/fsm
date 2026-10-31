import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { normalizeVehicle } from "@/lib/parseSms";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthenticated(req)) {
      return NextResponse.json({ error: "Unauthorized. Please login to view records." }, { status: 401 });
    }
    await dbConnect();
    const docs = await Token.find().sort({ vehicleNumber: 1, tokenNumber: 1 }).lean();
    return NextResponse.json(docs.map(serializeToken));
  } catch (err: unknown) {
    const error = err as Error;
    console.error("GET /api/tokens error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch tokens" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthenticated(req)) {
      return NextResponse.json({ error: "Unauthorized. Please login to add tokens." }, { status: 401 });
    }
    await dbConnect();
    const body = await req.json();
    const tokenNumber = String(body.tokenNumber ?? "").trim();
    const vehicleNumber = normalizeVehicle(String(body.vehicleNumber ?? ""));
    if (!tokenNumber || !vehicleNumber) {
      return NextResponse.json({ error: "Token number and vehicle number are required" }, { status: 400 });
    }
    if (await Token.exists({ tokenNumber })) {
      return NextResponse.json({ error: "This token number already exists" }, { status: 409 });
    }

    // If a record already exists for this vehicle, update that vehicle's record with the new token
    const existingVehicle = await Token.findOne({
      vehicleNumber: new RegExp(
        `^${vehicleNumber.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`,
        "i"
      ),
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
      tokenNumber,
      vehicleNumber,
      phoneNumber: String(body.phoneNumber ?? "").trim(),
      ownerName: String(body.ownerName ?? "").trim(),
      amount: body.amount ? Number(body.amount) : null,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      notes: String(body.notes ?? ""),
    });
    return NextResponse.json(serializeToken(doc), { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("POST /api/tokens error:", error);
    return NextResponse.json({ error: error.message || "Failed to create token" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { normalizeVehicle } from "@/lib/parseSms";

export const dynamic = "force-dynamic";

export async function GET() {
  await dbConnect();
  const docs = await Token.find().sort({ vehicleNumber: 1, tokenNumber: 1 }).lean();
  return NextResponse.json(docs.map(serializeToken));
}

export async function POST(req: NextRequest) {
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
}

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { normalizeVehicle } from "@/lib/parseSms";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    await dbConnect();
    const { id } = await params;
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (body.tokenNumber !== undefined) update.tokenNumber = String(body.tokenNumber).trim();
    if (body.vehicleNumber !== undefined) update.vehicleNumber = normalizeVehicle(String(body.vehicleNumber));
    if (body.phoneNumber !== undefined) update.phoneNumber = String(body.phoneNumber).trim();
    if (body.ownerName !== undefined) update.ownerName = String(body.ownerName).trim();
    if (body.amount !== undefined) update.amount = body.amount === "" || body.amount === null ? null : Number(body.amount);
    if (body.validUntil !== undefined) update.validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.notes !== undefined) update.notes = String(body.notes);

    const doc = await Token.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeToken(doc));
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error.code === 11000) {
      return NextResponse.json({ error: "This token number already exists" }, { status: 409 });
    }
    console.error("PATCH /api/tokens/[id] error:", err);
    return NextResponse.json({ error: error.message || "Failed to update token" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await dbConnect();
    const { id } = await params;
    await Token.findByIdAndDelete(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("DELETE /api/tokens/[id] error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete token" }, { status: 500 });
  }
}

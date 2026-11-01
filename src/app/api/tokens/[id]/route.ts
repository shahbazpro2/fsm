import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { normalizeVehicle } from "@/lib/parseSms";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please login to edit tokens." }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;
    const doc = await Token.findById(id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Regular users can only edit their own tokens
    if (currentUser.role !== "superadmin" && String(doc.userId) !== currentUser.userId) {
      return NextResponse.json({ error: "Forbidden. You can only edit your own tokens." }, { status: 403 });
    }

    const body = await req.json();
    if (body.tokenNumber !== undefined) doc.tokenNumber = String(body.tokenNumber).trim();
    if (body.vehicleNumber !== undefined) doc.vehicleNumber = normalizeVehicle(String(body.vehicleNumber));
    if (body.phoneNumber !== undefined) doc.phoneNumber = String(body.phoneNumber).trim();
    if (body.ownerName !== undefined) doc.ownerName = String(body.ownerName).trim();
    if (body.amount !== undefined) doc.amount = body.amount === "" || body.amount === null ? null : Number(body.amount);
    if (body.validUntil !== undefined) doc.validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.notes !== undefined) doc.notes = String(body.notes);

    // Superadmin can reassign token to another user
    if (currentUser.role === "superadmin" && body.userId !== undefined) {
      doc.userId = body.userId;
    }

    await doc.save();
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

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please login to delete tokens." }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;
    const doc = await Token.findById(id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Regular users can only delete their own tokens
    if (currentUser.role !== "superadmin" && String(doc.userId) !== currentUser.userId) {
      return NextResponse.json({ error: "Forbidden. You can only delete your own tokens." }, { status: 403 });
    }

    await Token.deleteOne({ _id: id });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("DELETE /api/tokens/[id] error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete token" }, { status: 500 });
  }
}

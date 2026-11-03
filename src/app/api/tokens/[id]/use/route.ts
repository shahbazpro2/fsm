import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { Token } from "@/models/Token";
import { serializeToken } from "@/lib/serialize";
import { getStatus } from "@/lib/status";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please login to use tokens." }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const doc = await Token.findById(id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Regular users can only use their own tokens
    if (currentUser.role !== "superadmin" && String(doc.userId) !== currentUser.userId) {
      return NextResponse.json({ error: "Forbidden. You can only use your own tokens." }, { status: 403 });
    }

    const { status, nextAvailableAt } = getStatus(doc);
    if (status === "used" && !body.force) {
      return NextResponse.json(
        { error: `Token is in cooldown until ${new Date(nextAvailableAt!).toLocaleString("en-PK")}` },
        { status: 409 }
      );
    }
    if (status === "expired" && !body.force) {
      return NextResponse.json(
        { error: "Token is expired and cannot be marked as used" },
        { status: 400 }
      );
    }
    if (status === "need_renew" && !body.force) {
      return NextResponse.json(
        { error: "Token cooldown has ended. Please paste a new token SMS to renew." },
        { status: 400 }
      );
    }

    const usedAt = body.usedAt ? new Date(body.usedAt) : new Date();
    doc.usageHistory.push({ usedAt, amount: body.amount ?? doc.amount ?? null, note: body.note ?? "" });
    if (!doc.lastUsedAt || usedAt > doc.lastUsedAt) doc.lastUsedAt = usedAt;
    await doc.save();
    return NextResponse.json(serializeToken(doc));
  } catch (err: unknown) {
    const error = err as Error;
    console.error("POST /api/tokens/[id]/use error:", error);
    return NextResponse.json({ error: error.message || "Failed to mark token used" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please login to undo token usage." }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;
    const doc = await Token.findById(id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Regular users can only undo their own tokens
    if (currentUser.role !== "superadmin" && String(doc.userId) !== currentUser.userId) {
      return NextResponse.json({ error: "Forbidden. You can only undo your own tokens." }, { status: 403 });
    }

    const sorted = [...doc.usageHistory].sort((a, b) => +new Date(b.usedAt) - +new Date(a.usedAt));
    const latest = sorted[0];
    if (latest) {
      doc.usageHistory.pull(latest._id);
      doc.lastUsedAt = sorted[1]?.usedAt ?? null;
      await doc.save();
    }
    return NextResponse.json(serializeToken(doc));
  } catch (err: unknown) {
    const error = err as Error;
    console.error("DELETE /api/tokens/[id]/use error:", error);
    return NextResponse.json({ error: error.message || "Failed to undo token usage" }, { status: 500 });
  }
}

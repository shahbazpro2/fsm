import { NextRequest, NextResponse } from "next/server";
import { verifyPin, getExpectedPins } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json().catch(() => ({}));
    if (!pin) {
      return NextResponse.json({ error: "PIN is required" }, { status: 400 });
    }

    if (!verifyPin(String(pin))) {
      return NextResponse.json(
        { error: "Incorrect PIN. The PIN is today's date + 123321." },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ ok: true, message: "Logged in successfully" });
    // Set an auth cookie valid for 24 hours
    res.cookies.set("fsm_auth", "authenticated", {
      httpOnly: false, // accessible to client for reactive UI
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true, message: "Logged out" });
  res.cookies.delete("fsm_auth");
  return res;
}

export async function GET() {
  // Returns today's active format hints for convenient login
  const pins = getExpectedPins();
  return NextResponse.json({
    hint: `Format: YYYYMMDD123321 (e.g. ${pins[0]}) or DDMMYYYY123321 (e.g. ${pins[1]})`,
  });
}

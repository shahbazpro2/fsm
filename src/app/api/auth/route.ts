import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { User } from "@/models/User";
import {
  verifyPassword,
  createSessionToken,
  getCurrentUser,
  ensureSuperadminExists,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    await ensureSuperadminExists();

    const body = await req.json().catch(() => ({}));
    const usernameInput = String(body.username ?? "").toLowerCase().trim();
    const passwordInput = String(body.password ?? body.pin ?? "").trim();

    if (!passwordInput) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // If username is provided, look up by username.
    // If not provided, try default superadmin "admin".
    const targetUsername = usernameInput || "admin";
    const user = await User.findOne({ username: targetUsername });

    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "Your account is disabled. Please contact superadmin." }, { status: 403 });
    }

    const isValid = verifyPassword(passwordInput, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const sessionToken = createSessionToken(user);
    const userPayload = {
      userId: String(user._id),
      username: user.username,
      name: user.name || "",
      role: user.role,
    };

    const res = NextResponse.json({ ok: true, message: "Logged in successfully", user: userPayload });

    // Set secure HTTP-only session cookie for authentication
    res.cookies.set("fsm_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    // Also set client-readable indicator cookie for immediate reactive UI
    res.cookies.set("fsm_auth", "authenticated", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return res;
  } catch (err: unknown) {
    const error = err as Error;
    console.error("POST /api/auth error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true, message: "Logged out" });
  res.cookies.delete("fsm_session");
  res.cookies.delete("fsm_auth");
  return res;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    await ensureSuperadminExists();
    const user = await getCurrentUser(req);
    return NextResponse.json({
      authenticated: !!user,
      user: user || null,
    });
  } catch {
    return NextResponse.json({ authenticated: false, user: null });
  }
}

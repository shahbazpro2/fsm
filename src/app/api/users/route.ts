import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Token } from "@/models/Token";
import { getCurrentUser, hashPassword, ensureSuperadminExists } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 * Lists all users with their token counts. Superadmin only.
 */
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    await ensureSuperadminExists();

    const currentUser = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const simple = searchParams.get("simple") === "true";

    // If simple selection list requested, or caller is not superadmin:
    // return safe active user list for selectors (id, username, name, role)
    if (simple || !currentUser || currentUser.role !== "superadmin") {
      const activeUsers = await User.find({ isActive: true })
        .select("_id username name role")
        .sort({ role: -1, username: 1 })
        .lean();

      return NextResponse.json(
        activeUsers.map((u) => ({
          id: String(u._id),
          username: u.username,
          name: u.name || "",
          role: u.role,
        }))
      );
    }

    const users = await User.find().sort({ role: -1, createdAt: 1 }).lean();

    // Attach token counts for each user
    const usersWithCounts = await Promise.all(
      users.map(async (u) => {
        const tokenCount = await Token.countDocuments({ userId: u._id });
        return {
          id: String(u._id),
          username: u.username,
          name: u.name,
          role: u.role,
          isActive: u.isActive,
          tokenCount,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
      })
    );

    return NextResponse.json(usersWithCounts);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("GET /api/users error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/users
 * Create a new user with a custom password. Superadmin only.
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    await ensureSuperadminExists();

    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden. Superadmin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const username = String(body.username ?? "").toLowerCase().trim();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "").trim();
    const role = body.role === "superadmin" ? "superadmin" : "user";

    if (!username || username.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
    }

    if (!/^[a-z0-9_-]+$/.test(username)) {
      return NextResponse.json(
        { error: "Username can only contain lowercase letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }

    if (!password || password.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return NextResponse.json({ error: "A user with this username already exists" }, { status: 409 });
    }

    const user = await User.create({
      username,
      name,
      passwordHash: hashPassword(password),
      role,
      isActive: true,
    });

    return NextResponse.json(
      {
        id: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        tokenCount: 0,
        createdAt: user.createdAt,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error("POST /api/users error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

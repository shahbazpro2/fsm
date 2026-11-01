import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Token } from "@/models/Token";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/[id]
 * Update a user's details or set a new custom password. Superadmin only.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await context.params;

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isSelf = currentUser.userId === id;
    if (currentUser.role !== "superadmin" && !isSelf) {
      return NextResponse.json({ error: "Forbidden. Superadmin access required." }, { status: 403 });
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    // Update custom password if provided
    if (body.password !== undefined && body.password !== null && String(body.password).trim() !== "") {
      const newPassword = String(body.password).trim();
      if (newPassword.length < 4) {
        return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
      }
      user.passwordHash = hashPassword(newPassword);
    }

    if (body.name !== undefined) {
      user.name = String(body.name).trim();
    }

    // Role and active status can only be modified by a superadmin
    if (currentUser.role === "superadmin") {
      if (body.role !== undefined && (body.role === "user" || body.role === "superadmin")) {
        // Prevent superadmin from removing their own superadmin role if they are the only superadmin
        if (isSelf && body.role !== "superadmin") {
          const superadminCount = await User.countDocuments({ role: "superadmin" });
          if (superadminCount <= 1) {
            return NextResponse.json(
              { error: "Cannot demote the only remaining superadmin account." },
              { status: 400 }
            );
          }
        }
        user.role = body.role;
      }

      if (body.isActive !== undefined) {
        if (isSelf && body.isActive === false) {
          return NextResponse.json({ error: "Cannot disable your own account." }, { status: 400 });
        }
        user.isActive = Boolean(body.isActive);
      }
    }

    await user.save();

    const tokenCount = await Token.countDocuments({ userId: user._id });

    return NextResponse.json({
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      tokenCount,
      updatedAt: user.updatedAt,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("PATCH /api/users/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id]
 * Delete a user and clean up their associated tokens. Superadmin only.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await context.params;

    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden. Superadmin access required." }, { status: 403 });
    }

    if (currentUser.userId === id) {
      return NextResponse.json({ error: "Cannot delete your own superadmin account." }, { status: 400 });
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user's tokens
    await Token.deleteMany({ userId: id });

    // Delete user
    await User.deleteOne({ _id: id });

    return NextResponse.json({ ok: true, message: `User @${user.username} deleted` });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

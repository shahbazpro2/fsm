import crypto from "crypto";
import { NextRequest } from "next/server";
import { User, UserDoc } from "@/models/User";
import { Token } from "@/models/Token";
import { dbConnect } from "./mongodb";

const SECRET = process.env.AUTH_SECRET || "fsm-secure-key-seed-salt-2026";

/**
 * Hash password with random salt using Node.js scrypt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify password against stored salt:hash format.
 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, key] = stored.split(":");
    if (!salt || !key) return false;
    const hash = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, "hex");
    return crypto.timingSafeEqual(hash, keyBuffer);
  } catch {
    return false;
  }
}

export interface UserSession {
  userId: string;
  username: string;
  name: string;
  role: "superadmin" | "user";
}

/**
 * Create a tamper-proof HMAC-signed session token.
 */
export function createSessionToken(user: { _id: unknown; username: string; name?: string; role: string }): string {
  const payload = {
    userId: String(user._id),
    username: user.username,
    name: user.name || "",
    role: user.role,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days valid
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verify and parse HMAC session token.
 */
export function parseSessionToken(token: string): UserSession | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) {
      return null;
    }
    return {
      userId: String(payload.userId),
      username: String(payload.username),
      name: String(payload.name || ""),
      role: payload.role === "superadmin" ? "superadmin" : "user",
    };
  } catch {
    return null;
  }
}

/**
 * Extract authenticated user session from Next.js request.
 */
export async function getCurrentUser(req: NextRequest | Request): Promise<UserSession | null> {
  let token: string | undefined;
  if ("cookies" in req && typeof (req as NextRequest).cookies?.get === "function") {
    token = (req as NextRequest).cookies.get("fsm_session")?.value;
  }
  if (!token) {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/fsm_session=([^;]+)/);
      if (match) token = match[1];
    }
  }
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }
  if (!token) return null;
  return parseSessionToken(token);
}

/**
 * Check if the request is authenticated.
 */
export async function isAuthenticated(req: NextRequest | Request): Promise<boolean> {
  const user = await getCurrentUser(req);
  return !!user;
}

/**
 * Check if the request is from a superadmin.
 */
export async function isSuperadmin(req: NextRequest | Request): Promise<boolean> {
  const user = await getCurrentUser(req);
  return user?.role === "superadmin";
}

/**
 * Ensure at least one superadmin account exists in the database.
 * If none exists, creates the default superadmin.
 */
export async function ensureSuperadminExists(): Promise<UserDoc> {
  await dbConnect();
  const existing = await User.findOne({ role: "superadmin" });
  if (existing) return existing;

  const defaultUsername = (process.env.INITIAL_SUPERADMIN_USERNAME || "admin").toLowerCase().trim();
  const defaultPassword = process.env.INITIAL_SUPERADMIN_PASSWORD || "admin12345";

  let admin = await User.findOne({ username: defaultUsername });
  if (!admin) {
    admin = await User.create({
      username: defaultUsername,
      name: "Super Administrator",
      passwordHash: hashPassword(defaultPassword),
      role: "superadmin",
      isActive: true,
    });
  } else {
    admin.role = "superadmin";
    await admin.save();
  }

  // Link any orphaned existing tokens to this superadmin account
  await Token.updateMany({ userId: null }, { $set: { userId: admin._id } });

  return admin;
}

import { getStatus } from "./status";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function serializeToken(doc: any) {
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const { status, nextAvailableAt } = getStatus(o);
  return {
    _id: String(o._id),
    userId: o.userId ? (typeof o.userId === "object" && o.userId._id ? String(o.userId._id) : String(o.userId)) : null,
    ownerUsername: typeof o.userId === "object" && o.userId?.username ? String(o.userId.username) : undefined,
    tokenNumber: o.tokenNumber,
    vehicleNumber: o.vehicleNumber,
    phoneNumber: o.phoneNumber ?? "",
    ownerName: o.ownerName ?? "",
    amount: o.amount ?? null,
    validUntil: o.validUntil ? new Date(o.validUntil).toISOString() : null,
    lastUsedAt: o.lastUsedAt ? new Date(o.lastUsedAt).toISOString() : null,
    usageHistory: (o.usageHistory ?? []).map((u: any) => ({
      _id: String(u._id),
      usedAt: new Date(u.usedAt).toISOString(),
      amount: u.amount ?? null,
      note: u.note ?? "",
    })),
    notes: o.notes ?? "",
    lastSms: o.lastSms ?? "",
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    updatedAt: o.updatedAt ? new Date(o.updatedAt).toISOString() : null,
    status,
    nextAvailableAt,
  };
}

export type TokenDTO = ReturnType<typeof serializeToken>;

import mongoose, { Schema, InferSchemaType, Model } from "mongoose";

const UsageSchema = new Schema(
  {
    usedAt: { type: Date, required: true },
    amount: { type: Number, default: null },
    note: { type: String, default: "" },
  },
  { _id: true }
);

const TokenSchema = new Schema(
  {
    tokenNumber: { type: String, required: true, unique: true, trim: true },
    vehicleNumber: { type: String, required: true, uppercase: true, trim: true, index: true },
    phoneNumber: { type: String, default: "", trim: true, index: true },
    ownerName: { type: String, default: "", trim: true },
    amount: { type: Number, default: null },
    /** "Valid until" from the latest SMS */
    validUntil: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    usageHistory: { type: [UsageSchema], default: [] },
    lastSms: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

export type TokenDoc = InferSchemaType<typeof TokenSchema> & { _id: mongoose.Types.ObjectId };

export const Token: Model<TokenDoc> =
  (mongoose.models.Token as Model<TokenDoc>) || mongoose.model<TokenDoc>("Token", TokenSchema);

// <== IMPORTS ==>
import mongoose from "mongoose";

// <== TWO FACTOR VERIFICATION SCHEMA ==>
const twoFactorVerificationSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // EMAIL FIELD
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    // VERIFICATION CODE FIELD (6-DIGIT)
    verificationCode: {
      type: String,
      required: true,
    },
    // EMAIL VERIFIED FIELD
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // TYPE FIELD (ENABLE OR DISABLE)
    type: {
      type: String,
      enum: ["enable", "disable"],
      required: true,
    },
    // EXPIRES AT FIELD
    expiresAt: {
      type: Date,
      required: true,
    },
    // VERIFICATION ATTEMPTS FIELD
    verificationAttempts: {
      type: Number,
      default: 0,
    },
    // LAST VERIFICATION ATTEMPT AT FIELD
    lastVerificationAttemptAt: {
      type: Date,
      default: null,
    },
    // TOTP SECRET FIELD (TEMPORARY STORAGE DURING ENABLE FLOW)
    totpSecret: {
      type: String,
      default: null,
    },
    // QR CODE GENERATED FIELD
    qrCodeGenerated: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER ID AND TYPE
 */
//<== COMPOUND INDEX FOR USER ID AND TYPE ==>
twoFactorVerificationSchema.index({ userId: 1, type: 1 });
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED RECORDS
 */
//<== TTL INDEX FOR AUTO-DELETION OF EXPIRED RECORDS ==>
twoFactorVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// <== EXPORTING THE TWO FACTOR VERIFICATION MODEL ==>
export const TwoFactorVerification = mongoose.model(
  "TwoFactorVerification",
  twoFactorVerificationSchema
);


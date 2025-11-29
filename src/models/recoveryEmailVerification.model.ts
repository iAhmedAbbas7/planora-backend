// <== IMPORTS ==>
import mongoose from "mongoose";

// <== RECOVERY EMAIL VERIFICATION SCHEMA ==>
const recoveryEmailVerificationSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // RECOVERY EMAIL FIELD
    recoveryEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // VERIFICATION CODE
    verificationCode: {
      type: String,
      required: true,
      length: 6,
    },
    // VERIFIED FLAG
    verified: {
      type: Boolean,
      default: false,
    },
    // EXPIRES AT TIMESTAMP
    expiresAt: {
      type: Date,
      required: true,
    },
    // VERIFICATION ATTEMPTS
    verificationAttempts: {
      type: Number,
      default: 0,
    },
    // LAST VERIFICATION ATTEMPT TIMESTAMP
    lastVerificationAttemptAt: {
      type: Date,
      default: null,
    },
    // TYPE FIELD
    type: {
      type: String,
      enum: ["add", "update", "remove"],
      required: true,
    },
    // OLD RECOVERY EMAIL
    oldRecoveryEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * INDEX ON USER ID FOR FAST LOOKUPS
 */
recoveryEmailVerificationSchema.index({ userId: 1 });
/**
 * COMPOUND INDEX FOR USER AND TYPE
 */
recoveryEmailVerificationSchema.index({ userId: 1, type: 1 });
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED DOCUMENTS
 */
recoveryEmailVerificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// <== EXPORTING THE RECOVERY EMAIL VERIFICATION MODEL ==>
export const RecoveryEmailVerification = mongoose.model(
  "RecoveryEmailVerification",
  recoveryEmailVerificationSchema
);

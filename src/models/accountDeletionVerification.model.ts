// <== IMPORTS ==>
import mongoose from "mongoose";

// <== ACCOUNT DELETION VERIFICATION SCHEMA ==>
const accountDeletionVerificationSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // EMAIL FIELD
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // VERIFICATION CODE FIELD
    verificationCode: {
      type: String,
      required: true,
    },
    // EMAIL VERIFIED FLAG
    emailVerified: {
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
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * INDEX ON USER ID FOR FAST LOOKUPS
 */
accountDeletionVerificationSchema.index({ userId: 1 });
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED DOCUMENTS
 */
accountDeletionVerificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// <== EXPORTING THE ACCOUNT DELETION VERIFICATION MODEL ==>
export const AccountDeletionVerification = mongoose.model(
  "AccountDeletionVerification",
  accountDeletionVerificationSchema
);


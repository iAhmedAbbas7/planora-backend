// <== IMPORTS ==>
import mongoose from "mongoose";

// <== PASSWORD CHANGE VERIFICATION SCHEMA ==>
const passwordChangeVerificationSchema = new mongoose.Schema(
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
      default: null,
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
passwordChangeVerificationSchema.index({ userId: 1 });
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED DOCUMENTS
 */
passwordChangeVerificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// <== EXPORTING THE PASSWORD CHANGE VERIFICATION MODEL ==>
export const PasswordChangeVerification = mongoose.model(
  "PasswordChangeVerification",
  passwordChangeVerificationSchema
);

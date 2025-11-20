// <== IMPORTS ==>
import mongoose from "mongoose";

// <== PASSWORD RESET SCHEMA ==>
const passwordResetSchema = new mongoose.Schema(
  {
    // EMAIL FIELD
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    // RESET CODE (6 DIGITS)
    resetCode: {
      type: String,
      required: true,
      length: 6,
    },
    // RESET CODE EXPIRY (2 MINUTES FROM CREATION)
    resetCodeExpiresAt: {
      type: Date,
      required: true,
    },
    // RESEND ATTEMPTS (TO PREVENT ABUSE)
    resendAttempts: {
      type: Number,
      default: 0,
    },
    // LAST RESEND TIMESTAMP (FOR RATE LIMITING)
    lastResendAt: {
      type: Date,
      default: Date.now,
    },
    // VERIFICATION ATTEMPTS (TO PREVENT BRUTE FORCE)
    verificationAttempts: {
      type: Number,
      default: 0,
    },
    // LAST VERIFICATION ATTEMPT TIMESTAMP
    lastVerificationAttemptAt: {
      type: Date,
      default: Date.now,
    },
    // USED FLAG (TO PREVENT CODE REUSE)
    used: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED DOCUMENTS
 */
passwordResetSchema.index(
  { resetCodeExpiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// <== EMAIL INDEX FOR QUICK LOOKUP ==>
passwordResetSchema.index({ email: 1 });

// <== EXPORTING THE PASSWORD RESET MODEL ==>
export const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema);


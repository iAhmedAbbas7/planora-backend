// <== IMPORTS ==>
import mongoose from "mongoose";

// <== ACCOUNT RECOVERY SCHEMA ==>
const accountRecoverySchema = new mongoose.Schema(
  {
    // RECOVERY EMAIL FIELD
    recoveryEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    // PRIMARY EMAIL FIELD
    primaryEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    // RECOVERY CODE
    recoveryCode: {
      type: String,
      required: true,
      length: 6,
    },
    // RECOVERY CODE EXPIRY
    recoveryCodeExpiresAt: {
      type: Date,
      required: true,
    },
    // RESEND ATTEMPTS
    resendAttempts: {
      type: Number,
      default: 0,
    },
    // LAST RESEND TIMESTAMP
    lastResendAt: {
      type: Date,
      default: Date.now,
    },
    // VERIFICATION ATTEMPTS
    verificationAttempts: {
      type: Number,
      default: 0,
    },
    // LAST VERIFICATION ATTEMPT TIMESTAMP
    lastVerificationAttemptAt: {
      type: Date,
      default: Date.now,
    },
    // USED FLAG
    used: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    autoIndex: true, // Explicitly set to true to ensure indexes are created
  }
);

// <== INDEXES ==>
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED DOCUMENTS
 */
accountRecoverySchema.index(
  { recoveryCodeExpiresAt: 1 },
  { expireAfterSeconds: 0 }
);
/**
 * INDEX ON RECOVERY EMAIL FOR QUICK LOOKUP
 */
accountRecoverySchema.index(
  { recoveryEmail: 1 },
  {
    name: "accountRecovery_recoveryEmail_idx",
    background: true,
  }
);

// <== EXPORTING THE ACCOUNT RECOVERY MODEL ==>
export const AccountRecovery = mongoose.model(
  "AccountRecovery",
  accountRecoverySchema
);

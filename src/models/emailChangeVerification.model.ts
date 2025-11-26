// <== IMPORTS ==>
import mongoose from "mongoose";

// <== EMAIL CHANGE VERIFICATION SCHEMA ==>
const emailChangeVerificationSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // CURRENT EMAIL FIELD
    currentEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // NEW EMAIL FIELD
    newEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // CURRENT EMAIL VERIFICATION CODE
    currentEmailCode: {
      type: String,
      default: null,
    },
    // NEW EMAIL VERIFICATION CODE
    newEmailCode: {
      type: String,
      default: null,
    },
    // CURRENT EMAIL VERIFIED FLAG
    currentEmailVerified: {
      type: Boolean,
      default: false,
    },
    // NEW EMAIL VERIFIED FLAG
    newEmailVerified: {
      type: Boolean,
      default: false,
    },
    // EXPIRES AT TIMESTAMP
    expiresAt: {
      type: Date,
      required: true,
    },
    // VERIFICATION ATTEMPTS FOR CURRENT EMAIL
    currentEmailAttempts: {
      type: Number,
      default: 0,
    },
    // VERIFICATION ATTEMPTS FOR NEW EMAIL
    newEmailAttempts: {
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
emailChangeVerificationSchema.index({ userId: 1 });
/**
 * INDEX ON EXPIRES AT FOR CLEANUP
 */
emailChangeVerificationSchema.index({ expiresAt: 1 });
/**
 * COMPOUND INDEX FOR USER AND NEW EMAIL
 */
emailChangeVerificationSchema.index({ userId: 1, newEmail: 1 });

// <== EXPORTING THE EMAIL CHANGE VERIFICATION MODEL ==>
export const EmailChangeVerification = mongoose.model(
  "EmailChangeVerification",
  emailChangeVerificationSchema
);

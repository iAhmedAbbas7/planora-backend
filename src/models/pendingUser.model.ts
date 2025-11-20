// <== IMPORTS ==>
import mongoose from "mongoose";

// <== PENDING USER SCHEMA ==>
const pendingUserSchema = new mongoose.Schema(
  {
    // NAME FIELD
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // EMAIL FIELD
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    // PASSWORD FIELD (HASHED)
    password: {
      type: String,
      required: true,
    },
    // VERIFICATION CODE (6 DIGITS)
    verificationCode: {
      type: String,
      required: true,
      length: 6,
    },
    // VERIFICATION CODE EXPIRY (2 MINUTES FROM CREATION)
    verificationCodeExpiresAt: {
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
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED DOCUMENTS
 * (Email already has unique index from unique: true)
 */
pendingUserSchema.index(
  { verificationCodeExpiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// <== EXPORTING THE PENDING USER MODEL ==>
export const PendingUser = mongoose.model("PendingUser", pendingUserSchema);

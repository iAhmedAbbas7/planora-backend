// <== IMPORTS ==>
import mongoose from "mongoose";

// <== DEVICE VERIFICATION SCHEMA ==>
const deviceVerificationSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // EMAIL CODE FIELD
    emailCode: {
      type: String,
      required: true,
      length: 6,
    },
    // EMAIL CODE EXPIRES AT FIELD
    emailCodeExpiresAt: {
      type: Date,
      required: true,
    },
    // EMAIL CODE VERIFIED FIELD
    emailCodeVerified: {
      type: Boolean,
      default: false,
    },
    // 2FA CODE FIELD (IF 2FA IS ENABLED)
    twoFactorCode: {
      type: String,
      default: null,
      length: 6,
    },
    // 2FA CODE VERIFIED FIELD
    twoFactorCodeVerified: {
      type: Boolean,
      default: false,
    },
    // DEVICE INFO FIELD
    deviceInfo: {
      deviceType: {
        type: String,
        enum: ["desktop", "mobile", "tablet", "unknown"],
        required: true,
      },
      deviceName: {
        type: String,
        required: true,
      },
      browserName: {
        type: String,
        required: true,
      },
      browserVersion: {
        type: String,
        default: "",
      },
      operatingSystem: {
        type: String,
        required: true,
      },
      userAgent: {
        type: String,
        required: true,
      },
    },
    // IP ADDRESS FIELD
    ipAddress: {
      type: String,
      required: true,
    },
    // LOCATION INFO FIELD
    locationInfo: {
      country: {
        type: String,
        default: "",
      },
      city: {
        type: String,
        default: "",
      },
      region: {
        type: String,
        default: "",
      },
      countryCode: {
        type: String,
        default: "",
      },
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
    // COMPLETED FIELD
    completed: {
      type: Boolean,
      default: false,
    },
    // COMPLETED AT FIELD
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND COMPLETED STATUS
 */
//<== COMPOUND INDEX FOR USER AND COMPLETED STATUS ==>
deviceVerificationSchema.index({ userId: 1, completed: 1 });
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED VERIFICATIONS
 */
//<== TTL INDEX FOR AUTO-DELETION OF EXPIRED VERIFICATIONS ==>
deviceVerificationSchema.index(
  { emailCodeExpiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// <== EXPORTING THE DEVICE VERIFICATION MODEL ==>
export const DeviceVerification = mongoose.model(
  "DeviceVerification",
  deviceVerificationSchema
);


// <== IMPORTS ==>
import mongoose from "mongoose";

// <== TRUSTED DEVICE SCHEMA ==>
const trustedDeviceSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // DEVICE FINGERPRINT (HASH OF BROWSER + OS + DEVICE TYPE)
    deviceFingerprint: {
      type: String,
      required: true,
      trim: true,
    },
    // DEVICE TYPE FIELD
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "unknown"],
      default: "unknown",
    },
    // DEVICE NAME FIELD
    deviceName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    // BROWSER NAME FIELD
    browserName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    // BROWSER VERSION FIELD (MAJOR VERSION ONLY FOR FLEXIBILITY)
    browserVersion: {
      type: String,
      default: "",
      trim: true,
      maxlength: 50,
    },
    // OPERATING SYSTEM FIELD
    operatingSystem: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    // LAST USED TIMESTAMP
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    // FIRST TRUSTED AT TIMESTAMP
    trustedAt: {
      type: Date,
      default: Date.now,
    },
    // IS ACTIVE FLAG (CAN BE DEACTIVATED WITHOUT DELETING)
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND DEVICE FINGERPRINT (UNIQUE)
 */
//<== UNIQUE INDEX FOR USER AND DEVICE FINGERPRINT ==>
trustedDeviceSchema.index(
  { userId: 1, deviceFingerprint: 1 },
  { unique: true, name: "user_device_fingerprint_unique_idx" }
);
/**
 * COMPOUND INDEX FOR USER AND ACTIVE STATUS
 */
//<== COMPOUND INDEX FOR USER AND ACTIVE STATUS ==>
trustedDeviceSchema.index({ userId: 1, isActive: 1 });

// <== EXPORTING THE TRUSTED DEVICE MODEL ==>
export const TrustedDevice = mongoose.model("TrustedDevice", trustedDeviceSchema);

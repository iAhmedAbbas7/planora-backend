// <== IMPORTS ==>
import mongoose from "mongoose";

// <== SESSION SCHEMA ==>
const sessionSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // SESSION ID FIELD
    sessionId: {
      type: String,
      required: true,
    },
    // DEVICE TYPE FIELD
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "unknown"],
      default: "unknown",
    },
    // DEVICE NAME FIELD (USER PROVIDED OR AUTO-DETECTED)
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
    // BROWSER VERSION FIELD
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
    // USER AGENT FIELD
    userAgent: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    // IP ADDRESS FIELD
    ipAddress: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // LOCATION COUNTRY FIELD
    locationCountry: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    // LOCATION CITY FIELD
    locationCity: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    // LOCATION REGION FIELD
    locationRegion: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    // IS TRUSTED DEVICE FIELD
    isTrusted: {
      type: Boolean,
      default: false,
      index: true,
    },
    // LAST ACTIVITY TIMESTAMP
    lastActivity: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // CREATED AT TIMESTAMP (AUTO-GENERATED)
    createdAt: {
      type: Date,
      default: Date.now,
    },
    // EXPIRES AT TIMESTAMP
    expiresAt: {
      type: Date,
      required: true,
    },
    // REVOKED FIELD
    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    // REVOKED AT TIMESTAMP
    revokedAt: {
      type: Date,
      default: null,
    },
    // SUSPICIOUS ACTIVITY FLAG
    isSuspicious: {
      type: Boolean,
      default: false,
    },
    // SUSPICIOUS ACTIVITY REASON
    suspiciousReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * UNIQUE INDEX FOR SESSION ID
 */
//<== UNIQUE INDEX FOR SESSION ID ==>
sessionSchema.index({ sessionId: 1 }, { unique: true, name: "sessionId_unique_idx" });
/**
 * COMPOUND INDEX FOR USER AND REVOKED STATUS
 */
//<== COMPOUND INDEX FOR USER AND REVOKED STATUS ==>
sessionSchema.index({ userId: 1, revoked: 1 });
/**
 * COMPOUND INDEX FOR USER AND IS TRUSTED
 */
//<== COMPOUND INDEX FOR USER AND IS TRUSTED ==>
sessionSchema.index({ userId: 1, isTrusted: 1 });
/**
 * COMPOUND INDEX FOR USER AND LAST ACTIVITY
 */
//<== COMPOUND INDEX FOR USER AND LAST ACTIVITY ==>
sessionSchema.index({ userId: 1, lastActivity: -1 });
/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED SESSIONS
 */
//<== TTL INDEX FOR AUTO-DELETION OF EXPIRED SESSIONS ==>
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/**
 * COMPOUND INDEX FOR USER AND EXPIRES AT (FOR CLEANUP QUERIES)
 */
//<== COMPOUND INDEX FOR USER AND EXPIRES AT ==>
sessionSchema.index({ userId: 1, expiresAt: 1 });

// <== EXPORTING THE SESSION MODEL ==>
export const Session = mongoose.model("Session", sessionSchema);


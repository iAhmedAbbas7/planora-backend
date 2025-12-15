// <== IMPORTS ==>
import mongoose from "mongoose";

// <== SHARED REPORT SCHEMA ==>
const sharedReportSchema = new mongoose.Schema(
  {
    // USER ID FIELD (OWNER OF THE REPORT)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // REPORT TYPE FIELD
    reportType: {
      type: String,
      enum: ["personal", "project", "workspace"],
      required: true,
    },
    // PROJECT ID FIELD (OPTIONAL - FOR PROJECT REPORTS)
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    // WORKSPACE ID FIELD (OPTIONAL - FOR WORKSPACE REPORTS)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
    },
    // PERIOD FIELD
    period: {
      type: String,
      enum: ["week", "month", "quarter", "year"],
      default: "month",
    },
    // UNIQUE SHARE TOKEN
    shareToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // IS ACTIVE FIELD
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // ACCESS COUNT FIELD
    accessCount: {
      type: Number,
      default: 0,
    },
    // LAST ACCESSED FIELD
    lastAccessedAt: {
      type: Date,
      default: null,
    },
    // EXPIRES AT FIELD (TTL INDEX DEFINED SEPARATELY BELOW)
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND REPORT TYPE
 */
// <== COMPOUND INDEX FOR USER AND REPORT TYPE ==>
sharedReportSchema.index({ userId: 1, reportType: 1 });

/**
 * COMPOUND INDEX FOR USER AND IS ACTIVE
 */
// <== COMPOUND INDEX FOR USER AND IS ACTIVE ==>
sharedReportSchema.index({ userId: 1, isActive: 1 });

/**
 * TTL INDEX FOR AUTO-DELETION OF EXPIRED SHARED REPORTS
 */
// <== TTL INDEX FOR AUTO-DELETION OF EXPIRED SHARED REPORTS ==>
sharedReportSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { isActive: true } }
);

// <== EXPORTING THE SHARED REPORT MODEL ==>
export const SharedReport = mongoose.model("SharedReport", sharedReportSchema);

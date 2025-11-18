// <== IMPORTS ==>
import mongoose from "mongoose";

// <== PROJECT SCHEMA ==>
const projectSchema = new mongoose.Schema(
  {
    // TITLE FIELD
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    // DESCRIPTION FIELD
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    // IS TRASHED FIELD
    isTrashed: {
      type: Boolean,
      default: false,
      index: true,
    },
    // DELETED ON FIELD
    deletedOn: {
      type: Date,
      default: null,
    },
    // PRIORITY FIELD
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      lowercase: true,
      trim: true,
      default: "medium",
      index: true,
    },
    // IN CHARGE NAME FIELD
    inChargeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    // ROLE FIELD
    role: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    // STATUS FIELD
    status: {
      type: String,
      enum: ["To Do", "In Progress", "Completed"],
      default: "To Do",
      index: true,
    },
    // DUE DATE FIELD
    dueDate: {
      type: Date,
      index: true,
    },
    // PROGRESS FIELD
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR USER AND STATUS QUERIES ==>
projectSchema.index({ userId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND IS TRASHED QUERIES
 */
//<== COMPOUND INDEX FOR USER AND IS TRASHED QUERIES ==>
projectSchema.index({ userId: 1, isTrashed: 1 });
/**
 * COMPOUND INDEX FOR USER AND PRIORITY QUERIES
 */
//<== COMPOUND INDEX FOR USER AND PRIORITY QUERIES ==>
projectSchema.index({ userId: 1, priority: 1 });
/**
 * COMPOUND INDEX FOR USER AND DUE DATE QUERIES
 */
//<== COMPOUND INDEX FOR USER AND DUE DATE QUERIES ==>
projectSchema.index({ userId: 1, dueDate: 1 });
/**
 * TEXT INDEX FOR SEARCH FUNCTIONALITY
 */
//<== TEXT INDEX FOR SEARCH FUNCTIONALITY ==>
projectSchema.index({ title: "text", description: "text" });

// <== EXPORTING THE PROJECT MODEL ==>
export const Project = mongoose.model("Project", projectSchema);

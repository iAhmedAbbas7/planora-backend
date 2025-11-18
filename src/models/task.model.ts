// <== IMPORTS ==>
import mongoose from "mongoose";

// <== TASK SCHEMA ==>
const taskSchema = new mongoose.Schema(
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
    // COMPLETED AT FIELD
    completedAt: {
      type: Date,
      default: null,
    },
    // PROJECT ID FIELD
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    // STATUS FIELD
    status: {
      type: String,
      enum: ["to do", "in progress", "completed"],
      lowercase: true,
      trim: true,
      default: "to do",
      index: true,
      set: (val: string) => val.replace("inprogress", "in progress"),
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
    // DUE DATE FIELD
    dueDate: {
      type: Date,
      index: true,
    },
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
    // ORIGINAL STATUS FIELD (STORED BEFORE TRASHING)
    originalStatus: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR USER AND STATUS QUERIES ==>
taskSchema.index({ userId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND IS TRASHED QUERIES
 */
//<== COMPOUND INDEX FOR USER AND IS TRASHED QUERIES ==>
taskSchema.index({ userId: 1, isTrashed: 1 });
/**
 * COMPOUND INDEX FOR PROJECT AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR PROJECT AND STATUS QUERIES ==>
taskSchema.index({ projectId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND PRIORITY QUERIES
 */
//<== COMPOUND INDEX FOR USER AND PRIORITY QUERIES ==>
taskSchema.index({ userId: 1, priority: 1 });
/**
 * COMPOUND INDEX FOR USER AND DUE DATE QUERIES
 */
//<== COMPOUND INDEX FOR USER AND DUE DATE QUERIES ==>
taskSchema.index({ userId: 1, dueDate: 1 });
/**
 * TEXT INDEX FOR SEARCH FUNCTIONALITY
 */
//<== TEXT INDEX FOR SEARCH FUNCTIONALITY ==>
taskSchema.index({ title: "text", description: "text" });

// <== EXPORTING THE TASK MODEL ==>
export const Task = mongoose.model("Task", taskSchema);

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
    // GITHUB REPOSITORY FIELD (LEGACY - KEPT FOR BACKWARD COMPATIBILITY)
    githubRepo: {
      // REPOSITORY OWNER
      owner: {
        type: String,
        default: null,
        trim: true,
      },
      // REPOSITORY NAME
      name: {
        type: String,
        default: null,
        trim: true,
      },
      // REPOSITORY FULL NAME (owner/name)
      fullName: {
        type: String,
        default: null,
        trim: true,
      },
      // REPOSITORY ID FROM GITHUB
      repoId: {
        type: Number,
        default: null,
      },
      // REPOSITORY HTML URL
      htmlUrl: {
        type: String,
        default: null,
        trim: true,
      },
      // LINKED AT TIMESTAMP
      linkedAt: {
        type: Date,
        default: null,
      },
    },
    // LINKED REPOSITORIES ARRAY (NEW - SUPPORTS MULTIPLE REPOS)
    linkedRepositories: [
      {
        // REPOSITORY OWNER
        owner: {
          type: String,
          required: true,
          trim: true,
        },
        // REPOSITORY NAME
        name: {
          type: String,
          required: true,
          trim: true,
        },
        // REPOSITORY FULL NAME
        fullName: {
          type: String,
          required: true,
          trim: true,
        },
        // REPOSITORY ID FROM GITHUB
        repoId: {
          type: Number,
          required: true,
        },
        // REPOSITORY HTML URL
        htmlUrl: {
          type: String,
          required: true,
          trim: true,
        },
        // LINKED AT TIMESTAMP
        linkedAt: {
          type: Date,
          default: Date.now,
        },
        // IS PRIMARY REPOSITORY
        isPrimary: {
          type: Boolean,
          default: false,
        },
        // REPOSITORY DESCRIPTION
        description: {
          type: String,
          default: null,
          trim: true,
        },
        // DEFAULT BRANCH
        defaultBranch: {
          type: String,
          default: "main",
          trim: true,
        },
      },
    ],
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
/**
 * INDEX FOR GITHUB REPO FULL NAME QUERIES
 */
//<== INDEX FOR GITHUB REPO FULL NAME QUERIES ==>
projectSchema.index({ "githubRepo.fullName": 1 }, { sparse: true });
/**
 * COMPOUND INDEX FOR USER AND GITHUB REPO QUERIES
 */
//<== COMPOUND INDEX FOR USER AND GITHUB REPO QUERIES ==>
projectSchema.index({ userId: 1, "githubRepo.fullName": 1 });
/**
 * INDEX FOR LINKED REPOSITORIES FULL NAME QUERIES
 */
//<== INDEX FOR LINKED REPOSITORIES FULL NAME QUERIES ==>
projectSchema.index({ "linkedRepositories.fullName": 1 }, { sparse: true });
/**
 * INDEX FOR LINKED REPOSITORIES REPO ID QUERIES
 */
//<== INDEX FOR LINKED REPOSITORIES REPO ID QUERIES ==>
projectSchema.index({ "linkedRepositories.repoId": 1 }, { sparse: true });

// <== EXPORTING THE PROJECT MODEL ==>
export const Project = mongoose.model("Project", projectSchema);

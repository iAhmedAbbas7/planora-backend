// <== IMPORTS ==>
import mongoose from "mongoose";

// <== LINKED REPOSITORY INTERFACE ==>
export interface ILinkedRepository {
  // <== REPOSITORY OWNER ==>
  owner: string;
  // <== REPOSITORY NAME ==>
  name: string;
  // <== REPOSITORY FULL NAME ==>
  fullName: string;
  // <== REPOSITORY ID FROM GITHUB ==>
  repoId: number;
  // <== LINKED AT TIMESTAMP ==>
  linkedAt: Date;
}

// <== WORKSPACE SCHEMA ==>
const workspaceSchema = new mongoose.Schema(
  {
    // NAME FIELD
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    // DESCRIPTION FIELD
    description: {
      type: String,
      default: "",
      maxlength: 500,
    },
    // AVATAR FIELD (CLOUDINARY URL)
    avatar: {
      type: String,
      default: "",
    },
    // AVATAR PUBLIC ID (FOR CLOUDINARY)
    avatarPublicId: {
      type: String,
      default: "",
    },
    // VISIBILITY FIELD
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
      index: true,
    },
    // OWNER ID FIELD (REF TO USER)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // SETTINGS FIELD
    settings: {
      // DEFAULT ROLE FOR NEW MEMBERS
      defaultRole: {
        type: String,
        enum: ["member", "viewer"],
        default: "member",
      },
      // ALLOW MEMBERS TO INVITE OTHERS
      allowInvites: {
        type: Boolean,
        default: true,
      },
      // NOTIFICATION PREFERENCES
      notificationPrefs: {
        // NOTIFY ON NEW MEMBERS
        onNewMember: {
          type: Boolean,
          default: true,
        },
        // NOTIFY ON TASK UPDATES
        onTaskUpdate: {
          type: Boolean,
          default: true,
        },
        // NOTIFY ON PROJECT UPDATES
        onProjectUpdate: {
          type: Boolean,
          default: true,
        },
        // NOTIFY ON REPOSITORY ACTIVITY
        onRepoActivity: {
          type: Boolean,
          default: false,
        },
      },
    },
    // LINKED REPOSITORIES ARRAY
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
        // REPOSITORY FULL NAME (owner/name)
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
        // LINKED AT TIMESTAMP
        linkedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // IS ARCHIVED FIELD
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    // ARCHIVED AT TIMESTAMP
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * TEXT INDEX FOR SEARCH FUNCTIONALITY
 */
//<== TEXT INDEX FOR SEARCH FUNCTIONALITY ==>
workspaceSchema.index({
  name: "text",
  description: "text",
});
/**
 * COMPOUND INDEX FOR OWNER AND VISIBILITY QUERIES
 */
//<== COMPOUND INDEX FOR OWNER AND VISIBILITY QUERIES ==>
workspaceSchema.index({ ownerId: 1, visibility: 1 });
/**
 * COMPOUND INDEX FOR OWNER AND ARCHIVED STATUS QUERIES
 */
//<== COMPOUND INDEX FOR OWNER AND ARCHIVED STATUS QUERIES ==>
workspaceSchema.index({ ownerId: 1, isArchived: 1 });
/**
 * INDEX FOR LINKED REPOSITORIES QUERIES
 */
//<== INDEX FOR LINKED REPOSITORIES QUERIES ==>
workspaceSchema.index({ "linkedRepositories.fullName": 1 }, { sparse: true });
/**
 * INDEX FOR LINKED REPOSITORIES REPO ID
 */
//<== INDEX FOR LINKED REPOSITORIES REPO ID ==>
workspaceSchema.index({ "linkedRepositories.repoId": 1 }, { sparse: true });

// <== EXPORTING THE WORKSPACE MODEL ==>
export const Workspace = mongoose.model("Workspace", workspaceSchema);

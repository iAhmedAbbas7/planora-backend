// <== IMPORTS ==>
import mongoose from "mongoose";

// <== WORKSPACE MEMBER SCHEMA ==>
const workspaceMemberSchema = new mongoose.Schema(
  {
    // WORKSPACE ID FIELD (REF TO WORKSPACE)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    // USER ID FIELD (REF TO USER)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // ROLE FIELD
    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      default: "member",
      index: true,
    },
    // PERMISSIONS FIELD
    permissions: {
      // CAN INVITE NEW MEMBERS
      canInvite: {
        type: Boolean,
        default: false,
      },
      // CAN REMOVE MEMBERS
      canRemove: {
        type: Boolean,
        default: false,
      },
      // CAN EDIT WORKSPACE SETTINGS
      canEditSettings: {
        type: Boolean,
        default: false,
      },
      // CAN MANAGE PROJECTS
      canManageProjects: {
        type: Boolean,
        default: true,
      },
      // CAN MANAGE REPOSITORIES
      canManageRepos: {
        type: Boolean,
        default: false,
      },
    },
    // JOINED AT TIMESTAMP
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    // INVITED BY FIELD (REF TO USER)
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // STATUS FIELD
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND UNIQUE INDEX FOR WORKSPACE AND USER (NO DUPLICATE MEMBERSHIPS)
 */
//<== COMPOUND UNIQUE INDEX FOR WORKSPACE AND USER ==>
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
/**
 * COMPOUND INDEX FOR WORKSPACE AND ROLE QUERIES
 */
//<== COMPOUND INDEX FOR WORKSPACE AND ROLE QUERIES ==>
workspaceMemberSchema.index({ workspaceId: 1, role: 1 });
/**
 * COMPOUND INDEX FOR WORKSPACE AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR WORKSPACE AND STATUS QUERIES ==>
workspaceMemberSchema.index({ workspaceId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND STATUS (FOR FINDING ALL USER MEMBERSHIPS)
 */
//<== COMPOUND INDEX FOR USER AND STATUS ==>
workspaceMemberSchema.index({ userId: 1, status: 1 });

// <== MIDDLEWARE TO SET PERMISSIONS BASED ON ROLE ==>
workspaceMemberSchema.pre("save", function (next) {
  // IF ROLE IS OWNER OR ADMIN, GRANT ALL PERMISSIONS
  if (this.role === "owner" || this.role === "admin") {
    this.permissions = {
      canInvite: true,
      canRemove: this.role === "owner" ? true : false,
      canEditSettings: true,
      canManageProjects: true,
      canManageRepos: true,
    };
  }
  // IF ROLE IS MEMBER, GRANT LIMITED PERMISSIONS
  else if (this.role === "member") {
    this.permissions = {
      canInvite: false,
      canRemove: false,
      canEditSettings: false,
      canManageProjects: true,
      canManageRepos: false,
    };
  }
  // IF ROLE IS VIEWER, GRANT MINIMAL PERMISSIONS
  else if (this.role === "viewer") {
    this.permissions = {
      canInvite: false,
      canRemove: false,
      canEditSettings: false,
      canManageProjects: false,
      canManageRepos: false,
    };
  }
  next();
});

// <== EXPORTING THE WORKSPACE MEMBER MODEL ==>
export const WorkspaceMember = mongoose.model(
  "WorkspaceMember",
  workspaceMemberSchema
);

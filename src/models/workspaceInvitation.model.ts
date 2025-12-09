// <== IMPORTS ==>
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

// <== WORKSPACE INVITATION SCHEMA ==>
const workspaceInvitationSchema = new mongoose.Schema(
  {
    // WORKSPACE ID FIELD (REF TO WORKSPACE)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    // INVITER ID FIELD (REF TO USER)
    inviterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // INVITEE EMAIL FIELD
    inviteeEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
      index: true,
    },
    // ROLE FIELD (ROLE TO BE ASSIGNED UPON ACCEPTANCE)
    role: {
      type: String,
      enum: ["admin", "member", "viewer"],
      default: "member",
    },
    // TOKEN FIELD (UNIQUE INVITATION TOKEN)
    token: {
      type: String,
      unique: true,
      default: () => uuidv4(),
      index: true,
    },
    // STATUS FIELD
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending",
      index: true,
    },
    // EXPIRES AT TIMESTAMP (7 DAYS FROM CREATION)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      index: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR WORKSPACE AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR WORKSPACE AND STATUS QUERIES ==>
workspaceInvitationSchema.index({ workspaceId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR WORKSPACE AND INVITEE EMAIL (PREVENT DUPLICATE PENDING INVITES)
 */
//<== COMPOUND INDEX FOR WORKSPACE AND INVITEE EMAIL ==>
workspaceInvitationSchema.index({ workspaceId: 1, inviteeEmail: 1, status: 1 });
/**
 * INDEX FOR EXPIRATION QUERIES (FOR CRON JOB CLEANUP)
 */
//<== INDEX FOR EXPIRATION QUERIES ==>
workspaceInvitationSchema.index({ expiresAt: 1, status: 1 });

// <== MIDDLEWARE TO CHECK EXPIRATION BEFORE SAVE ==>
workspaceInvitationSchema.pre("save", function (next) {
  // IF STATUS IS PENDING AND EXPIRED, UPDATE STATUS
  if (this.status === "pending" && this.expiresAt < new Date()) {
    this.status = "expired";
  }
  next();
});
// <== STATIC METHOD TO EXPIRE OLD INVITATIONS ==>
workspaceInvitationSchema.statics.expireOldInvitations = async function () {
  // UPDATE ALL PENDING INVITATIONS THAT HAVE EXPIRED
  const result = await this.updateMany(
    {
      status: "pending",
      expiresAt: { $lt: new Date() },
    },
    {
      $set: { status: "expired" },
    }
  );
  return result;
};

// <== EXPORTING THE WORKSPACE INVITATION MODEL ==>
export const WorkspaceInvitation = mongoose.model(
  "WorkspaceInvitation",
  workspaceInvitationSchema
);

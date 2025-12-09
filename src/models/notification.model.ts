// <== IMPORTS ==>
import mongoose from "mongoose";

// <== NOTIFICATION TYPES ==>
export type NotificationType =
  | "project_created"
  | "project_updated"
  | "project_deleted"
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "task_due_soon"
  | "workspace_created"
  | "workspace_updated"
  | "workspace_deleted"
  | "workspace_member_added"
  | "workspace_member_removed"
  | "workspace_invitation_received";

// <== NOTIFICATION INTERFACE ==>
export interface INotification {
  // <== USER ID FIELD ==>
  userId: mongoose.Types.ObjectId;
  // <== TYPE FIELD ==>
  type: NotificationType;
  // <== TITLE FIELD ==>
  title: string;
  // <== MESSAGE FIELD ==>
  message: string;
  // <== RELATED ID FIELD ==>
  relatedId?: string;
  // <== IS READ FIELD ==>
  isRead: boolean;
  // <== CREATED AT FIELD ==>
  createdAt: Date;
  // <== UPDATED AT FIELD ==>
  updatedAt: Date;
}

// <== NOTIFICATION SCHEMA ==>
const notificationSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // TYPE FIELD
    type: {
      type: String,
      required: true,
      enum: [
        "project_created",
        "project_updated",
        "project_deleted",
        "task_created",
        "task_updated",
        "task_deleted",
        "task_due_soon",
        "workspace_created",
        "workspace_updated",
        "workspace_deleted",
        "workspace_member_added",
        "workspace_member_removed",
        "workspace_invitation_received",
      ],
      index: true,
    },
    // TITLE FIELD
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // MESSAGE FIELD
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    // RELATED ID FIELD
    relatedId: {
      type: String,
      required: false,
      index: true,
    },
    // IS READ FIELD
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND CREATED AT QUERIES
 */
//<== COMPOUND INDEX FOR USER AND CREATED AT QUERIES ==>
notificationSchema.index({ userId: 1, createdAt: -1 });
/**
 * COMPOUND INDEX FOR USER AND IS READ QUERIES
 */
//<== COMPOUND INDEX FOR USER AND IS READ QUERIES ==>
notificationSchema.index({ userId: 1, isRead: 1 });
/**
 * COMPOUND INDEX FOR USER, TYPE, AND IS READ QUERIES
 */
//<== COMPOUND INDEX FOR USER, TYPE, AND IS READ QUERIES ==>
notificationSchema.index({ userId: 1, type: 1, isRead: 1 });

// <== EXPORTING THE NOTIFICATION MODEL ==>
export const Notification = mongoose.model("Notification", notificationSchema);

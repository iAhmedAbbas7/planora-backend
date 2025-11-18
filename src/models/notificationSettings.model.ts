// <== IMPORTS ==>
import mongoose from "mongoose";

// <== NOTIFICATION SETTINGS SCHEMA ==>
const notificationSettingsSchema = new mongoose.Schema(
  {
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // TASK REMINDERS FIELD
    taskReminders: {
      type: Boolean,
      default: true,
    },
    // DUE DATE ALERTS FIELD
    dueDateAlerts: {
      type: Boolean,
      default: true,
    },
    // EMAIL UPDATES FIELD
    emailUpdates: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * UNIQUE INDEX FOR USER ID (ALREADY SET IN SCHEMA)
 */
//<== UNIQUE INDEX FOR USER ID (ALREADY SET IN SCHEMA) ==>
notificationSettingsSchema.index({ userId: 1 }, { unique: true });

// <== EXPORTING THE NOTIFICATION SETTINGS MODEL ==>
export const NotificationSettings = mongoose.model(
  "NotificationSettings",
  notificationSettingsSchema
);

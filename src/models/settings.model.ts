// <== IMPORTS ==>
import mongoose from "mongoose";

// <== SETTINGS SCHEMA ==>
const settingsSchema = new mongoose.Schema(
  {
    // USER REFERENCE (ONE-TO-ONE RELATIONSHIP)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // APPEARANCE SETTINGS
    appearance: {
      // THEME PREFERENCE
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      // ACCENT COLOR
      accentColor: {
        type: String,
        enum: ["violet", "pink", "blue", "green"],
        default: "violet",
      },
    },
  },
  { timestamps: true }
);

// <== EXPORTING THE SETTINGS MODEL ==>
export const Settings = mongoose.model("Settings", settingsSchema);

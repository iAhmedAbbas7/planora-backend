// <== IMPORTS ==>
import mongoose from "mongoose";

// <== USER SCHEMA ==>
const userSchema = new mongoose.Schema(
  {
    // NAME FIELD
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // BIO FIELD
    bio: {
      type: String,
      default: "",
      maxlength: 500,
    },
    // PROFILE PICTURE FIELD
    profilePic: {
      type: String,
      default: "",
    },
    // EMAIL FIELD
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    // PASSWORD FIELD
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR EMAIL AND NAME SEARCHES
 */
//<== COMPOUND INDEX FOR EMAIL AND NAME SEARCHES ==>
userSchema.index({ email: 1, name: 1 });
/**
 * TEXT INDEX FOR SEARCH FUNCTIONALITY
 */
//<== TEXT INDEX FOR SEARCH FUNCTIONALITY ==>
userSchema.index({
  name: "text",
  email: "text",
});

// <== EXPORTING THE USER MODEL ==>
export const User = mongoose.model("User", userSchema);

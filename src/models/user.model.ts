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
    // PASSWORD FIELD (OPTIONAL FOR OAUTH USERS)
    password: {
      type: String,
      required: function (this: { provider?: string }) {
        return !this.provider;
      },
      minlength: 6,
      select: false,
    },
    // OAUTH PROVIDER FIELD
    provider: {
      type: String,
      enum: ["google", "github"],
      default: null,
    },
    // OAUTH PROVIDER ID FIELD
    providerId: {
      type: String,
      default: null,
      sparse: true,
    },
    // OAUTH PROVIDER EMAIL FIELD
    providerEmail: {
      type: String,
      default: null,
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
/**
 * COMPOUND INDEX FOR OAUTH PROVIDER AND PROVIDER ID
 */
userSchema.index(
  { provider: 1, providerId: 1 },
  { unique: true, sparse: true }
);

// <== EXPORTING THE USER MODEL ==>
export const User = mongoose.model("User", userSchema);

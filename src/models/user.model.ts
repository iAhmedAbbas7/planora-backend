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
    // ROLE FIELD
    role: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    // PROFILE PICTURE FIELD
    profilePic: {
      type: String,
      default: "",
    },
    // PROFILE PICTURE PUBLIC ID (FOR CLOUDINARY)
    profilePicPublicId: {
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
    // FLAGGED FOR DELETION FIELD
    flaggedForDeletion: {
      type: Boolean,
      default: false,
      index: true,
    },
    // FLAGGED AT TIMESTAMP
    flaggedAt: {
      type: Date,
      default: null,
      index: true,
    },
    // TWO-FACTOR AUTHENTICATION ENABLED FIELD
    isTwoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    // TOTP SECRET FIELD (ENCRYPTED)
    totpSecret: {
      type: String,
      default: null,
      select: false,
    },
    // BACKUP CODES FIELD
    backupCodes: [
      {
        // CODE FIELD
        code: {
          type: String,
          required: true,
        },
        // USED FIELD
        used: {
          type: Boolean,
          default: false,
        },
        // USED AT TIMESTAMP FIELD
        usedAt: {
          type: Date,
          default: null,
        },
      },
    ],
    // BACKUP CODES GENERATED AT TIMESTAMP
    backupCodesGeneratedAt: {
      type: Date,
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
/**
 * COMPOUND INDEX FOR FLAGGED ACCOUNTS AND FLAGGED DATE (FOR CRON JOB)
 */
//<== COMPOUND INDEX FOR FLAGGED ACCOUNTS AND FLAGGED DATE ==>
userSchema.index({ flaggedForDeletion: 1, flaggedAt: 1 });
/**
 * INDEX FOR TWO-FACTOR AUTHENTICATION STATUS
 */
//<== INDEX FOR TWO-FACTOR AUTHENTICATION STATUS ==>
userSchema.index({ isTwoFactorEnabled: 1 });

// <== EXPORTING THE USER MODEL ==>
export const User = mongoose.model("User", userSchema);

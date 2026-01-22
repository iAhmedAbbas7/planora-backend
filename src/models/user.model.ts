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
    // RECOVERY EMAIL FIELD
    recoveryEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    // RECOVERY EMAIL VERIFIED FIELD
    recoveryEmailVerified: {
      type: Boolean,
      default: false,
    },
    // RECOVERY EMAIL VERIFIED AT TIMESTAMP
    recoveryEmailVerifiedAt: {
      type: Date,
      default: null,
    },
    // PHONE NUMBER FIELD
    phoneNumber: {
      type: String,
      default: null,
      trim: true,
      match: [
        /^\+[1-9]\d{1,14}$/,
        "Please provide a valid phone number with country code",
      ],
    },
    // PHONE NUMBER VERIFIED FIELD
    phoneNumberVerified: {
      type: Boolean,
      default: false,
    },
    // PHONE NUMBER VERIFIED AT TIMESTAMP
    phoneNumberVerifiedAt: {
      type: Date,
      default: null,
    },
    // GITHUB ACCESS TOKEN (ENCRYPTED)
    githubAccessToken: {
      type: String,
      default: null,
      select: false,
    },
    // GITHUB USERNAME
    githubUsername: {
      type: String,
      default: null,
      trim: true,
    },
    // GITHUB CONNECTED TIMESTAMP
    githubConnectedAt: {
      type: Date,
      default: null,
    },
    // GITHUB OAUTH SCOPES GRANTED
    githubScopes: {
      type: [String],
      default: [],
    },
    // PERSONAL WORKSPACE ID (AUTO-CREATED FOR EACH USER)
    personalWorkspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
    },
    // SUBSCRIPTION ID REFERENCE
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    // STRIPE CUSTOMER ID
    stripeCustomerId: {
      type: String,
      default: null,
    },
    // ONBOARDING COMPLETED FLAG
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    // SELECTED PLAN (BEFORE CHECKOUT)
    selectedPlan: {
      type: String,
      enum: ["individual", "team", "enterprise", null],
      default: null,
    },
    // LAST ACTIVE TIMESTAMP
    lastActiveAt: {
      type: Date,
      default: null,
    },
    // PREFERRED BILLING CYCLE
    preferredBillingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    // REFERRAL CODE
    referralCode: {
      type: String,
      default: null,
    },
    // REFERRED BY (USER ID WHO REFERRED THIS USER)
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // TIMEZONE PREFERENCE
    timezone: {
      type: String,
      default: "UTC",
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
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
//<== COMPOUND INDEX FOR OAUTH PROVIDER AND PROVIDER ID ==>
userSchema.index(
  { provider: 1, providerId: 1 },
  { unique: true, sparse: true }
);
/**
 * COMPOUND INDEX FOR EMAIL AND NAME SEARCHES
 */
//<== COMPOUND INDEX FOR EMAIL AND NAME SEARCHES ==>
userSchema.index({ email: 1, name: 1 });
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
/**
 * INDEX FOR RECOVERY EMAIL
 */
//<== INDEX FOR RECOVERY EMAIL ==>
userSchema.index({ recoveryEmail: 1 }, { sparse: true });
/**
 * INDEX FOR PHONE NUMBER
 */
//<== INDEX FOR PHONE NUMBER ==>
userSchema.index({ phoneNumber: 1 }, { sparse: true });
/**
 * INDEX FOR GITHUB USERNAME
 */
//<== INDEX FOR GITHUB USERNAME ==>
userSchema.index({ githubUsername: 1 }, { sparse: true });
/**
 * INDEX FOR SUBSCRIPTION ID
 */
//<== INDEX FOR SUBSCRIPTION ID ==>
userSchema.index({ subscriptionId: 1 }, { sparse: true });
/**
 * INDEX FOR STRIPE CUSTOMER ID
 */
//<== INDEX FOR STRIPE CUSTOMER ID ==>
userSchema.index({ stripeCustomerId: 1 }, { sparse: true });
/**
 * INDEX FOR ONBOARDING STATUS
 */
//<== INDEX FOR ONBOARDING STATUS ==>
userSchema.index({ onboardingCompleted: 1 });
/**
 * INDEX FOR REFERRAL CODE
 */
//<== INDEX FOR REFERRAL CODE ==>
userSchema.index({ referralCode: 1 }, { unique: true, sparse: true });

// <== EXPORTING THE USER MODEL ==>
export const User = mongoose.model("User", userSchema);

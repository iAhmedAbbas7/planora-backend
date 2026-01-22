// <== IMPORTS ==>
import mongoose from "mongoose";

// <== PLAN TYPE ENUMS ==>
export const PLAN_TYPES = ["free", "free_trial", "individual", "team", "enterprise"] as const;
// <== PLAN TYPE ==>
export type PlanType = (typeof PLAN_TYPES)[number];
// <== BILLING CYCLE ENUMS ==>
export const BILLING_CYCLES = ["monthly", "yearly"] as const;
// <== BILLING CYCLE ==>
export type BillingCycle = (typeof BILLING_CYCLES)[number];

// <== SUBSCRIPTION STATUS ENUM ==>
export const SUBSCRIPTION_STATUSES = [
  "active",
  "cancelled",
  "past_due",
  "trialing",
  "expired",
  "incomplete",
  "incomplete_expired",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// <== PLAN LIMITS INTERFACE ==>
export interface IPlanLimits {
  // <== MAXIMUM NUMBER OF PROJECTS ==>
  projects: number;
  // <== MAXIMUM NUMBER OF LINKED REPOSITORIES ==>
  repos: number;
  // <== MAXIMUM NUMBER OF TEAM MEMBERS (-1 = UNLIMITED) ==>
  teamMembers: number;
  // <== MAXIMUM AI REQUESTS PER DAY (-1 = UNLIMITED) ==>
  aiRequestsPerDay: number;
  // <== MAXIMUM CODE REVIEWS PER MONTH (-1 = UNLIMITED) ==>
  codeReviewsPerMonth: number;
  // <== MAXIMUM WORKSPACES (-1 = UNLIMITED) ==>
  workspaces: number;
  // <== MAXIMUM STORAGE IN MB (-1 = UNLIMITED) ==>
  storageMB: number;
  // <== MAXIMUM ACTIVE SESSIONS (DEVICES) ==>
  maxSessions: number;
}

// <== USAGE TRACKING INTERFACE ==>
export interface IUsageTracking {
  // <== CURRENT NUMBER OF PROJECTS ==>
  projectsCount: number;
  // <== CURRENT NUMBER OF LINKED REPOSITORIES ==>
  reposCount: number;
  // <== CURRENT NUMBER OF TEAM MEMBERS ==>
  teamMembersCount: number;
  // <== CURRENT NUMBER OF WORKSPACES ==>   
  workspacesCount: number;
  // <== AI REQUESTS MADE TODAY ==>
  aiRequestsToday: number;
  // <== TIMESTAMP WHEN AI REQUESTS RESET ==> 
  aiRequestsResetAt: Date | null;
  // <== CODE REVIEWS MADE THIS MONTH ==>
  codeReviewsThisMonth: number;
  // <== TIMESTAMP WHEN CODE REVIEWS RESET ==>
  codeReviewsResetAt: Date | null;
  // <== STORAGE USED IN MB ==> 
  storageUsedMB: number;
}

// <== SUBSCRIPTION SCHEMA ==>
const subscriptionSchema = new mongoose.Schema(
  {
    // USER ID REFERENCE
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // PLAN TYPE
    plan: {
      type: String,
      enum: PLAN_TYPES,
      default: "free",
      required: true,
      index: true,
    },
    // TRIAL PLAN (WHICH PAID PLAN USER IS TRIALING, IF ANY)
    trialPlan: {
      type: String,
      enum: ["individual", "team", "enterprise", null],
      default: null,
    },
    // BILLING CYCLE
    billingCycle: {
      type: String,
      enum: BILLING_CYCLES,
      default: "monthly",
    },
    // SUBSCRIPTION STATUS
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: "active",
      required: true,
      index: true,
    },
    // STRIPE CUSTOMER ID
    stripeCustomerId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    // STRIPE SUBSCRIPTION ID
    stripeSubscriptionId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    // STRIPE PRICE ID
    stripePriceId: {
      type: String,
      default: null,
    },
    // STRIPE PAYMENT METHOD ID
    stripePaymentMethodId: {
      type: String,
      default: null,
    },
    // TRIAL END DATE
    trialEndsAt: {
      type: Date,
      default: null,
      index: true,
    },
    // CURRENT BILLING PERIOD START
    currentPeriodStart: {
      type: Date,
      default: null,
    },
    // CURRENT BILLING PERIOD END
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    // CANCEL AT PERIOD END FLAG
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    // CANCELLED AT TIMESTAMP
    cancelledAt: {
      type: Date,
      default: null,
    },
    // PLAN LIMITS
    limits: {
      // MAXIMUM NUMBER OF PROJECTS
      projects: {
        type: Number,
        default: 3,
      },
      // MAXIMUM NUMBER OF LINKED REPOSITORIES
      repos: {
        type: Number,
        default: 3,
      },
      // MAXIMUM NUMBER OF TEAM MEMBERS
      teamMembers: {
        type: Number,
        default: 1,
      },
      // MAXIMUM AI REQUESTS PER DAY
      aiRequestsPerDay: {
        type: Number,
        default: 10,
      },
      // MAXIMUM CODE REVIEWS PER MONTH
      codeReviewsPerMonth: {
        type: Number,
        default: 0,
      },
      // MAXIMUM WORKSPACES
      workspaces: {
        type: Number,
        default: 0,
      },
      // MAXIMUM STORAGE IN MB
      storageMB: {
        type: Number,
        default: 100,
      },
      // MAXIMUM ACTIVE SESSIONS (DEVICES)
      maxSessions: {
        type: Number,
        default: 3,
      },
    },
    // USAGE TRACKING
    usage: {
      // CURRENT NUMBER OF PROJECTS
      projectsCount: {
        type: Number,
        default: 0,
      },
      // CURRENT NUMBER OF LINKED REPOSITORIES
      reposCount: {
        type: Number,
        default: 0,
      },
      // CURRENT NUMBER OF TEAM MEMBERS
      teamMembersCount: {
        type: Number,
        default: 0,
      },
      // CURRENT NUMBER OF WORKSPACES
      workspacesCount: {
        type: Number,
        default: 0,
      },
      // AI REQUESTS MADE TODAY
      aiRequestsToday: {
        type: Number,
        default: 0,
      },
      // TIMESTAMP WHEN AI REQUESTS RESET
      aiRequestsResetAt: {
        type: Date,
        default: null,
      },
      // CODE REVIEWS MADE THIS MONTH
      codeReviewsThisMonth: {
        type: Number,
        default: 0,
      },
      // TIMESTAMP WHEN CODE REVIEWS RESET
      codeReviewsResetAt: {
        type: Date,
        default: null,
      },
      // STORAGE USED IN MB
      storageUsedMB: {
        type: Number,
        default: 0,
      },
    },
    // FEATURES ENABLED FOR THIS SUBSCRIPTION
    features: {
      // GITHUB INTEGRATION
      githubIntegration: {
        type: Boolean,
        default: true,
      },
      // AI TASK SUGGESTIONS
      aiTaskSuggestions: {
        type: Boolean,
        default: true,
      },
      // AI CODE REVIEW
      aiCodeReview: {
        type: Boolean,
        default: false,
      },
      // AI BUG DETECTION
      aiBugDetection: {
        type: Boolean,
        default: false,
      },
      // CODE EXPLANATION
      codeExplanation: {
        type: Boolean,
        default: true,
      },
      // FOCUS MODE
      focusMode: {
        type: Boolean,
        default: true,
      },
      // CUSTOM THEMES
      customThemes: {
        type: Boolean,
        default: true,
      },
      // ADVANCED REPORTS
      advancedReports: {
        type: Boolean,
        default: false,
      },
      // TEAM COLLABORATION
      teamCollaboration: {
        type: Boolean,
        default: false,
      },
      // WORKSPACES
      workspaces: {
        type: Boolean,
        default: false,
      },
      // SSO (SINGLE SIGN-ON)
      sso: {
        type: Boolean,
        default: false,
      },
      // AUDIT LOGS
      auditLogs: {
        type: Boolean,
        default: false,
      },
      // PRIORITY SUPPORT
      prioritySupport: {
        type: Boolean,
        default: false,
      },
      // DEDICATED SUPPORT
      dedicatedSupport: {
        type: Boolean,
        default: false,
      },
      // CUSTOM INTEGRATIONS
      customIntegrations: {
        type: Boolean,
        default: false,
      },
      // SPRINT PLANNING
      sprintPlanning: {
        type: Boolean,
        default: false,
      },
      // GOALS AND OKRS
      goalsAndOkrs: {
        type: Boolean,
        default: false,
      },
    },
    // METADATA FOR ADDITIONAL INFO
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND STATUS QUERIES
 */
// <== COMPOUND INDEX FOR USER AND STATUS QUERIES ==>
subscriptionSchema.index({ userId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR STRIPE SUBSCRIPTION LOOKUPS
 */
// <== COMPOUND INDEX FOR STRIPE SUBSCRIPTION LOOKUPS ==>
subscriptionSchema.index({ stripeSubscriptionId: 1, stripeCustomerId: 1 });
/**
 * INDEX FOR TRIAL EXPIRY QUERIES
 */
// <== INDEX FOR TRIAL EXPIRY QUERIES ==>
subscriptionSchema.index({ status: 1, trialEndsAt: 1 });
/**
 * INDEX FOR BILLING PERIOD QUERIES
 */
// <== INDEX FOR BILLING PERIOD QUERIES ==>
subscriptionSchema.index({ currentPeriodEnd: 1 });
// <== VIRTUAL FOR IS ACTIVE ==>
subscriptionSchema.virtual("isActive").get(function () {
  // RETURN TRUE IF SUBSCRIPTION IS ACTIVE OR TRIALING
  return this.status === "active" || this.status === "trialing";
});
// <== VIRTUAL FOR IS TRIAL ==>
subscriptionSchema.virtual("isTrial").get(function () {
  // RETURN TRUE IF STATUS IS TRIALING
  return this.status === "trialing";
});
// <== VIRTUAL FOR TRIAL DAYS REMAINING ==>
subscriptionSchema.virtual("trialDaysRemaining").get(function () {
  // IF NOT TRIALING OR NO TRIAL END DATE, RETURN 0
  if (this.status !== "trialing" || !this.trialEndsAt) return 0;
  // GET CURRENT DATE
  const now = new Date();
  // GET TRIAL END DATE
  // CREATE NEW DATE OBJECT FROM TRIAL END DATE
  const trialEnd = new Date(this.trialEndsAt);
  // CALCULATE DIFFERENCE IN TIME
  const diffTime = trialEnd.getTime() - now.getTime();
  // CALCULATE DIFFERENCE IN DAYS
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  // RETURN DAYS REMAINING OR 0 IF NEGATIVE
  return Math.max(0, diffDays);
});
// <== VIRTUAL FOR CAN USE FEATURE ==>
subscriptionSchema.methods.canUseFeature = function (featureKey: string): boolean {
  // CHECK IF SUBSCRIPTION IS ACTIVE
  if (this.status !== "active" && this.status !== "trialing") {
    // RETURN FALSE
    return false;
  }
  // CHECK IF FEATURE EXISTS AND IS ENABLED
  return this.features?.[featureKey] === true;
};
// <== METHOD TO CHECK LIMIT ==>
subscriptionSchema.methods.isWithinLimit = function (
  limitKey: keyof IPlanLimits,
  usageKey: keyof IUsageTracking
): boolean {
  // GET LIMIT VALUE
  const limit = this.limits?.[limitKey];
  // GET CURRENT USAGE
  const usage = this.usage?.[usageKey];
  // IF LIMIT IS -1 (UNLIMITED), RETURN TRUE
  if (limit === -1) return true;
  // IF LIMIT OR USAGE IS UNDEFINED, RETURN FALSE
  if (limit === undefined || usage === undefined) return false;
  // RETURN TRUE IF USAGE IS WITHIN LIMIT
  return usage < limit;
};
// <== METHOD TO GET REMAINING QUOTA ==>
subscriptionSchema.methods.getRemainingQuota = function (
  limitKey: keyof IPlanLimits,
  usageKey: keyof IUsageTracking
): number {
  // GET LIMIT VALUE
  const limit = this.limits?.[limitKey];
  // GET CURRENT USAGE
  const usage = this.usage?.[usageKey];
  // IF LIMIT IS -1 (UNLIMITED), RETURN -1
  if (limit === -1) return -1;
  // IF LIMIT OR USAGE IS UNDEFINED, RETURN 0
  if (limit === undefined || usage === undefined) return 0;
  // RETURN REMAINING QUOTA
  return Math.max(0, limit - usage);
};
// <== ENSURE VIRTUALS ARE INCLUDED IN JSON AND OBJECT OUTPUT ==>
subscriptionSchema.set("toJSON", { virtuals: true });
// <== ENSURE VIRTUALS ARE INCLUDED IN OBJECT OUTPUT ==>
subscriptionSchema.set("toObject", { virtuals: true });

// <== EXPORTING THE SUBSCRIPTION MODEL ==>
export const Subscription = mongoose.model("Subscription", subscriptionSchema);

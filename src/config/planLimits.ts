// <== IMPORTS ==>
import { IPlanLimits, PlanType } from "../models/subscription.model.js";

// <== FEATURE KEYS ==>
export const FEATURE_KEYS = [
  "githubIntegration",
  "aiTaskSuggestions",
  "aiCodeReview",
  "aiBugDetection",
  "codeExplanation",
  "focusMode",
  "customThemes",
  "advancedReports",
  "teamCollaboration",
  "workspaces",
  "sso",
  "auditLogs",
  "prioritySupport",
  "dedicatedSupport",
  "customIntegrations",
  "sprintPlanning",
  "goalsAndOkrs",
] as const;

// <== FEATURE KEY TYPE ==>
export type FeatureKey = (typeof FEATURE_KEYS)[number];

// <== PLAN FEATURES INTERFACE ==>
export interface IPlanFeatures {
  // <== GITHUB INTEGRATION ==>
  githubIntegration: boolean;
  // <== AI TASK SUGGESTIONS ==>    
  aiTaskSuggestions: boolean;
  // <== AI CODE REVIEW ==> 
  aiCodeReview: boolean;
  // <== AI BUG DETECTION ==>
  aiBugDetection: boolean;
  // <== CODE EXPLANATION ==>
  codeExplanation: boolean;
  // <== FOCUS MODE ==>
  focusMode: boolean;
  // <== CUSTOM THEMES ==>
  customThemes: boolean;
  // <== ADVANCED REPORTS ==>
  advancedReports: boolean;
  // <== TEAM COLLABORATION ==>
  teamCollaboration: boolean;
  // <== WORKSPACES ==>
  workspaces: boolean;
  // <== SSO (SINGLE SIGN-ON) ==>
  sso: boolean;
  // <== AUDIT LOGS ==>     
  auditLogs: boolean;
  // <== PRIORITY SUPPORT ==>
  prioritySupport: boolean;
  // <== DEDICATED SUPPORT ==>
  dedicatedSupport: boolean;
  // <== CUSTOM INTEGRATIONS ==>      
  customIntegrations: boolean;
  // <== SPRINT PLANNING ==>
  sprintPlanning: boolean;
  // <== GOALS AND OKRS ==>
  goalsAndOkrs: boolean;
}

// <== PLAN PRICING INTERFACE ==>
export interface IPlanPricing {
  // <== MONTHLY PRICE IN DOLLARS ==>
  monthly: number;
  // <== YEARLY PRICE IN DOLLARS (TOTAL FOR YEAR) ==>
  yearly: number;
  // <== YEARLY SAVINGS IN DOLLARS ==>
  yearlySavings: number;
}

// <== PLAN CONFIGURATION INTERFACE ==>
export interface IPlanConfig {
  // <== PLAN NAME ==>
  name: string;
  // <== PLAN DESCRIPTION ==>
  description: string;
  // <== PLAN TAGLINE ==>
  tagline: string;
  // <== PRICING ==>
  pricing: IPlanPricing;
  // <== LIMITS ==>
  limits: IPlanLimits;
  // <== FEATURES ==>
  features: IPlanFeatures;
  // <== IS POPULAR FLAG ==>      
  isPopular: boolean;
  // <== IS ENTERPRISE FLAG ==>
  isEnterprise: boolean;
  // <== STRIPE PRICE IDS ==>
  stripePriceIds: {
    // <== MONTHLY PRICE ID ==>
    monthly: string;
    // <== YEARLY PRICE ID ==>
    yearly: string;
  };
}

// <== PLAN LIMITS CONFIGURATION ==>
export const PLAN_LIMITS: Record<PlanType, IPlanConfig> = {
  // <== FREE PLAN (PERMANENT, LIMITED) ==>
  free: {
    name: "Free",
    description: "Basic access to PlanOra forever",
    tagline: "Get started for free",
    pricing: {
      monthly: 0,
      yearly: 0,
      yearlySavings: 0,
    },
    limits: {
      projects: 2,
      repos: 2,
      teamMembers: 1,
      aiRequestsPerDay: 5,
      codeReviewsPerMonth: 0,
      workspaces: 0,
      storageMB: 50,
      maxSessions: 2,
    },
    features: {
      githubIntegration: true,
      aiTaskSuggestions: true,
      aiCodeReview: false,
      aiBugDetection: false,
      codeExplanation: false,
      focusMode: true,
      customThemes: false,
      advancedReports: false,
      teamCollaboration: false,
      workspaces: false,
      sso: false,
      auditLogs: false,
      prioritySupport: false,
      dedicatedSupport: false,
      customIntegrations: false,
      sprintPlanning: false,
      goalsAndOkrs: false,
    },
    isPopular: false,
    isEnterprise: false,
    stripePriceIds: {
      monthly: "",
      yearly: "",
    },
  },
  // <== FREE TRIAL PLAN (TEMPORARY TRIAL OF A PAID PLAN) ==>
  free_trial: {
    name: "Free Trial",
    description: "Try premium features free for 14 days",
    tagline: "Experience premium features",
    pricing: {
      monthly: 0,
      yearly: 0,
      yearlySavings: 0,
    },
    limits: {
      projects: 5,
      repos: 5,
      teamMembers: 1,
      aiRequestsPerDay: 20,
      codeReviewsPerMonth: 5,
      workspaces: 1,
      storageMB: 200,
      maxSessions: 3,
    },
    features: {
      githubIntegration: true,
      aiTaskSuggestions: true,
      aiCodeReview: true,
      aiBugDetection: false,
      codeExplanation: true,
      focusMode: true,
      customThemes: true,
      advancedReports: false,
      teamCollaboration: false,
      workspaces: true,
      sso: false,
      auditLogs: false,
      prioritySupport: false,
      dedicatedSupport: false,
      customIntegrations: false,
      sprintPlanning: false,
      goalsAndOkrs: true,
    },
    isPopular: false,
    isEnterprise: false,
    stripePriceIds: {
      monthly: "",
      yearly: "",
    },
  },
  // <== INDIVIDUAL PLAN ==>
  individual: {
    name: "Individual",
    description: "Perfect for solo developers and freelancers",
    tagline: "For solo developers",
    pricing: {
      monthly: 9,
      yearly: 90,
      yearlySavings: 18,
    },
    limits: {
      projects: 10,
      repos: 10,
      teamMembers: 1,
      aiRequestsPerDay: 50,
      codeReviewsPerMonth: 10,
      workspaces: 0,
      storageMB: 500,
      maxSessions: 5,
    },
    features: {
      githubIntegration: true,
      aiTaskSuggestions: true,
      aiCodeReview: true,
      aiBugDetection: false,
      codeExplanation: true,
      focusMode: true,
      customThemes: true,
      advancedReports: false,
      teamCollaboration: false,
      workspaces: false,
      sso: false,
      auditLogs: false,
      prioritySupport: false,
      dedicatedSupport: false,
      customIntegrations: false,
      sprintPlanning: false,
      goalsAndOkrs: true,
    },
    isPopular: false,
    isEnterprise: false,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY || "",
      yearly: process.env.STRIPE_PRICE_INDIVIDUAL_YEARLY || "",
    },
  },
  // <== TEAM PLAN ==>
  team: {
    name: "Team",
    description: "Ideal for small to medium development teams",
    tagline: "For growing teams",
    pricing: {
      monthly: 19,
      yearly: 190,
      yearlySavings: 38,
    },
    limits: {
      projects: -1,
      repos: -1,
      teamMembers: 10,
      aiRequestsPerDay: 200,
      codeReviewsPerMonth: 50,
      workspaces: 5,
      storageMB: 5000,
      maxSessions: 10,
    },
    features: {
      githubIntegration: true,
      aiTaskSuggestions: true,
      aiCodeReview: true,
      aiBugDetection: true,
      codeExplanation: true,
      focusMode: true,
      customThemes: true,
      advancedReports: true,
      teamCollaboration: true,
      workspaces: true,
      sso: false,
      auditLogs: true,
      prioritySupport: true,
      dedicatedSupport: false,
      customIntegrations: false,
      sprintPlanning: true,
      goalsAndOkrs: true,
    },
    isPopular: true,
    isEnterprise: false,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || "",
      yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || "",
    },
  },
  // <== ENTERPRISE PLAN ==>
  enterprise: {
    name: "Enterprise",
    description: "For large organizations with advanced needs",
    tagline: "For large organizations",
    pricing: {
      monthly: 49,
      yearly: 490,
      yearlySavings: 98,
    },
    limits: {
      projects: -1,
      repos: -1,
      teamMembers: -1,
      aiRequestsPerDay: -1,
      codeReviewsPerMonth: -1,
      workspaces: -1,
      storageMB: -1,
      maxSessions: -1,
    },
    features: {
      githubIntegration: true,
      aiTaskSuggestions: true,
      aiCodeReview: true,
      aiBugDetection: true,
      codeExplanation: true,
      focusMode: true,
      customThemes: true,
      advancedReports: true,
      teamCollaboration: true,
      workspaces: true,
      sso: true,
      auditLogs: true,
      prioritySupport: true,
      dedicatedSupport: true,
      customIntegrations: true,
      sprintPlanning: true,
      goalsAndOkrs: true,
    },
    isPopular: false,
    isEnterprise: true,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || "",
      yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || "",
    },
  },
};

// <== TRIAL DURATION IN DAYS ==>
export const TRIAL_DURATION_DAYS = 14;

// <== GET PLAN CONFIG ==>
export const getPlanConfig = (plan: PlanType): IPlanConfig => {
  // RETURN PLAN CONFIG OR FREE TRIAL AS DEFAULT
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free_trial;
};

// <== GET PLAN LIMITS ==>
export const getPlanLimits = (plan: PlanType): IPlanLimits => {
  // GET PLAN CONFIG
  const config = getPlanConfig(plan);
  // RETURN LIMITS
  return config.limits;
};

// <== GET PLAN FEATURES ==>
export const getPlanFeatures = (plan: PlanType): IPlanFeatures => {
  // GET PLAN CONFIG
  const config = getPlanConfig(plan);
  // RETURN FEATURES
  return config.features;
};

// <== CHECK IF FEATURE IS AVAILABLE FOR PLAN ==>
export const hasFeature = (plan: PlanType, feature: FeatureKey): boolean => {
  // GET PLAN FEATURES
  const features = getPlanFeatures(plan);
  // RETURN FEATURE VALUE
  return features[feature] || false;
};

// <== GET LIMIT VALUE FOR PLAN ==>
export const getLimit = (
  plan: PlanType,
  limitKey: keyof IPlanLimits
): number => {
  // GET PLAN LIMITS
  const limits = getPlanLimits(plan);
  // RETURN LIMIT VALUE
  return limits[limitKey];
};

// <== CHECK IF LIMIT IS UNLIMITED ==>
export const isUnlimited = (
  plan: PlanType,
  limitKey: keyof IPlanLimits
): boolean => {
  // GET LIMIT VALUE
  const limit = getLimit(plan, limitKey);
  // RETURN TRUE IF LIMIT IS -1 (UNLIMITED)
  return limit === -1;
};

// <== GET MINIMUM PLAN FOR FEATURE ==>
export const getMinimumPlanForFeature = (feature: FeatureKey): PlanType => {
  // CHECK EACH PLAN IN ORDER (FREE -> INDIVIDUAL -> TEAM -> ENTERPRISE)
  const planOrder: PlanType[] = ["free", "individual", "team", "enterprise"];
  // LOOP THROUGH PLAN ORDER AND RETURN FIRST PLAN THAT HAS THE FEATURE
  for (const plan of planOrder) {
    // IF PLAN HAS FEATURE, RETURN PLAN
    if (hasFeature(plan, feature)) {
      // RETURN PLAN
      return plan;
    }
  }
  // DEFAULT TO ENTERPRISE
  return "enterprise";
};

// <== GET STRIPE PRICE ID ==>
export const getStripePriceId = (
  plan: PlanType,
  billingCycle: "monthly" | "yearly"
): string => {
  // GET PLAN CONFIG
  const config = getPlanConfig(plan);
  // RETURN STRIPE PRICE ID
  return config.stripePriceIds[billingCycle];
};

// <== GET ALL VISIBLE PLANS (PAID PLANS ONLY) ==>
export const getVisiblePlans = (): IPlanConfig[] => {
  // RETURN ALL PAID PLANS (EXCLUDES FREE AND FREE TRIAL)
  return [
    PLAN_LIMITS.individual,
    PLAN_LIMITS.team,
    PLAN_LIMITS.enterprise,
  ];
};

// <== GET TRIAL-ELIGIBLE PLANS (PLANS USER CAN TRIAL) ==>
export const getTrialEligiblePlans = (): IPlanConfig[] => {
  // USERS CAN TRIAL INDIVIDUAL, TEAM, OR ENTERPRISE
  return [
    PLAN_LIMITS.individual,
    PLAN_LIMITS.team,
    PLAN_LIMITS.enterprise,
  ];
};

// <== COMPARE PLANS ==>
export const comparePlans = (
  currentPlan: PlanType,
  targetPlan: PlanType
): "upgrade" | "downgrade" | "same" => {
  // PLAN HIERARCHY
  const hierarchy: Record<PlanType, number> = {
    free: 0,
    free_trial: 1,
    individual: 2,
    team: 3,
    enterprise: 4,
  };
  // GET HIERARCHY VALUES
  const currentValue = hierarchy[currentPlan];
  // GET TARGET PLAN HIERARCHY VALUE
  const targetValue = hierarchy[targetPlan];
  // IF TARGET PLAN IS HIGHER THAN CURRENT PLAN, RETURN UPGRADE
  if (targetValue > currentValue) return "upgrade";
  // IF TARGET PLAN IS LOWER THAN CURRENT PLAN, RETURN DOWNGRADE
  if (targetValue < currentValue) return "downgrade";
  // IF TARGET PLAN IS THE SAME AS CURRENT PLAN, RETURN SAME
  return "same";
};

// <== FEATURE DISPLAY NAMES ==>
export const FEATURE_DISPLAY_NAMES: Record<FeatureKey, string> = {
  githubIntegration: "GitHub Integration",
  aiTaskSuggestions: "AI Task Suggestions",
  aiCodeReview: "AI Code Review",
  aiBugDetection: "AI Bug Detection",
  codeExplanation: "Code Explanation",
  focusMode: "Focus Mode",
  customThemes: "Custom Themes",
  advancedReports: "Advanced Reports",
  teamCollaboration: "Team Collaboration",
  workspaces: "Workspaces",
  sso: "Single Sign-On (SSO)",
  auditLogs: "Audit Logs",
  prioritySupport: "Priority Support",
  dedicatedSupport: "Dedicated Support",
  customIntegrations: "Custom Integrations",
  sprintPlanning: "Sprint Planning",
  goalsAndOkrs: "Goals & OKRs",
};

// <== LIMIT DISPLAY NAMES ==>
export const LIMIT_DISPLAY_NAMES: Record<keyof IPlanLimits, string> = {
  projects: "Projects",
  repos: "Repositories",
  teamMembers: "Team Members",
  aiRequestsPerDay: "AI Requests / Day",
  codeReviewsPerMonth: "Code Reviews / Month",
  workspaces: "Workspaces",
  storageMB: "Storage",
  maxSessions: "Active Devices",
};

// <== FORMAT LIMIT VALUE FOR DISPLAY ==>
export const formatLimitValue = (
  limitKey: keyof IPlanLimits,
  value: number
): string => {
  // IF UNLIMITED
  if (value === -1) return "Unlimited";
  // IF STORAGE, FORMAT AS MB/GB
  if (limitKey === "storageMB") {
    // IF STORAGE IS GREATER THAN OR EQUAL TO 1000, FORMAT AS GB
    if (value >= 1000) {
      // RETURN FORMATTED VALUE AS GB
      return `${(value / 1000).toFixed(0)} GB`;
    }
    // RETURN FORMATTED VALUE AS MB
    return `${value} MB`;
  }
  // RETURN VALUE AS STRING
  return value.toString();
};

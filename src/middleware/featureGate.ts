// <== IMPORTS ==>
import {
  FeatureKey,
  hasFeature,
  getMinimumPlanForFeature,
  FEATURE_DISPLAY_NAMES,
} from "../config/planLimits.js";
import { Request, Response, NextFunction } from "express";
import { Subscription, PlanType } from "../models/subscription.model.js";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest extends Express.Request {
  // <== USER ID ==>
  id?: string;
  // <== SUBSCRIPTION DATA (ATTACHED BY MIDDLEWARE) ==>
  subscription?: typeof Subscription.prototype;
  // <== CURRENT PLAN ==>
  currentPlan?: PlanType;
}

/**
 * REQUIRE FEATURE MIDDLEWARE FACTORY FOR CHECKING FEATURE ACCESS
 * @param featureKey - Feature Key to Check
 * @returns Express Middleware Function
 */
// <== REQUIRE FEATURE ==>
export const requireFeature = (featureKey: FeatureKey) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // SEND ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO CHECK FEATURE ACCESS
    try {
      // FIND SUBSCRIPTION
      const subscription = await Subscription.findOne({ userId }).exec();
      // IF NO SUBSCRIPTION, RETURN ERROR
      if (!subscription) {
        // SEND ERROR RESPONSE
        res.status(403).json({
          message: "No subscription found. Please subscribe to continue.",
          success: false,
          upgradeRequired: true,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // CHECK SUBSCRIPTION STATUS
      if (subscription.status !== "active" && subscription.status !== "trialing") {
        // SEND ERROR RESPONSE
        res.status(403).json({
          message: "Your subscription is not active.",
          success: false,
          upgradeRequired: true,
          subscriptionStatus: subscription.status,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // CHECK TRIAL EXPIRY
      if (
        subscription.status === "trialing" &&
        subscription.trialEndsAt &&
        new Date(subscription.trialEndsAt) < new Date()
      ) {
        // SEND ERROR RESPONSE
        res.status(403).json({
          message: "Your trial has expired. Please subscribe to continue.",
          success: false,
          upgradeRequired: true,
          trialExpired: true,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // CHECK IF FEATURE IS ENABLED IN SUBSCRIPTION
      const featureEnabled = subscription.features?.[featureKey] === true;
      // IF FEATURE NOT ENABLED, RETURN ERROR
      if (!featureEnabled) {
        // GET MINIMUM PLAN FOR THIS FEATURE
        const minimumPlan = getMinimumPlanForFeature(featureKey);
        // GET FEATURE DISPLAY NAME
        const featureName = FEATURE_DISPLAY_NAMES[featureKey] || featureKey;
        // SEND ERROR RESPONSE
        res.status(403).json({
          message: `${featureName} is not available on your current plan.`,
          success: false,
          upgradeRequired: true,
          featureLocked: true,
          feature: featureKey,
          featureDisplayName: featureName,
          currentPlan: subscription.plan,
          requiredPlan: minimumPlan,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // ATTACH SUBSCRIPTION TO REQUEST
      (req as AuthenticatedRequest).subscription = subscription;
      (req as AuthenticatedRequest).currentPlan = subscription.plan as PlanType;
      // CONTINUE TO NEXT MIDDLEWARE
      next();
    } catch (error) {
      // LOG ERROR
      console.error("Error checking feature access:", error);
      // SEND ERROR RESPONSE
      res.status(500).json({
        message: "Error checking feature access!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  };
};

/**
 * REQUIRE PLAN MIDDLEWARE FACTORY
 * @param allowedPlans - Array of Allowed Plan Types
 * @returns Express Middleware Function
 */
// <== REQUIRE PLAN ==>
export const requirePlan = (allowedPlans: PlanType[]) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // SEND ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO CHECK PLAN ACCESS
    try {
      // FIND SUBSCRIPTION
      const subscription = await Subscription.findOne({ userId }).exec();
      // IF NO SUBSCRIPTION, RETURN ERROR
      if (!subscription) {
        // SEND ERROR RESPONSE
        res.status(403).json({
          message: "No subscription found. Please subscribe to continue.",
          success: false,
          upgradeRequired: true,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // CHECK SUBSCRIPTION STATUS
      if (subscription.status !== "active" && subscription.status !== "trialing") {
        // SEND ERROR RESPONSE
        res.status(403).json({
          message: "Your subscription is not active.",
          success: false,
          upgradeRequired: true,
          subscriptionStatus: subscription.status,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // CHECK IF USER'S PLAN IS IN ALLOWED PLANS
      if (!allowedPlans.includes(subscription.plan as PlanType)) {
        // FIND MINIMUM REQUIRED PLAN FROM ALLOWED PLANS
        const planHierarchy: PlanType[] = ["free_trial", "individual", "team", "enterprise"];
        // GET FIRST ALLOWED PLAN (DEFAULT TO INDIVIDUAL IF EMPTY)
        const firstAllowedPlan: PlanType = allowedPlans[0] ?? "individual";
        // FIND MINIMUM REQUIRED PLAN FROM ALLOWED PLANS
        const minRequiredPlan = allowedPlans.reduce<PlanType>((min, plan) => {
          // GET INDEX OF MIN PLAN IN HIERARCHY
          const minIndex = planHierarchy.indexOf(min);
          // GET INDEX OF CURRENT PLAN IN HIERARCHY
          const planIndex = planHierarchy.indexOf(plan);
          // RETURN THE PLAN WITH LOWER INDEX (LOWER = LESS RESTRICTIVE)
          return planIndex < minIndex ? plan : min;
        }, firstAllowedPlan);
        // SEND ERROR RESPONSE
        res.status(403).json({
          message: `This feature requires a ${minRequiredPlan} plan or higher.`,
          success: false,
          upgradeRequired: true,
          planRequired: true,
          currentPlan: subscription.plan,
          requiredPlans: allowedPlans,
          minimumRequiredPlan: minRequiredPlan,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // ATTACH SUBSCRIPTION TO REQUEST
      (req as AuthenticatedRequest).subscription = subscription;
      (req as AuthenticatedRequest).currentPlan = subscription.plan as PlanType;
      // CONTINUE TO NEXT MIDDLEWARE
      next();
    } catch (error) {
      // LOG ERROR
      console.error("Error checking plan requirement:", error);
      // SEND ERROR RESPONSE
      res.status(500).json({
        message: "Error checking plan requirement!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  };
};

/**
 * REQUIRE ACTIVE SUBSCRIPTION MIDDLEWARE
 * @returns Express Middleware Function
 */
// <== REQUIRE ACTIVE SUBSCRIPTION ==>
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // GET USER ID FROM REQUEST
  const userId = (req as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN 401
  if (!userId) {
    // SEND ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).exec();
    // IF NO SUBSCRIPTION, RETURN ERROR
    if (!subscription) {
      // SEND ERROR RESPONSE
      res.status(403).json({
        message: "No subscription found. Please subscribe to continue.",
        success: false,
        upgradeRequired: true,
        noSubscription: true,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK SUBSCRIPTION STATUS
    if (subscription.status !== "active" && subscription.status !== "trialing") {
      // SEND ERROR RESPONSE
      res.status(403).json({
        message: "Your subscription is not active. Please renew to continue.",
        success: false,
        upgradeRequired: true,
        subscriptionStatus: subscription.status,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK TRIAL EXPIRY
    if (
      subscription.status === "trialing" &&
      subscription.trialEndsAt &&
      new Date(subscription.trialEndsAt) < new Date()
    ) {
      // SEND ERROR RESPONSE
      res.status(403).json({
        message: "Your trial has expired. Please subscribe to continue.",
        success: false,
        upgradeRequired: true,
        trialExpired: true,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // ATTACH SUBSCRIPTION TO REQUEST
    (req as AuthenticatedRequest).subscription = subscription;
    (req as AuthenticatedRequest).currentPlan = subscription.plan as PlanType;
    // CONTINUE TO NEXT MIDDLEWARE
    next();
  } catch (error) {
    // LOG ERROR
    console.error("Error checking subscription status:", error);
    // SEND ERROR RESPONSE
    res.status(500).json({
      message: "Error checking subscription status!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
};

/**
 * ATTACH SUBSCRIPTION MIDDLEWARE
 * @returns Express Middleware Function
 */
// <== ATTACH SUBSCRIPTION ==>
export const attachSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // GET USER ID FROM REQUEST
  const userId = (req as AuthenticatedRequest).id;
  // IF NO USER ID, CONTINUE
  if (!userId) {
    // CONTINUE TO NEXT MIDDLEWARE
    next();
    // RETURN FROM FUNCTION
    return;
  }
  // TRY TO ATTACH SUBSCRIPTION
  try {
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).exec();
    // IF SUBSCRIPTION FOUND, ATTACH TO REQUEST
    if (subscription) {
      (req as AuthenticatedRequest).subscription = subscription;
      (req as AuthenticatedRequest).currentPlan = subscription.plan as PlanType;
    }
    // CONTINUE TO NEXT MIDDLEWARE
    next();
  } catch (error) {
    // LOG ERROR
    console.error("Error attaching subscription:", error);
    // CONTINUE TO NEXT MIDDLEWARE
    next();
  }
};

// <== COMMON FEATURE GATES ==>

/**
 * REQUIRE AI CODE REVIEW FEATURE
 */
// <== REQUIRE AI CODE REVIEW ==>
export const requireAICodeReview = requireFeature("aiCodeReview");

/**
 * REQUIRE AI BUG DETECTION FEATURE
 */
// <== REQUIRE AI BUG DETECTION ==>
export const requireAIBugDetection = requireFeature("aiBugDetection");

/**
 * REQUIRE WORKSPACES FEATURE
 */
// <== REQUIRE WORKSPACES ==>
export const requireWorkspaces = requireFeature("workspaces");

/**
 * REQUIRE TEAM COLLABORATION FEATURE
 */
// <== REQUIRE TEAM COLLABORATION ==>
export const requireTeamCollaboration = requireFeature("teamCollaboration");

/**
 * REQUIRE ADVANCED REPORTS FEATURE
 */
// <== REQUIRE ADVANCED REPORTS ==>
export const requireAdvancedReports = requireFeature("advancedReports");

/**
 * REQUIRE AUDIT LOGS FEATURE
 */
// <== REQUIRE AUDIT LOGS ==>
export const requireAuditLogs = requireFeature("auditLogs");

/**
 * REQUIRE SSO FEATURE
 */
// <== REQUIRE SSO ==>
export const requireSSO = requireFeature("sso");

/**
 * REQUIRE SPRINT PLANNING FEATURE
 */
// <== REQUIRE SPRINT PLANNING ==>
export const requireSprintPlanning = requireFeature("sprintPlanning");

/**
 * REQUIRE GOALS AND OKRS FEATURE
 */
// <== REQUIRE GOALS AND OKRS ==>
export const requireGoalsAndOkrs = requireFeature("goalsAndOkrs");

// <== COMMON PLAN REQUIREMENTS ==>

/**
 * REQUIRE TEAM OR ENTERPRISE PLAN
 */
// <== REQUIRE TEAM OR HIGHER ==>
export const requireTeamOrHigher = requirePlan(["team", "enterprise"]);

/**
 * REQUIRE ENTERPRISE PLAN
 */
// <== REQUIRE ENTERPRISE ==>
export const requireEnterprise = requirePlan(["enterprise"]);

// <== EXPORT ALL ==>
export default {
  requireFeature,
  requirePlan,
  requireActiveSubscription,
  attachSubscription,
  requireAICodeReview,
  requireAIBugDetection,
  requireWorkspaces,
  requireTeamCollaboration,
  requireAdvancedReports,
  requireAuditLogs,
  requireSSO,
  requireSprintPlanning,
  requireGoalsAndOkrs,
  requireTeamOrHigher,
  requireEnterprise,
};

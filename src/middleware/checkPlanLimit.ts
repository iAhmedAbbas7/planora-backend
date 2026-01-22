// <== IMPORTS ==>
import { Request, Response, NextFunction } from "express";
import { Subscription, IPlanLimits, IUsageTracking } from "../models/subscription.model.js";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest extends Express.Request {
  // <== USER ID ==>
  id?: string;
  // <== SUBSCRIPTION DATA (ATTACHED BY MIDDLEWARE) ==>
  subscription?: typeof Subscription.prototype;
}
// <== USAGE KEY TYPE ==>
type UsageKey = keyof IUsageTracking;
// <== LIMIT KEY TYPE ==>
type LimitKey = keyof IPlanLimits;

// <== USAGE TO LIMIT MAP ==>
const USAGE_TO_LIMIT_MAP: Record<string, { usageKey: UsageKey; limitKey: LimitKey }> = {
  projects: { usageKey: "projectsCount", limitKey: "projects" },
  repos: { usageKey: "reposCount", limitKey: "repos" },
  teamMembers: { usageKey: "teamMembersCount", limitKey: "teamMembers" },
  workspaces: { usageKey: "workspacesCount", limitKey: "workspaces" },
  aiRequests: { usageKey: "aiRequestsToday", limitKey: "aiRequestsPerDay" },
  codeReviews: { usageKey: "codeReviewsThisMonth", limitKey: "codeReviewsPerMonth" },
  storage: { usageKey: "storageUsedMB", limitKey: "storageMB" },
};

/**
 * CHECK PLAN LIMIT MIDDLEWARE FACTORY
 * @param resourceKey - Resource Key to Check
 * @returns Express Middleware Function
 */
// <== CHECK PLAN LIMIT ==>
export const checkPlanLimit = (resourceKey: string) => {
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
    // GET MAPPING
    const mapping = USAGE_TO_LIMIT_MAP[resourceKey];
    // IF NO MAPPING, CONTINUE (NO LIMIT FOR THIS RESOURCE)
    if (!mapping) {
      // CONTINUE TO NEXT MIDDLEWARE
      next();
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO CHECK PLAN LIMIT
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
        // SEND FORBIDDEN RESPONSE
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
      // GET LIMIT FOR THE RESOURCE
      const limit = subscription.limits?.[mapping.limitKey] || 0;
      // GET USAGE FOR THE RESOURCE
      const usage = subscription.usage?.[mapping.usageKey] || 0;
      // IF UNLIMITED (-1), CONTINUE
      if (limit === -1) {
        // ATTACH SUBSCRIPTION TO REQUEST
        (req as AuthenticatedRequest).subscription = subscription;
        // CONTINUE TO NEXT MIDDLEWARE
        next();
        // RETURN FROM FUNCTION
        return;
      }
      // CHECK IF WITHIN LIMIT
      if (typeof usage === "number" && usage >= limit) {
        // SEND FORBIDDEN RESPONSE
        res.status(403).json({
          message: `You have reached your ${resourceKey} limit (${usage}/${limit}). Please upgrade your plan.`,
          success: false,
          upgradeRequired: true,
          limitReached: true,
          resource: resourceKey,
          current: usage,
          limit: limit,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // ATTACH SUBSCRIPTION TO REQUEST
      (req as AuthenticatedRequest).subscription = subscription;
      // CONTINUE TO NEXT MIDDLEWARE
      next();
    } catch (error) {
      // LOG ERROR
      console.error("Error checking plan limit:", error);
      // SEND ERROR RESPONSE
      res.status(500).json({
        message: "Error checking plan limits!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  };
};

/**
 * CHECK PROJECT LIMIT MIDDLEWARE
 */
// <== CHECK PROJECT LIMIT ==>
export const checkProjectLimit = checkPlanLimit("projects");

/**
 * CHECK REPO LIMIT MIDDLEWARE
 */
// <== CHECK REPO LIMIT ==>
export const checkRepoLimit = checkPlanLimit("repos");

/**
 * CHECK TEAM MEMBER LIMIT MIDDLEWARE
 */
// <== CHECK TEAM MEMBER LIMIT ==>
export const checkTeamMemberLimit = checkPlanLimit("teamMembers");

/**
 * CHECK WORKSPACE LIMIT MIDDLEWARE
 */
// <== CHECK WORKSPACE LIMIT ==>
export const checkWorkspaceLimit = checkPlanLimit("workspaces");

/**
 * CHECK AI USAGE LIMIT MIDDLEWARE
 */
// <== CHECK AI USAGE ==>
export const checkAIUsage = checkPlanLimit("aiRequests");

/**
 * CHECK CODE REVIEW LIMIT MIDDLEWARE
 */
// <== CHECK CODE REVIEW USAGE ==>
export const checkCodeReviewUsage = checkPlanLimit("codeReviews");

/**
 * CHECK STORAGE LIMIT MIDDLEWARE
 */
// <== CHECK STORAGE LIMIT ==>
export const checkStorageLimit = checkPlanLimit("storage");

/**
 * INCREMENT USAGE AFTER SUCCESSFUL OPERATION
 * @param resourceKey - Resource Key to Increment
 * @returns Express Middleware Function
 */
// <== INCREMENT USAGE MIDDLEWARE ==>
export const incrementUsageMiddleware = (resourceKey: string) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, CONTINUE (ERROR WILL BE CAUGHT ELSEWHERE)
    if (!userId) {
      // CONTINUE TO NEXT MIDDLEWARE
      next();
      // RETURN FROM FUNCTION
      return;
    }
    // GET MAPPING
    const mapping = USAGE_TO_LIMIT_MAP[resourceKey];
    // IF NO MAPPING, CONTINUE
    if (!mapping) {
      // CONTINUE TO NEXT MIDDLEWARE
      next();
      // RETURN FROM FUNCTION
      return;
    }
    // STORE ORIGINAL JSON METHOD
    const originalJson = res.json.bind(res);
    // OVERRIDE JSON METHOD
    res.json = function (body: any) {
      // IF SUCCESSFUL RESPONSE, INCREMENT USAGE
      if (body?.success === true) {
        Subscription.findOneAndUpdate(
          { userId },
          { $inc: { [`usage.${mapping.usageKey}`]: 1 } }
        ).exec().catch((err) => {
          console.error("Error incrementing usage:", err);
        });
      }
      // CALL ORIGINAL JSON
      return originalJson(body);
    };
    // CONTINUE
    next();
  };
};

/**
 * DECREMENT USAGE AFTER SUCCESSFUL DELETE OPERATION
 * @param resourceKey - Resource Key to Decrement
 * @returns Express Middleware Function
 */
// <== DECREMENT USAGE MIDDLEWARE ==>
export const decrementUsageMiddleware = (resourceKey: string) => {
  return async (
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
    // GET MAPPING
    const mapping = USAGE_TO_LIMIT_MAP[resourceKey];
    // IF NO MAPPING, CONTINUE
    if (!mapping) {
      // CONTINUE TO NEXT MIDDLEWARE
      next();
      // RETURN FROM FUNCTION
      return;
    }
    // STORE ORIGINAL JSON METHOD
    const originalJson = res.json.bind(res);
    // OVERRIDE JSON METHOD
    res.json = function (body: any) {
      // IF SUCCESSFUL RESPONSE, DECREMENT USAGE
      if (body?.success === true) {
        Subscription.findOneAndUpdate(
          { userId, [`usage.${mapping.usageKey}`]: { $gt: 0 } },
          { $inc: { [`usage.${mapping.usageKey}`]: -1 } }
        ).exec().catch((err) => {
          console.error("Error decrementing usage:", err);
        });
      }
      // CALL ORIGINAL JSON
      return originalJson(body);
    };
    // CONTINUE
    next();
  };
};

// <== EXPORT ALL ==>
export default {
  checkPlanLimit,
  checkProjectLimit,
  checkRepoLimit,
  checkTeamMemberLimit,
  checkWorkspaceLimit,
  checkAIUsage,
  checkCodeReviewUsage,
  checkStorageLimit,
  incrementUsageMiddleware,
  decrementUsageMiddleware,
};

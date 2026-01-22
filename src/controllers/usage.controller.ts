
import {
  Subscription,
  IPlanLimits,
  IUsageTracking,
} from "../models/subscription.model.js";
import { Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest extends Express.Request {
  // <== USER ID ==>
  id?: string;
}

// <== USAGE KEY TYPE ==>
type UsageKey = keyof IUsageTracking;

// <== LIMIT KEY TYPE ==>
type LimitKey = keyof IPlanLimits;

/**
 * GET USAGE STATS FOR USER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USAGE STATS ==>
export const getUsageStats = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;  
    }
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).lean().exec();
    // IF NO SUBSCRIPTION, RETURN 404 ERROR
    if (!subscription) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Subscription not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CALCULATE USAGE PERCENTAGES
    const usagePercentages = {
      // CALCULATE PROJECTS PERCENTAGE
      projects: calculatePercentage(
        subscription.usage?.projectsCount || 0,
        subscription.limits?.projects || 0
      ),
      // CALCULATE REPOS PERCENTAGE
      repos: calculatePercentage(
        subscription.usage?.reposCount || 0,
        subscription.limits?.repos || 0
      ),
      // CALCULATE TEAM MEMBERS PERCENTAGE
      teamMembers: calculatePercentage(
        subscription.usage?.teamMembersCount || 0,
        subscription.limits?.teamMembers || 0
      ),
      // CALCULATE AI REQUESTS TODAY PERCENTAGE
      aiRequestsToday: calculatePercentage(
        subscription.usage?.aiRequestsToday || 0,
        subscription.limits?.aiRequestsPerDay || 0
      ),
      // CALCULATE CODE REVIEWS THIS MONTH PERCENTAGE
      codeReviewsThisMonth: calculatePercentage(
        subscription.usage?.codeReviewsThisMonth || 0,
        subscription.limits?.codeReviewsPerMonth || 0
      ),
      // CALCULATE WORKSPACES PERCENTAGE
      workspaces: calculatePercentage(
        subscription.usage?.workspacesCount || 0,
        subscription.limits?.workspaces || 0
      ),
      // CALCULATE STORAGE PERCENTAGE
      storage: calculatePercentage(
        subscription.usage?.storageUsedMB || 0,
        subscription.limits?.storageMB || 0
      ),
    };
    // RETURN USAGE STATS SUCCESS RESPONSE
    res.status(200).json({
      message: "Usage stats retrieved successfully!",
      success: true,
      data: {
        usage: subscription.usage,
        limits: subscription.limits,
        percentages: usagePercentages,
        plan: subscription.plan,
        status: subscription.status,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * INCREMENT USAGE FOR A SPECIFIC KEY
 * @param userId - User ID
 * @param usageKey - Usage Key to Increment
 * @param amount - Amount to Increment (Default: 1)
 * @returns Updated Subscription or Null
 */
// <== INCREMENT USAGE ==>
export const incrementUsage = async (
  userId: string,
  usageKey: UsageKey,
  amount: number = 1
): Promise<typeof Subscription.prototype | null> => {
  // TRY TO INCREMENT USAGE
  try {
    // BUILD UPDATE OBJECT (INCREMENT USAGE BY THE AMOUNT)
    const updateObj: Record<string, number> = {};
    // SET USAGE KEY TO THE AMOUNT
    updateObj[`usage.${usageKey}`] = amount;
    // UPDATE SUBSCRIPTION WITH THE UPDATE OBJECT
    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      { $inc: updateObj },
      { new: true }
    ).exec();
    // RETURN SUBSCRIPTION
    return subscription;
  } catch (error) {
    console.error("Error incrementing usage:", error);
    return null;
  }
};

/**
 * DECREMENT USAGE FOR A SPECIFIC KEY
 * @param userId - User ID
 * @param usageKey - Usage Key to Decrement
 * @param amount - Amount to Decrement (Default: 1)
 * @returns Updated Subscription or Null
 */
// <== DECREMENT USAGE ==>
export const decrementUsage = async (
  userId: string,
  usageKey: UsageKey,
  amount: number = 1
): Promise<typeof Subscription.prototype | null> => {
  // TRY TO DECREMENT USAGE
  try {
    // BUILD UPDATE OBJECT (NEGATIVE AMOUNT)
    const updateObj: Record<string, number> = {};
    // SET USAGE KEY TO THE NEGATIVE AMOUNT
    updateObj[`usage.${usageKey}`] = -amount;
    // UPDATE SUBSCRIPTION WITH THE UPDATE OBJECT (ENSURE USAGE IS NOT LESS THAN 0)
    const subscription = await Subscription.findOneAndUpdate(
      { userId, [`usage.${usageKey}`]: { $gte: amount } },
      { $inc: updateObj },
      { new: true }
    ).exec();
    // RETURN SUBSCRIPTION
    return subscription;
  } catch (error) {
    // LOG ERROR
    console.error("Error decrementing usage:", error);
    // RETURN NULL
    return null;
  }
};

/**
 * SET USAGE FOR A SPECIFIC KEY
 * @param userId - User ID
 * @param usageKey - Usage Key to Set
 * @param value - Value to Set
 * @returns Updated Subscription or Null
 */
// <== SET USAGE ==>
export const setUsage = async (
  userId: string,
  usageKey: UsageKey,
  value: number
): Promise<typeof Subscription.prototype | null> => {
  // TRY TO SET USAGE
  try {
    // BUILD UPDATE OBJECT (SET USAGE KEY TO THE VALUE)
    const updateObj: Record<string, number> = {};
    // SET USAGE KEY TO THE VALUE
    updateObj[`usage.${usageKey}`] = value;
    // UPDATE SUBSCRIPTION WITH THE UPDATE OBJECT
    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      { $set: updateObj },
      { new: true }
    ).exec();
    // RETURN SUBSCRIPTION
    return subscription;
  } catch (error) {
    // LOG ERROR
    console.error("Error setting usage:", error);
    // RETURN NULL
    return null;
  }
};

/**
 * CHECK IF USER IS WITHIN LIMIT FOR A SPECIFIC KEY
 * @param userId - User ID
 * @param limitKey - Limit Key to Check
 * @param usageKey - Usage Key to Check Against
 * @returns Boolean Indicating if Within Limit
 */
// <== CHECK LIMIT ==>
export const checkLimit = async (
  userId: string,
  limitKey: LimitKey,
  usageKey: UsageKey
): Promise<{ withinLimit: boolean; remaining: number; limit: number; usage: number }> => {
  // TRY TO CHECK LIMIT
  try {
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).lean().exec();
    // IF NO SUBSCRIPTION, RETURN FALSE
    if (!subscription) {
      // RETURN FALSE
      return { withinLimit: false, remaining: 0, limit: 0, usage: 0 };
    }
    // GET LIMIT AND USAGE (ENSURE USAGE IS A NUMBER, NOT A DATE)
    const limit = subscription.limits?.[limitKey] || 0;
    // GET RAW USAGE (ENSURE USAGE IS A NUMBER, NOT A DATE)
    const rawUsage = subscription.usage?.[usageKey];
    // ENSURE USAGE IS A NUMBER (FILTER OUT DATE FIELDS)
    const usage = typeof rawUsage === "number" ? rawUsage : 0;
    // IF UNLIMITED (-1), RETURN TRUE WITH UNLIMITED VALUES
    if (limit === -1) {
      // RETURN TRUE WITH UNLIMITED VALUES
      return { withinLimit: true, remaining: -1, limit: -1, usage };
    }
    // CHECK IF WITHIN LIMIT
    const withinLimit = usage < limit;
    // CALCULATE REMAINING
    const remaining = Math.max(0, limit - usage);
    // RETURN RESULT
    return { withinLimit, remaining, limit, usage };
  } catch (error) {
    // LOG ERROR
    console.error("Error checking limit:", error);
    // RETURN FALSE WITH DEFAULT VALUES
    return { withinLimit: false, remaining: 0, limit: 0, usage: 0 };
  }
};

/**
 * CHECK IF USER CAN PERFORM ACTION (WITHIN LIMIT AND SUBSCRIPTION ACTIVE)
 * @param userId - User ID
 * @param limitKey - Limit Key to Check
 * @param usageKey - Usage Key to Check Against
 * @returns Object with Can Perform Boolean and Details
 */
// <== CAN PERFORM ACTION ==>
export const canPerformAction = async (
  userId: string,
  limitKey: LimitKey,
  usageKey: UsageKey
): Promise<{
  canPerform: boolean;
  reason?: string;
  remaining?: number;
  limit?: number;
  upgradeRequired?: boolean;
}> => {
  try {
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).lean().exec();
    // IF NO SUBSCRIPTION, RETURN FALSE
    if (!subscription) {
      // RETURN FALSE WITH NO SUBSCRIPTION FOUND
      return {
        canPerform: false,
        reason: "No subscription found",
        upgradeRequired: true,
      };
    }
    // CHECK SUBSCRIPTION STATUS
    if (subscription.status !== "active" && subscription.status !== "trialing") {
      // RETURN FALSE WITH SUBSCRIPTION NOT ACTIVE
      return {
        canPerform: false,
        reason: "Subscription is not active",
        upgradeRequired: true,
      };
    }
    // CHECK TRIAL EXPIRY
    if (
      subscription.status === "trialing" &&
      subscription.trialEndsAt &&
      new Date(subscription.trialEndsAt) < new Date()
    ) {
      // RETURN FALSE WITH TRIAL EXPIRED
      return {
        canPerform: false,
        reason: "Trial has expired",
        upgradeRequired: true,
      };
    }
    // CHECK LIMIT
    const { withinLimit, remaining, limit } = await checkLimit(
      userId,
      limitKey,
      usageKey
    );
    // IF NOT WITHIN LIMIT, RETURN FALSE
    if (!withinLimit) {
      // RETURN FALSE WITH NOT WITHIN LIMIT
      return {
        canPerform: false,
        reason: `You have reached your ${limitKey} limit`,
        remaining: 0,
        limit,
        upgradeRequired: true,
      };
    }
    // RETURN SUCCESS
    return {
      canPerform: true,
      remaining,
      limit,
    };
  } catch (error) {
    // LOG ERROR
    console.error("Error checking if can perform action:", error);
    // RETURN FALSE WITH ERROR
    return {
      canPerform: false,
      reason: "Error checking permissions",
    };
  }
};

/**
 * RESET DAILY USAGE COUNTERS
 * Called by Cron Job at Midnight
 */
// <== RESET DAILY USAGE ==>
export const resetDailyUsage = async (): Promise<number> => {
  // TRY TO RESET DAILY USAGE
  try {
    // RESET AI REQUESTS FOR ALL SUBSCRIPTIONS
    const result = await Subscription.updateMany(
      {},
      {
        $set: {
          "usage.aiRequestsToday": 0,
          "usage.aiRequestsResetAt": new Date(),
        },
      }
    ).exec();
    // LOG RESULT
    console.log(`Reset daily usage for ${result.modifiedCount} subscriptions`);
    // RETURN COUNT
    return result.modifiedCount;
  } catch (error) {
    // LOG ERROR
    console.error("Error resetting daily usage:", error);
    // RETURN 0
    return 0;
  }
};

/**
 * RESET MONTHLY USAGE COUNTERS
 * Called by Cron Job on 1st of Each Month
 */
// <== RESET MONTHLY USAGE ==>
export const resetMonthlyUsage = async (): Promise<number> => {
  // TRY TO RESET MONTHLY USAGE
  try {
    // RESET CODE REVIEWS FOR ALL SUBSCRIPTIONS
    const result = await Subscription.updateMany(
      {},
      {
        $set: {
          "usage.codeReviewsThisMonth": 0,
          "usage.codeReviewsResetAt": new Date(),
        },
      }
    ).exec();
    // LOG RESULT
    console.log(`Reset monthly usage for ${result.modifiedCount} Subscriptions`);
    // RETURN COUNT
    return result.modifiedCount;
  } catch (error) {
    // LOG ERROR
    console.error("Error resetting monthly usage:", error);
    // RETURN 0
    return 0;
  }
};

/**
 * SYNC USAGE COUNTS WITH ACTUAL DATA
 * @param userId - User ID
 * @returns Updated Subscription or Null
 */
// <== SYNC USAGE ==>
export const syncUsage = async (
  userId: string
): Promise<typeof Subscription.prototype | null> => {
  // TRY TO SYNC USAGE
  try {
    // IMPORT MODELS DYNAMICALLY TO AVOID CIRCULAR DEPENDENCIES
    const { Project } = await import("../models/project.model.js");
    // IMPORT WORKSPACE MODEL
    const { Workspace } = await import("../models/workspace.model.js");
    // IMPORT WORKSPACE MEMBER MODEL
    const { WorkspaceMember } = await import("../models/workspaceMember.model.js");
    // COUNT PROJECTS (NOT TRASHED)
    const projectsCount = await Project.countDocuments({
      userId,
      isTrashed: false,
    }).exec();
    // COUNT REPOS (PROJECTS WITH GITHUB LINKED)
    const reposCount = await Project.countDocuments({
      userId,
      isTrashed: false,
      "githubRepo.fullName": { $exists: true, $ne: null },
    }).exec();
    // COUNT WORKSPACES (OWNED BY USER)
    const workspacesCount = await Workspace.countDocuments({
      createdBy: userId,
    }).exec();
    // COUNT TEAM MEMBERS (ACROSS ALL WORKSPACES)
    const teamMembersCount = await WorkspaceMember.countDocuments({
      userId: { $ne: userId },
      status: "active",
    }).exec();
    // UPDATE SUBSCRIPTION
    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      {
        $set: {
          "usage.projectsCount": projectsCount,
          "usage.reposCount": reposCount,
          "usage.workspacesCount": workspacesCount,
          "usage.teamMembersCount": teamMembersCount,
        },
      },
      { new: true }
    ).exec();
    // RETURN SUBSCRIPTION
    return subscription;
  } catch (error) {
    // LOG ERROR
    console.error("Error syncing usage:", error);
    // RETURN NULL
    return null;
  }
};

/**
 * CALCULATE PERCENTAGE
 * @param current - Current Value
 * @param max - Maximum Value
 * @returns Percentage (0-100) or -1 for Unlimited
 */
// <== CALCULATE PERCENTAGE HELPER ==>
const calculatePercentage = (current: number, max: number): number => {
  // IF UNLIMITED, RETURN -1
  if (max === -1) return -1;
  // IF MAX IS 0, RETURN 0
  if (max === 0) return 0;
  // CALCULATE AND RETURN PERCENTAGE (CAPPED AT 100)
  return Math.min(100, Math.round((current / max) * 100));
};

/**
 * GET USAGE ENDPOINT (EXPRESS HANDLER)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USAGE (SPECIFIC KEY) ==>
export const getUsage = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN 401 ERROR
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET USAGE KEY FROM PARAMS
    const { key } = req.params;
    // VALIDATE KEY (VALID USAGE KEYS)
    const validKeys: UsageKey[] = [
      "projectsCount",
      "reposCount",
      "teamMembersCount",
      "workspacesCount",
      "aiRequestsToday",
      "codeReviewsThisMonth",
      "storageUsedMB",
    ];
    if (!validKeys.includes(key as UsageKey)) {
      // RETURN 400 ERROR
      res.status(400).json({
        message: "Invalid usage key!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).lean().exec();
    // IF NO SUBSCRIPTION, RETURN ERROR
    if (!subscription) {
      // RETURN 404 ERROR
      res.status(404).json({
        message: "Subscription not found!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET USAGE VALUE
    const usageValue = subscription.usage?.[key as keyof IUsageTracking] || 0;
    // MAP USAGE KEY TO LIMIT KEY
    const usageToLimitMap: Record<UsageKey, LimitKey> = {
      projectsCount: "projects",
      reposCount: "repos",
      teamMembersCount: "teamMembers",
      workspacesCount: "workspaces",
      aiRequestsToday: "aiRequestsPerDay",
      aiRequestsResetAt: "aiRequestsPerDay",
      codeReviewsThisMonth: "codeReviewsPerMonth",
      codeReviewsResetAt: "codeReviewsPerMonth",
      storageUsedMB: "storageMB",
    };
    // GET LIMIT KEY FROM USAGE TO LIMIT MAP
    const limitKey = usageToLimitMap[key as UsageKey];
    // GET LIMIT VALUE FROM SUBSCRIPTION LIMITS
    const limitValue = subscription.limits?.[limitKey] || 0;
    // CALCULATE PERCENTAGE
    const percentage = calculatePercentage(usageValue as number, limitValue);
    // RETURN USAGE SUCCESS RESPONSE
    res.status(200).json({
      message: "Usage retrieved successfully!",
      success: true,
      data: {
        key,
        usage: usageValue,
        limit: limitValue,
        percentage,
        unlimited: limitValue === -1,
      },
    });
    // RETURN FROM FUNCTION
    return;
  }
);

/**
 * SYNC USAGE ENDPOINT (EXPRESS HANDLER)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SYNC USAGE ENDPOINT ==>
export const syncUsageEndpoint = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN 401 ERROR
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // SYNC USAGE
    const subscription = await syncUsage(userId);
    // IF NO SUBSCRIPTION, RETURN ERROR
    if (!subscription) {
      // RETURN 500 ERROR
      res.status(500).json({
        message: "Failed to sync usage!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // RETURN SUCCESS
    res.status(200).json({
      message: "Usage synced successfully!",
      success: true,
      data: {
        usage: subscription.usage,
      },
    });
    // RETURN FROM FUNCTION
    return;
  }
);

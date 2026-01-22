// <== IMPORTS ==>
import cron from "node-cron";
import { Express } from "express";
import { Task } from "../models/task.model.js";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { PLAN_LIMITS } from "../config/planLimits.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import { Subscription } from "../models/subscription.model.js";
import { broadcastNotification } from "../utils/broadcastNotification.js";
import { createNotification } from "../controllers/notification.controller.js";

/**
 * INITIALIZE ALL CRON JOBS
 * @param app - Express App Instance
 */
export const initializeCronJobs = (app: Express): void => {
  // <== CRON JOB TO CHECK FOR DUE TASKS ==>
  // RUNS EVERY 30 MINUTES
  cron.schedule("*/30 * * * *", async () => {
    // GETTING CURRENT DATE
    const now = new Date();
    // GETTING SOON DATE (1 HOUR FROM NOW)
    const soon = new Date(now.getTime() + 60 * 60 * 1000);
    try {
      // FINDING TASKS DUE SOON
      const dueTasks = await Task.find({
        dueDate: { $lte: soon, $gte: now },
        status: { $ne: "completed" },
        isTrashed: false,
      })
        .lean()
        .exec();
      // IF TASKS FOUND
      if (dueTasks.length > 0) {
        // GETTING IO INSTANCE FROM APP
        const ioInstance = app.get("io");
        // IF IO INSTANCE AVAILABLE
        if (ioInstance) {
          // EMITTING TASK DUE SOON EVENT
          ioInstance.emit("task_due_soon", dueTasks);
        }
        // CREATING NOTIFICATIONS FOR EACH DUE TASK
        for (const task of dueTasks) {
          // CREATING NOTIFICATION FOR TASK DUE SOON
          const notification = await createNotification(
            task.userId.toString(),
            "task_due_soon",
            "Task Due Soon",
            `Task "${
              task.title
            }" is due soon (${task.dueDate?.toLocaleString()}).`,
            task._id.toString(),
            app
          );
          // BROADCASTING NOTIFICATION IF CREATED
          if (notification) {
            broadcastNotification(app, task.userId.toString(), notification);
          }
        }
      }
    } catch (error: any) {
      // LOGGING ERROR
      console.error("Error in Task Due Soon Cron Job:", error);
    }
  });

  // <== CRON JOB TO PERMANENTLY DELETE FLAGGED ACCOUNTS AFTER 30 DAYS ==>
  // RUNS DAILY AT 2 AM
  cron.schedule("0 2 * * *", async () => {
    try {
      // GETTING CURRENT DATE
      const now = new Date();
      // CALCULATING DATE 30 DAYS AGO
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      // FINDING USERS FLAGGED FOR DELETION MORE THAN 30 DAYS AGO
      const flaggedUsers = await User.find({
        flaggedForDeletion: true,
        flaggedAt: { $lte: thirtyDaysAgo },
      })
        .lean()
        .exec();
      // IF FLAGGED USERS FOUND
      if (flaggedUsers.length > 0) {
        // DELETING EACH USER AND ALL ASSOCIATED DATA
        for (const user of flaggedUsers) {
          // GETTING USER ID
          const userId = user._id.toString();
          // DELETING USER
          await User.findByIdAndDelete(userId).exec();
          // LOGGING SUCCESS
          console.log(`Permanently Deleted Account: ${user.email} (${userId})`);
        }
        // LOGGING SUCCESS
        console.log(
          `Account Deletion Cron Job: Permanently Deleted ${flaggedUsers.length} Account(s)`
        );
      }
    } catch (error: any) {
      // LOGGING ERROR
      console.error("Error in Account Deletion Cron Job:", error);
    }
  });

  // <== CRON JOB TO AUTO-REVOKE INACTIVE SESSIONS ==>
  // RUNS DAILY AT 3 AM
  cron.schedule("0 3 * * *", async () => {
    try {
      // GETTING CURRENT DATE
      const now = new Date();
      // CALCULATING DATE 30 DAYS AGO (INACTIVE THRESHOLD)
      const inactiveThreshold = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000
      );
      // FINDING INACTIVE SESSIONS (NO ACTIVITY FOR 30 DAYS)
      const inactiveSessions = await Session.find({
        revoked: false,
        lastActivity: { $lt: inactiveThreshold },
        expiresAt: { $gt: now },
      })
        .lean()
        .exec();
      // IF INACTIVE SESSIONS FOUND
      if (inactiveSessions.length > 0) {
        // REVOKING EACH INACTIVE SESSION
        for (const session of inactiveSessions) {
          // UPDATING SESSION
          await Session.updateOne(
            { _id: session._id },
            {
              revoked: true,
              revokedAt: now,
            }
          ).exec();
          // REVOKING ALL REFRESH TOKENS FOR THIS SESSION
          await RefreshToken.updateMany(
            { sessionId: session._id },
            { revoked: true }
          ).exec();
        }
        // LOGGING SUCCESS
        console.log(
          `Session Cleanup Cron Job: Revoked ${inactiveSessions.length} Inactive Session(s)`
        );
      }
    } catch (error: any) {
      // LOGGING ERROR
      console.error("Error in Session Cleanup Cron Job:", error);
    }
  });

  // <== CRON JOB TO HANDLE EXPIRED TRIALS ==>
  // RUNS EVERY HOUR TO CHECK FOR EXPIRED TRIALS
  cron.schedule("0 * * * *", async () => {
    try {
      // GETTING CURRENT DATE
      const now = new Date();
      // FINDING EXPIRED TRIALS (STATUS IS TRIALING AND TRIAL END DATE HAS PASSED)
      const expiredTrials = await Subscription.find({
        status: "trialing",
        trialEndsAt: { $lte: now },
        plan: "free_trial",
      }).exec();
      // IF EXPIRED TRIALS FOUND
      if (expiredTrials.length > 0) {
        // GET FREE PLAN CONFIG
        const freePlanConfig = PLAN_LIMITS.free;
        // PROCESS EACH EXPIRED TRIAL
        for (const subscription of expiredTrials) {
          // GET THE PLAN THEY WERE TRIALING FOR NOTIFICATION
          const trialedPlan = subscription.trialPlan || "premium";
          // UPDATE SUBSCRIPTION TO FREE PLAN
          subscription.plan = "free";
          // SET TRIAL PLAN TO NULL
          subscription.trialPlan = null;
          // SET STATUS TO ACTIVE
          subscription.status = "active";
          // CLEAR TRIAL ENDS AT
          subscription.trialEndsAt = undefined as unknown as Date;
          // SET LIMITS TO FREE PLAN LIMITS
          subscription.limits = freePlanConfig.limits;
          // SET FEATURES TO FREE PLAN FEATURES
          subscription.features = freePlanConfig.features;
          // SAVE SUBSCRIPTION
          await subscription.save();
          // CREATE NOTIFICATION FOR USER
          await createNotification(
            subscription.userId.toString(),
            "trial_expired",
            "Free Trial Ended",
            `Your ${trialedPlan} plan trial has ended. You've been moved to the Free plan. Upgrade anytime to unlock premium features!`,
            subscription._id.toString(),
            app
          );
          // BROADCAST NOTIFICATION IF IO AVAILABLE
          const ioInstance = app.get("io");
          // IF IO INSTANCE AVAILABLE
          if (ioInstance) {
            // EMIT SUBSCRIPTION UPDATED EVENT
            ioInstance.to(subscription.userId.toString()).emit("subscription_updated", {
              plan: "free",
              status: "active",
              message: "Trial ended - moved to Free plan",
            });
          }
        }
        // LOGGING SUCCESS
        console.log(
          `Trial Expiration Cron Job: Processed ${expiredTrials.length} Expired Trial(s) -> Free Plan`
        );
      }
    } catch (error: any) {
      // LOGGING ERROR
      console.error("Error in Trial Expiration Cron Job:", error);
    }
  });

  // <== CRON JOB TO SEND TRIAL EXPIRATION WARNINGS ==>
  // RUNS DAILY AT 9 AM TO WARN USERS WHOSE TRIALS ARE ENDING SOON
  cron.schedule("0 9 * * *", async () => {
    try {
      // GETTING CURRENT DATE
      const now = new Date();
      // CALCULATE 3 DAYS FROM NOW
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      // FINDING TRIALS ENDING IN 3 DAYS (BETWEEN NOW AND 3 DAYS)
      const trialsEndingSoon = await Subscription.find({
        status: "trialing",
        trialEndsAt: { $gte: now, $lte: threeDaysFromNow },
        plan: "free_trial",
      }).exec();
      // PROCESS EACH TRIAL ENDING SOON
      for (const subscription of trialsEndingSoon) {
        // CALCULATE DAYS REMAINING
        const trialEnd = new Date(subscription.trialEndsAt!);
        // CALCULATE DAYS REMAINING
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        // GET THE PLAN THEY ARE TRIALING FOR NOTIFICATION
        const trialedPlan = subscription.trialPlan || "premium";
        // DETERMINE MESSAGE AND NOTIFICATION TYPE BASED ON DAYS REMAINING
        let message: string;
        // SET NOTIFICATION TYPE WITH PROPER TYPE
        let notificationType: "trial_ending_soon" | "trial_ending_tomorrow" = "trial_ending_soon";
        // IF DAYS REMAINING IS 1 OR LESS
        if (daysRemaining <= 1) {
          // SET MESSAGE
          message = `Your ${trialedPlan} plan trial ends tomorrow! Subscribe now to keep your premium features.`;
          // SET NOTIFICATION TYPE
          notificationType = "trial_ending_tomorrow";
        } else {
          // SET MESSAGE
          message = `Your ${trialedPlan} plan trial ends in ${daysRemaining} days. Subscribe to continue using premium features.`;
        }
        // CREATE NOTIFICATION FOR USER
        await createNotification(
          subscription.userId.toString(),
          notificationType,
          "Trial Ending Soon",
          message,
          subscription._id.toString(),
          app
        );
      }
      // LOG RESULTS
      if (trialsEndingSoon.length > 0) {
        // LOGGING SUCCESS
        console.log(
          `Trial Warning Cron Job: Sent ${trialsEndingSoon.length} Trial Expiration Warning(s)`
        );
      }
    } catch (error: any) {
      // LOGGING ERROR
      console.error("Error in Trial Warning Cron Job:", error);
    }
  });

  // <== CRON JOB TO GENERATE RECURRING TASK OCCURRENCES ==>
  // RUNS EVERY DAY AT 1 AM
  cron.schedule("0 1 * * *", async () => {
    try {
      // GETTING CURRENT DATE
      const now = new Date();
      // GETTING END OF TODAY
      const endOfToday = new Date(now);
      // SETTING END OF TODAY TO 11:59:59 PM
      endOfToday.setHours(23, 59, 59, 999);
      // FINDING RECURRING TASKS THAT NEED NEXT OCCURRENCE GENERATED
      const recurringTasks = await Task.find({
        "recurrence.isRecurring": true,
        "recurrence.nextOccurrence": { $lte: endOfToday },
        isTrashed: false,
        $or: [{ status: "completed" }, { dueDate: { $lt: now } }],
      })
        .lean()
        .exec();
      // COUNTER FOR GENERATED TASKS
      let generatedCount = 0;
      // PROCESS EACH RECURRING TASK
      for (const task of recurringTasks) {
        // CHECK IF END DATE HAS PASSED
        if (
          task.recurrence?.endDate &&
          now > new Date(task.recurrence.endDate)
        ) {
          // DISABLE RECURRENCE FOR THIS TASK
          await Task.updateOne(
            { _id: task._id },
            { "recurrence.isRecurring": false }
          ).exec();
          // CONTINUE TO NEXT TASK
          continue;
        }
        // CALCULATE NEW DUE DATE
        const baseDueDate = task.dueDate || now;
        // CALCULATING NEW DUE DATE
        const newDueDate = calculateNextOccurrenceForCron(
          new Date(baseDueDate),
          task.recurrence?.pattern || "daily",
          task.recurrence?.interval || 1,
          task.recurrence?.daysOfWeek || [],
          task.recurrence?.skipWeekends || false
        );
        // CHECK IF NEW DUE DATE EXCEEDS END DATE
        if (
          task.recurrence?.endDate &&
          newDueDate > new Date(task.recurrence.endDate)
        ) {
          // DISABLE RECURRENCE FOR THIS TASK
          await Task.updateOne(
            { _id: task._id },
            { "recurrence.isRecurring": false }
          ).exec();
          // CONTINUE TO NEXT TASK
          continue;
        }
        // CREATE NEW TASK OCCURRENCE
        const newTaskData = {
          title: task.title,
          description: task.description,
          status: "to do",
          priority: task.priority,
          dueDate: newDueDate,
          projectId: task.projectId,
          userId: task.userId,
          recurrence: {
            isRecurring: true,
            pattern: task.recurrence?.pattern,
            interval: task.recurrence?.interval,
            daysOfWeek: task.recurrence?.daysOfWeek,
            dayOfMonth: task.recurrence?.dayOfMonth,
            endDate: task.recurrence?.endDate,
            skipWeekends: task.recurrence?.skipWeekends,
            nextOccurrence: calculateNextOccurrenceForCron(
              newDueDate,
              task.recurrence?.pattern || "daily",
              task.recurrence?.interval || 1,
              task.recurrence?.daysOfWeek || [],
              task.recurrence?.skipWeekends || false
            ),
            lastGeneratedAt: now,
            originalTaskId: task.recurrence?.originalTaskId || task._id,
            occurrenceCount: (task.recurrence?.occurrenceCount || 0) + 1,
          },
        };
        // CREATE NEW TASK
        await Task.create(newTaskData);
        // DISABLE RECURRENCE ON ORIGINAL TASK
        await Task.updateOne(
          { _id: task._id },
          {
            "recurrence.isRecurring": false,
            "recurrence.lastGeneratedAt": now,
          }
        ).exec();
        // INCREMENT COUNTER
        generatedCount++;
        // CREATE NOTIFICATION FOR USER
        await createNotification(
          task.userId.toString(),
          "recurring_task",
          "Recurring Task Created",
          `A new occurrence of "${task.title}" has been created.`,
          task._id.toString(),
          app
        );
      }
      // LOG RESULTS
      if (generatedCount > 0) {
        console.log(
          `Recurring Task Cron Job: Generated ${generatedCount} New Task Occurrence(s)`
        );
      }
    } catch (error: any) {
      // LOGGING ERROR
      console.error("Error in Recurring Task Cron Job:", error);
    }
  });

  // LOGGING SUCCESS
  console.log("Cron Jobs Initialized Successfully!");
};

// <== RECURRENCE PATTERN TYPE FOR CRON ==>
type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly" | "custom";

// <== CALCULATE NEXT OCCURRENCE HELPER FOR CRON ==>
const calculateNextOccurrenceForCron = (
  baseDate: Date,
  pattern: RecurrencePattern,
  interval: number = 1,
  daysOfWeek: number[] = [],
  skipWeekends: boolean = false
): Date => {
  // CREATE NEW DATE OBJECT FROM BASE DATE
  const nextDate = new Date(baseDate);
  // SWITCH BASED ON PATTERN
  switch (pattern) {
    // CASE DAILY
    case "daily":
      // ADD INTERVAL DAYS
      nextDate.setDate(nextDate.getDate() + interval);
      // IF SKIP WEEKENDS, ADJUST DATE
      if (skipWeekends) {
        // GET DAY OF WEEK (0 = SUNDAY, 6 = SATURDAY)
        const dayOfWeek = nextDate.getDay();
        // IF SATURDAY, ADD 2 DAYS TO GET TO MONDAY
        if (dayOfWeek === 6) {
          // ADD 2 DAYS TO GET TO MONDAY
          nextDate.setDate(nextDate.getDate() + 2);
        }
        // IF SUNDAY, ADD 1 DAY TO GET TO MONDAY
        else if (dayOfWeek === 0) {
          // ADD 1 DAY TO GET TO MONDAY
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }
      break;
    // CASE WEEKLY
    case "weekly":
      // IF DAYS OF WEEK SPECIFIED, FIND NEXT MATCHING DAY
      if (daysOfWeek.length > 0) {
        // SORT DAYS OF WEEK
        const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
        // GET CURRENT DAY OF WEEK
        const currentDay = nextDate.getDay();
        // FIND NEXT DAY IN SORTED DAYS
        let foundNextDay = false;
        // LOOP THROUGH SORTED DAYS
        for (const day of sortedDays) {
          // IF DAY IS AFTER CURRENT DAY, USE IT
          if (day > currentDay) {
            // CALCULATE DAYS TO ADD
            nextDate.setDate(nextDate.getDate() + (day - currentDay));
            // SET FOUND NEXT DAY TO TRUE
            foundNextDay = true;
            // BREAK OUT OF LOOP
            break;
          }
        }
        // IF NO NEXT DAY FOUND IN CURRENT WEEK, GO TO FIRST DAY OF NEXT INTERVAL WEEK
        if (!foundNextDay && sortedDays[0] !== undefined) {
          // DAYS UNTIL NEXT OCCURRENCE OF FIRST DAY
          const daysUntilFirst = 7 - currentDay + sortedDays[0];
          // ADD INTERVAL WEEKS MINUS ONE (SINCE WE ALREADY ADD ONE WEEK)
          nextDate.setDate(
            nextDate.getDate() + daysUntilFirst + (interval - 1) * 7
          );
        }
      } else {
        // NO SPECIFIC DAYS, JUST ADD INTERVAL WEEKS
        nextDate.setDate(nextDate.getDate() + interval * 7);
      }
      break;
    // CASE MONTHLY
    case "monthly":
      // ADD INTERVAL MONTHS
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    // CASE YEARLY
    case "yearly":
      // ADD INTERVAL YEARS
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
    // CASE CUSTOM
    case "custom":
      // FOR CUSTOM, DEFAULT TO DAILY WITH INTERVAL
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    // DEFAULT CASE
    default:
      // DEFAULT TO DAILY
      nextDate.setDate(nextDate.getDate() + 1);
  }
  // RETURN NEXT DATE
  return nextDate;
};

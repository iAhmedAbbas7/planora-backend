// <== IMPORTS ==>
import cron from "node-cron";
import { Express } from "express";
import { Task } from "../models/task.model.js";
import { User } from "../models/user.model.js";
import { createNotification } from "../controllers/notification.controller.js";
import { broadcastNotification } from "../utils/broadcastNotification.js";

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
  // LOGGING SUCCESS
  console.log("Cron Jobs Initialized Successfully!");
};

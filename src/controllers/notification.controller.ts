// <== IMPORTS ==>
import {
  Notification,
  NotificationType,
} from "../models/notification.model.js";
import expressAsyncHandler from "express-async-handler";
import { NotificationSettings } from "../models/notificationSettings.model.js";

/**
 * GET USER NOTIFICATIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USER NOTIFICATIONS ==>
export const getNotifications = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING QUERY PARAMETERS
  const { isRead, limit, page } = req.query;
  // PAGINATION PARAMETERS
  const pageNumber = parseInt(page as string) || 1;
  const pageSize = parseInt(limit as string) || 50;
  const skip = (pageNumber - 1) * pageSize;
  // BUILDING QUERY OBJECT
  let query: any = { userId };
  // IF IS READ PROVIDED
  if (isRead !== undefined) {
    query.isRead = isRead === "true";
  }
  // GETTING TOTAL COUNT
  const totalNotifications = await Notification.countDocuments(query).exec();
  // FINDING NOTIFICATIONS
  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean()
    .exec();
  // CALCULATING PAGINATION METADATA
  const totalPages = Math.ceil(totalNotifications / pageSize);
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: notifications.length,
    total: totalNotifications,
    page: pageNumber,
    totalPages,
    data: notifications,
  });
  return;
});

/**
 * MARK NOTIFICATION AS READ
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MARK NOTIFICATION AS READ ==>
export const markAsRead = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING NOTIFICATION ID FROM REQUEST PARAMS
  const notificationId = req.params.id;
  // IF NOTIFICATION ID NOT PROVIDED, RETURN 400 ERROR
  if (!notificationId) {
    res.status(400).json({
      message: "Notification ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND UPDATING NOTIFICATION
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  )
    .lean()
    .exec();
  // IF NOTIFICATION NOT FOUND, RETURN 404 ERROR
  if (!notification) {
    res.status(404).json({
      message: "Notification not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Notification marked as read!",
    success: true,
    data: notification,
  });
  return;
});

/**
 * MARK ALL NOTIFICATIONS AS READ
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MARK ALL NOTIFICATIONS AS READ ==>
export const markAllAsRead = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // UPDATING ALL UNREAD NOTIFICATIONS
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true }
  ).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "All notifications marked as read!",
    success: true,
    data: {
      modifiedCount: result.modifiedCount,
    },
  });
  return;
});

/**
 * DELETE NOTIFICATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE NOTIFICATION ==>
export const deleteNotification = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING NOTIFICATION ID FROM REQUEST PARAMS
  const notificationId = req.params.id;
  // IF NOTIFICATION ID NOT PROVIDED, RETURN 400 ERROR
  if (!notificationId) {
    res.status(400).json({
      message: "Notification ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND DELETING NOTIFICATION
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    userId,
  })
    .lean()
    .exec();
  // IF NOTIFICATION NOT FOUND, RETURN 404 ERROR
  if (!notification) {
    res.status(404).json({
      message: "Notification not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Notification deleted successfully!",
    success: true,
  });
  return;
});

/**
 * CREATE NOTIFICATION (HELPER FUNCTION)
 * @param userId - User ID
 * @param type - Notification Type
 * @param title - Notification Title
 * @param message - Notification Message
 * @param relatedId - Related ID (Optional)
 * @param app - Express App Instance (Optional, for Broadcasting)
 * @returns Notification Object or Null
 */
// <== CREATE NOTIFICATION ==>
export const createNotification = async (
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  relatedId?: string,
  app?: any
): Promise<any> => {
  try {
    // GETTING NOTIFICATION SETTINGS
    const settings = await NotificationSettings.findOne({
      userId,
    })
      .lean()
      .exec();
    // IF SETTINGS EXIST, CHECK PREFERENCES
    if (settings) {
      const { taskReminders, dueDateAlerts, emailUpdates } = settings;
      // CHECKING IF NOTIFICATION SHOULD BE SKIPPED
      if (
        (type === "task_due_soon" && !taskReminders) ||
        (type.includes("task") && !emailUpdates) ||
        (type.includes("project") && !emailUpdates) ||
        (type === "task_due_soon" && !dueDateAlerts)
      ) {
        // SKIPPING NOTIFICATION DUE TO USER PREFERENCES
        return null;
      }
    }
    // CREATING NEW NOTIFICATION
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      relatedId,
      isRead: false,
    });
    // IF APP INSTANCE PROVIDED, BROADCAST NOTIFICATION
    if (app) {
      // IMPORTING BROADCAST FUNCTION DYNAMICALLY TO AVOID CIRCULAR DEPENDENCY
      const { broadcastNotification } = await import(
        "../utils/broadcastNotification.js"
      );
      broadcastNotification(app, userId, notification);
    }
    // RETURNING NOTIFICATION
    return notification;
  } catch (error) {
    // LOGGING ERROR
    console.error("Error creating notification:", error);
    // RETURNING NULL
    return null;
  }
};

/**
 * GET UNREAD NOTIFICATION COUNT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET UNREAD NOTIFICATION COUNT ==>
export const getUnreadCount = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // COUNTING UNREAD NOTIFICATIONS
  const unreadCount = await Notification.countDocuments({
    userId,
    isRead: false,
  }).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      unreadCount,
    },
  });
  return;
});

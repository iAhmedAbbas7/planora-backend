// <== IMPORTS ==>
import { NotificationSettings } from "../models/notificationSettings.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET USER NOTIFICATION SETTINGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USER NOTIFICATION SETTINGS ==>
export const getNotificationSettings = expressAsyncHandler(async (req, res) => {
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
  // FINDING OR CREATING NOTIFICATION SETTINGS
  let settings = await NotificationSettings.findOne({ userId }).lean().exec();
  // IF SETTINGS NOT FOUND, CREATE DEFAULT SETTINGS
  if (!settings) {
    settings = await NotificationSettings.create({ userId });
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: settings,
  });
  return;
});

/**
 * UPDATE USER NOTIFICATION SETTINGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE USER NOTIFICATION SETTINGS ==>
export const updateNotificationSettings = expressAsyncHandler(
  async (req, res) => {
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
    // GETTING SETTINGS DATA FROM REQUEST BODY
    const { taskReminders, dueDateAlerts, emailUpdates } = req.body;
    // FINDING AND UPDATING NOTIFICATION SETTINGS
    const updated = await NotificationSettings.findOneAndUpdate(
      { userId },
      {
        taskReminders,
        dueDateAlerts,
        emailUpdates,
      },
      { new: true, upsert: true, runValidators: true }
    )
      .lean()
      .exec();
    // RETURNING RESPONSE
    res.status(200).json({
      message: "Notification settings updated successfully!",
      success: true,
      data: updated,
    });
    return;
  }
);


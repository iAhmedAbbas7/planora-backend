// <== IMPORTS ==>
import { Settings } from "../models/settings.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET USER APPEARANCE SETTINGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USER APPEARANCE SETTINGS ==>
export const getAppearance = expressAsyncHandler(async (req, res) => {
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
  // FINDING SETTINGS FOR USER
  let settings = await Settings.findOne({ user: userId }).lean().exec();
  // IF SETTINGS NOT FOUND, CREATE DEFAULT SETTINGS
  if (!settings) {
    // CREATING DEFAULT SETTINGS
    const newSettings = new Settings({
      user: userId,
      appearance: {
        theme: "system",
        accentColor: "violet",
      },
    });
    // SAVING SETTINGS
    await newSettings.save();
    // RETURNING DEFAULT SETTINGS
    const appearance = newSettings.appearance || {
      theme: "system",
      accentColor: "violet",
    };
    // RETURNING DEFAULT SETTINGS
    res.status(200).json({
      success: true,
      data: {
        theme: appearance.theme,
        accentColor: appearance.accentColor,
      },
    });
    return;
  }
  // RETURNING SETTINGS
  const appearance = settings.appearance || {
    theme: "system",
    accentColor: "violet",
  };
  // RETURNING SETTINGS
  res.status(200).json({
    success: true,
    data: {
      theme: appearance.theme,
      accentColor: appearance.accentColor,
    },
  });
  return;
});

/**
 * UPDATE USER APPEARANCE SETTINGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE USER APPEARANCE SETTINGS ==>
export const updateAppearance = expressAsyncHandler(async (req, res) => {
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
  // GETTING APPEARANCE DATA FROM REQUEST BODY
  const { theme, accentColor } = req.body;
  // FINDING OR CREATING SETTINGS FOR USER
  let settings = await Settings.findOne({ user: userId }).exec();
  // IF SETTINGS NOT FOUND, CREATE NEW SETTINGS
  if (!settings) {
    // CREATING NEW SETTINGS
    const newSettings = new Settings({
      user: userId,
      appearance: {
        theme: theme || "system",
        accentColor: accentColor || "violet",
      },
    });
    // SAVING SETTINGS
    await newSettings.save();
    // GETTING APPEARANCE (ENSURED TO EXIST)
    const appearance = newSettings.appearance || {
      theme: "system",
      accentColor: "violet",
    };
    // RETURNING UPDATED SETTINGS
    res.status(200).json({
      message: "Appearance settings updated successfully!",
      success: true,
      data: {
        theme: appearance.theme,
        accentColor: appearance.accentColor,
      },
    });
    return;
  }
  // ENSURING APPEARANCE EXISTS
  if (!settings.appearance) {
    settings.appearance = {
      theme: "system",
      accentColor: "violet",
    };
  }
  // UPDATING APPEARANCE SETTINGS
  if (theme && ["light", "dark", "system"].includes(theme)) {
    settings.appearance.theme = theme;
  }
  if (
    accentColor &&
    ["violet", "pink", "blue", "green"].includes(accentColor)
  ) {
    settings.appearance.accentColor = accentColor;
  }
  // SAVING SETTINGS
  await settings.save();
  // GETTING APPEARANCE (ENSURED TO EXIST)
  const appearance = settings.appearance || {
    theme: "system",
    accentColor: "violet",
  };
  // RETURNING UPDATED SETTINGS
  res.status(200).json({
    message: "Appearance settings updated successfully!",
    success: true,
    data: {
      theme: appearance.theme,
      accentColor: appearance.accentColor,
    },
  });
  return;
});

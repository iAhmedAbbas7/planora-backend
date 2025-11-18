// <== IMPORTS ==>
import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET ACCOUNT INFO
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ACCOUNT INFO ==>
export const getAccount = expressAsyncHandler(async (req, res) => {
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
  // FINDING USER
  const user = await User.findById(userId).select("email").lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      email: user.email,
    },
  });
  return;
});

/**
 * UPDATE ACCOUNT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE ACCOUNT ==>
export const updateAccount = expressAsyncHandler(async (req, res) => {
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
  // GETTING ACCOUNT DATA FROM REQUEST BODY
  const { newEmail, currentPassword, newPassword } = req.body;
  // FINDING USER WITH PASSWORD
  const user = await User.findById(userId).select("+password").exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    return;
  }
  // IF NEW EMAIL PROVIDED
  if (newEmail && newEmail !== user.email) {
    // CHECKING IF EMAIL ALREADY EXISTS
    const existingUser = await User.findOne({ email: newEmail.toLowerCase().trim() })
      .lean()
      .exec();
    // IF EMAIL ALREADY EXISTS, RETURN 409 ERROR
    if (existingUser) {
      res.status(409).json({
        message: "Email already in use!",
        success: false,
      });
      return;
    }
    // UPDATING EMAIL
    user.email = newEmail.toLowerCase().trim();
  }
  // IF NEW PASSWORD PROVIDED
  if (newPassword) {
    // IF CURRENT PASSWORD NOT PROVIDED, RETURN 400 ERROR
    if (!currentPassword) {
      res.status(400).json({
        message: "Current password is required!",
        success: false,
      });
      return;
    }
    // COMPARING CURRENT PASSWORD
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    // IF PASSWORD DOES NOT MATCH, RETURN 400 ERROR
    if (!isMatch) {
      res.status(400).json({
        message: "Current password is incorrect!",
        success: false,
      });
      return;
    }
    // VALIDATING NEW PASSWORD LENGTH
    if (newPassword.length < 6) {
      res.status(400).json({
        message: "New password must be at least 6 characters long!",
        success: false,
      });
      return;
    }
    // HASHING NEW PASSWORD
    user.password = await bcrypt.hash(newPassword, 10);
  }
  // SAVING USER
  await user.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Account updated successfully!",
    success: true,
  });
  return;
});

/**
 * DELETE ACCOUNT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE ACCOUNT ==>
export const deleteAccount = expressAsyncHandler(async (req, res) => {
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
  // GETTING PASSWORD FROM REQUEST BODY FOR CONFIRMATION
  const { password } = req.body;
  // IF PASSWORD NOT PROVIDED, RETURN 400 ERROR
  if (!password) {
    res.status(400).json({
      message: "Password is required for account deletion!",
      success: false,
    });
    return;
  }
  // FINDING USER WITH PASSWORD
  const user = await User.findById(userId).select("+password").exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    return;
  }
  // COMPARING PASSWORD
  const isMatch = await bcrypt.compare(password, user.password);
  // IF PASSWORD DOES NOT MATCH, RETURN 400 ERROR
  if (!isMatch) {
    res.status(400).json({
      message: "Password is incorrect!",
      success: false,
    });
    return;
  }
  // DELETING USER
  await User.findByIdAndDelete(userId).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Account deleted successfully!",
    success: true,
  });
  return;
});


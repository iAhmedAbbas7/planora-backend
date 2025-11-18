// <== IMPORTS ==>
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET USER PROFILE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USER PROFILE ==>
export const getProfile = expressAsyncHandler(async (req, res) => {
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
  const user = await User.findById(userId)
    .select("email firstName lastName role bio profilePic name")
    .lean()
    .exec();
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
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      bio: user.bio,
      profilePic: user.profilePic,
      name: user.name,
    },
  });
  return;
});

/**
 * UPDATE USER PROFILE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE USER PROFILE ==>
export const updateProfile = expressAsyncHandler(async (req, res) => {
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
  const user = await User.findById(userId).exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    return;
  }
  // GETTING PROFILE DATA FROM REQUEST BODY
  const { firstName, lastName, role, bio, profilePic } = req.body;
  // UPDATING USER FIELDS
  if (typeof firstName === "string") {
    user.firstName = firstName.trim();
  }
  if (typeof lastName === "string") {
    user.lastName = lastName.trim();
  }
  if (typeof role === "string") {
    user.role = role.trim();
  }
  if (typeof bio === "string") {
    user.bio = bio.substring(0, 500);
  }
  // HANDLING PROFILE PICTURE (MULTIPART OR BASE64)
  const file = (req as any).file as Express.Multer.File | undefined;
  if (file && file.buffer) {
    // CONVERTING FILE TO BASE64
    const base64 = `data:${file.mimetype};base64,${file.buffer.toString(
      "base64"
    )}`;
    user.profilePic = base64;
  } else if (typeof profilePic === "string") {
    user.profilePic = profilePic;
  }
  // SAVING USER
  await user.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Profile updated successfully!",
    success: true,
    data: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      bio: user.bio,
      profilePic: user.profilePic,
    },
  });
  return;
});

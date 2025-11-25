// <== IMPORTS ==>
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";
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
    .select("email name role bio profilePic profilePicPublicId")
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
      name: user.name,
      role: user.role,
      bio: user.bio,
      profilePic: user.profilePic,
      profilePicPublicId: user.profilePicPublicId,
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
  const { name, role, bio, deleteProfilePic } = req.body;
  // HANDLING NAME
  if (typeof name === "string") {
    user.name = name.trim();
  }
  // HANDLING ROLE
  if (typeof role === "string") {
    user.role = role.trim();
  }
  // HANDLING BIO
  if (typeof bio === "string") {
    user.bio = bio.substring(0, 500);
  }
  // HANDLING PROFILE PICTURE
  const file = (req as any).file as Express.Multer.File | undefined;
  // IF NEW FILE IS UPLOADED
  if (file && file.buffer) {
    // DELETE OLD PROFILE PICTURE FROM CLOUDINARY IF EXISTS
    if (user.profilePicPublicId) {
      // DELETE OLD PROFILE PICTURE FROM CLOUDINARY
      await deleteFromCloudinary(user.profilePicPublicId);
    }
    // UPLOAD NEW IMAGE TO CLOUDINARY
    const uploadResult = await uploadToCloudinary(file);
    // UPDATE USER PROFILE PICTURE URL
    user.profilePic = uploadResult.url;
    // UPDATE USER PROFILE PICTURE PUBLIC ID
    user.profilePicPublicId = uploadResult.publicId;
  } else if (deleteProfilePic === "true" || deleteProfilePic === true) {
    // IF DELETE FLAG IS SET, DELETE PROFILE PICTURE
    if (user.profilePicPublicId) {
      // DELETE OLD PROFILE PICTURE FROM CLOUDINARY
      await deleteFromCloudinary(user.profilePicPublicId);
    }
    // UPDATE USER PROFILE PICTURE URL
    user.profilePic = "";
    // UPDATE USER PROFILE PICTURE PUBLIC ID
    user.profilePicPublicId = "";
  }
  // SAVING USER
  await user.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Profile updated successfully!",
    success: true,
    data: {
      email: user.email,
      name: user.name,
      role: user.role,
      bio: user.bio,
      profilePic: user.profilePic,
      profilePicPublicId: user.profilePicPublicId,
    },
  });
  return;
});

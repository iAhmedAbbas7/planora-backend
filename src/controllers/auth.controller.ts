// <== IMPORTS ==>
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import expressAsyncHandler from "express-async-handler";
import crypto from "crypto";

/**
 * GENERATE JWT TOKEN
 * @param userId - User ID
 * @returns JWT Token
 */
// <== GENERATE JWT TOKEN ==>
export const generateToken = (userId: string): string => {
  // GETTING ACCESS TOKEN SECRET FROM ENVIRONMENT VARIABLES
  const secret = process.env.AT_SECRET || process.env.JWT_SECRET;
  // IF ACCESS TOKEN SECRET IS NOT DEFINED, THROW AN ERROR
  if (!secret) {
    throw new Error("AT_SECRET or JWT_SECRET is not Defined");
  }
  // GENERATING JWT TOKEN WITH USER ID AND ACCESS TOKEN SECRET
  return jwt.sign({ userId }, secret, {
    // SETTING EXPIRATION TIME TO 24 HOURS
    expiresIn: process.env.AT_EXPIRES_IN || "24h",
  } as jwt.SignOptions);
};

/**
 * GENERATE REFRESH TOKEN
 * @param userId - User ID
 * @param tokenId - Token ID for database lookup
 * @returns Refresh Token
 */
// <== GENERATE REFRESH TOKEN ==>
export const generateRefreshToken = (
  userId: string,
  tokenId: string
): string => {
  // GETTING REFRESH TOKEN SECRET FROM ENVIRONMENT VARIABLES
  const secret = process.env.RT_SECRET;
  // IF REFRESH TOKEN SECRET IS NOT DEFINED, THROW AN ERROR
  if (!secret) {
    throw new Error("RT_SECRET is not Defined");
  }
  // GENERATING JWT TOKEN WITH USER ID AND TOKEN ID
  return jwt.sign({ userId, tokenId }, secret, {
    // SETTING EXPIRATION TIME TO 30 DAYS
    expiresIn: process.env.RT_EXPIRES_IN || "30d",
  } as jwt.SignOptions);
};

/**
 * USER SIGNUP
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== USER SIGNUP ==>
export const signup = expressAsyncHandler(async (req, res) => {
  // GETTING USER DATA FROM REQUEST BODY
  const { name, email, password } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!name || !email || !password) {
    res.status(400).json({
      message: "Name, Email, and Password are Required!",
      success: false,
    });
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    return;
  }
  // VALIDATING PASSWORD LENGTH
  if (password.length < 6) {
    res.status(400).json({
      message: "Password must be at least 6 characters long!",
      success: false,
    });
    return;
  }
  // CHECKING IF USER ALREADY EXISTS
  const existingUser = await User.findOne({ email }).lean().exec();
  // IF USER ALREADY EXISTS, RETURN 409 ERROR
  if (existingUser) {
    res.status(409).json({
      message: "User with this email already exists!",
      success: false,
    });
    return;
  }
  // HASHING PASSWORD
  const hashedPassword = await bcrypt.hash(password, 10);
  // CREATING NEW USER
  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
  });
  // CLEANING UP ANY EXISTING REFRESH TOKENS (ALL TOKENS - REVOKED, EXPIRED, OR ACTIVE)
  await RefreshToken.deleteMany({ userId: newUser._id }).exec();
  // GENERATING UNIQUE TOKEN ID FOR DATABASE STORAGE
  const tokenId = crypto.randomUUID();
  // GENERATING ACCESS TOKEN
  const accessToken = generateToken(newUser._id.toString());
  // GENERATING REFRESH TOKEN WITH TOKEN ID
  const refreshToken = generateRefreshToken(newUser._id.toString(), tokenId);
  // CALCULATING REFRESH TOKEN EXPIRATION DATE
  const expiresIn = process.env.RT_EXPIRES_IN || "30d";
  // CALCULATING EXPIRATION DAYS
  const expiresInDays = expiresIn.includes("d") ? parseInt(expiresIn) : 30;
  // CALCULATING EXPIRATION DATE
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  // STORING REFRESH TOKEN IN DATABASE
  await RefreshToken.create({
    tokenId,
    userId: newUser._id,
    expiresAt,
    revoked: false,
  });
  // SETTING ACCESS TOKEN IN HTTP-ONLY COOKIE
  const accessTokenExpiresIn = process.env.AT_EXPIRES_IN || "15m";
  // CALCULATING ACCESS TOKEN MAX AGE
  const accessTokenMaxAge = accessTokenExpiresIn.includes("m")
    ? parseInt(accessTokenExpiresIn) * 60 * 1000
    : 15 * 60 * 1000; // Default 15 minutes
  // SETTING ACCESS TOKEN IN HTTP-ONLY COOKIE
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: accessTokenMaxAge,
  });
  // SETTING REFRESH TOKEN IN HTTP-ONLY COOKIE
  const refreshTokenMaxAge = expiresInDays * 24 * 60 * 60 * 1000;
  // SETTING REFRESH TOKEN IN HTTP-ONLY COOKIE
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: refreshTokenMaxAge,
  });
  // RETURNING RESPONSE (NO TOKENS IN BODY FOR SECURITY)
  res.status(201).json({
    message: "Signup successful!",
    success: true,
    data: {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
    },
  });
  return;
});

/**
 * USER LOGIN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== USER LOGIN ==>
export const login = expressAsyncHandler(async (req, res) => {
  // GETTING USER DATA FROM REQUEST BODY
  const { email, password } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email || !password) {
    res.status(400).json({
      message: "Email and Password are Required!",
      success: false,
    });
    return;
  }
  // FINDING USER BY EMAIL WITH PASSWORD FIELD
  const user = await User.findOne({ email }).select("+password").lean().exec();
  // IF USER NOT FOUND, RETURN 401 ERROR
  if (!user) {
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    return;
  }
  // COMPARING PASSWORD
  const isMatch = await bcrypt.compare(password, user.password || "");
  // IF PASSWORD DOES NOT MATCH, RETURN 401 ERROR
  if (!isMatch) {
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    return;
  }
  // CLEANING UP ANY EXISTING REFRESH TOKENS (ALL TOKENS - REVOKED, EXPIRED, OR ACTIVE)
  await RefreshToken.deleteMany({ userId: user._id }).exec();
  // GENERATING UNIQUE TOKEN ID FOR DATABASE STORAGE
  const tokenId = crypto.randomUUID();
  // GENERATING ACCESS TOKEN
  const accessToken = generateToken(user._id.toString());
  // GENERATING REFRESH TOKEN WITH TOKEN ID
  const refreshToken = generateRefreshToken(user._id.toString(), tokenId);
  // CALCULATING REFRESH TOKEN EXPIRATION DATE
  const expiresIn = process.env.RT_EXPIRES_IN || "30d";
  // CALCULATING EXPIRATION DAYS
  const expiresInDays = expiresIn.includes("d") ? parseInt(expiresIn) : 30;
  // CALCULATING EXPIRATION DATE
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  // STORING REFRESH TOKEN IN DATABASE
  await RefreshToken.create({
    tokenId,
    userId: user._id,
    expiresAt,
    revoked: false,
  });
  // SETTING ACCESS TOKEN IN HTTP-ONLY COOKIE
  const accessTokenExpiresIn = process.env.AT_EXPIRES_IN || "15m";
  // CALCULATING ACCESS TOKEN MAX AGE
  const accessTokenMaxAge = accessTokenExpiresIn.includes("m")
    ? parseInt(accessTokenExpiresIn) * 60 * 1000
    : 15 * 60 * 1000; // Default 15 minutes
  // SETTING ACCESS TOKEN IN HTTP-ONLY COOKIE
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: accessTokenMaxAge,
  });
  // SETTING REFRESH TOKEN IN HTTP-ONLY COOKIE
  const refreshTokenMaxAge = expiresInDays * 24 * 60 * 60 * 1000;
  // SETTING REFRESH TOKEN IN HTTP-ONLY COOKIE
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: refreshTokenMaxAge,
  });
  // RETURNING RESPONSE (NO TOKENS IN BODY FOR SECURITY)
  res.status(200).json({
    message: "Login successful!",
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
  return;
});

/**
 * REFRESH ACCESS TOKEN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REFRESH ACCESS TOKEN ==>
export const refreshToken = expressAsyncHandler(async (req, res) => {
  // GETTING REFRESH TOKEN FROM COOKIE
  const refreshTokenFromCookie = req.cookies.refreshToken;
  // IF NO REFRESH TOKEN FOUND, RETURN 401 ERROR
  if (!refreshTokenFromCookie) {
    res.status(401).json({
      message: "Refresh token not found!",
      success: false,
    });
    return;
  }
  // DECODING REFRESH TOKEN
  let decodedToken: jwt.JwtPayload | undefined;
  try {
    // VERIFYING REFRESH TOKEN
    decodedToken = jwt.verify(
      refreshTokenFromCookie,
      process.env.RT_SECRET!
    ) as jwt.JwtPayload;
  } catch (error: any) {
    // IF TOKEN EXPIRED OR INVALID, RETURN 401 ERROR
    res.status(401).json({
      message: "Invalid or expired refresh token!",
      success: false,
    });
    return;
  }
  // GETTING USER ID AND TOKEN ID FROM DECODED TOKEN
  const userId = decodedToken.userId;
  const tokenId = decodedToken.tokenId;
  // IF TOKEN ID NOT FOUND, RETURN 401 ERROR
  if (!tokenId) {
    res.status(401).json({
      message: "Invalid refresh token format!",
      success: false,
    });
    return;
  }
  // FINDING REFRESH TOKEN IN DATABASE BY TOKEN ID
  const storedToken = await RefreshToken.findOne({
    tokenId,
    userId,
    revoked: false,
  })
    .lean()
    .exec();
  // IF TOKEN NOT FOUND IN DATABASE OR EXPIRED, RETURN 401 ERROR
  if (!storedToken || storedToken.expiresAt < new Date()) {
    res.status(401).json({
      message: "Refresh token not found or expired!",
      success: false,
    });
    return;
  }
  // DELETING OLD REFRESH TOKEN BEING USED FOR REFRESH
  await RefreshToken.deleteOne({ _id: storedToken._id }).exec();
  // CLEANING UP ANY OTHER REVOKED OR EXPIRED TOKENS FOR THIS USER
  await RefreshToken.deleteMany({
    userId,
    $or: [{ revoked: true }, { expiresAt: { $lt: new Date() } }],
  }).exec();
  // GENERATING NEW TOKEN ID
  const newTokenId = crypto.randomUUID();
  // GENERATING NEW ACCESS TOKEN
  const newAccessToken = generateToken(userId);
  // GENERATING NEW REFRESH TOKEN WITH NEW TOKEN ID
  const newRefreshToken = generateRefreshToken(userId, newTokenId);
  // CALCULATING NEW REFRESH TOKEN EXPIRATION DATE
  const expiresIn = process.env.RT_EXPIRES_IN || "30d";
  const expiresInDays = expiresIn.includes("d") ? parseInt(expiresIn) : 30;
  // CALCULATING NEW REFRESH TOKEN EXPIRATION DATE
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  // STORING NEW REFRESH TOKEN IN DATABASE
  await RefreshToken.create({
    tokenId: newTokenId,
    userId,
    expiresAt,
    revoked: false,
  });
  // SETTING NEW ACCESS TOKEN IN HTTP-ONLY COOKIE
  const accessTokenExpiresIn = process.env.AT_EXPIRES_IN || "15m";
  // CALCULATING ACCESS TOKEN MAX AGE
  const accessTokenMaxAge = accessTokenExpiresIn.includes("m")
    ? parseInt(accessTokenExpiresIn) * 60 * 1000
    : 15 * 60 * 1000; // Default 15 minutes
  // SETTING NEW ACCESS TOKEN IN HTTP-ONLY COOKIE
  res.cookie("accessToken", newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: accessTokenMaxAge,
  });
  // SETTING NEW REFRESH TOKEN IN HTTP-ONLY COOKIE
  const refreshTokenMaxAge = expiresInDays * 24 * 60 * 60 * 1000;
  // SETTING NEW REFRESH TOKEN IN HTTP-ONLY COOKIE
  res.cookie("refreshToken", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: refreshTokenMaxAge,
  });
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Token refreshed successfully!",
    success: true,
  });
  return;
});

/**
 * USER LOGOUT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== USER LOGOUT ==>
export const logout = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST (IF AUTHENTICATED)
  const userId = (req as any).id;
  // IF USER ID EXISTS, DELETE ALL REFRESH TOKENS FOR THIS USER
  if (userId) {
    await RefreshToken.deleteMany({ userId }).exec();
  }
  // CLEARING ACCESS TOKEN COOKIE
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  // CLEARING REFRESH TOKEN COOKIE
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Logout successful!",
    success: true,
  });
  return;
});

/**
 * OAUTH CALLBACK HANDLER
 * HANDLES OAUTH CALLBACK AFTER SUCCESSFUL AUTHENTICATION
 * GENERATES TOKENS AND REDIRECTS TO FRONTEND
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== OAUTH CALLBACK HANDLER ==>
export const oauthCallback = expressAsyncHandler(async (req, res) => {
  // GET USER FROM REQUEST (SET BY PASSPORT)
  const user = (req as any).user;
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    res.status(401).json({
      message: "OAuth authentication failed!",
      success: false,
    });
    return;
  }
  // GET USER ID (HANDLE BOTH OBJECTID AND STRING)
  const userId = user._id?.toString() || user._id || user.id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "OAuth authentication failed!",
      success: false,
    });
    return;
  }
  // CLEANING UP ALL EXISTING REFRESH TOKENS (ALL TOKENS - REVOKED, EXPIRED, OR ACTIVE)
  await RefreshToken.deleteMany({ userId }).exec();
  // GENERATING UNIQUE TOKEN ID FOR DATABASE STORAGE
  const tokenId = crypto.randomUUID();
  // GENERATING ACCESS TOKEN
  const accessToken = generateToken(userId);
  // GENERATING REFRESH TOKEN WITH TOKEN ID
  const refreshToken = generateRefreshToken(userId, tokenId);
  // CALCULATING REFRESH TOKEN EXPIRATION DATE
  const expiresIn = process.env.RT_EXPIRES_IN || "30d";
  // CALCULATING EXPIRATION DAYS
  const expiresInDays = expiresIn.includes("d") ? parseInt(expiresIn) : 30;
  // CALCULATING EXPIRATION DATE
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  // STORING REFRESH TOKEN IN DATABASE
  await RefreshToken.create({
    tokenId,
    userId,
    expiresAt,
    revoked: false,
  });
  // SETTING ACCESS TOKEN IN HTTP-ONLY COOKIE
  const accessTokenExpiresIn = process.env.AT_EXPIRES_IN || "15m";
  // CALCULATING ACCESS TOKEN MAX AGE
  const accessTokenMaxAge = accessTokenExpiresIn.includes("m")
    ? parseInt(accessTokenExpiresIn) * 60 * 1000
    : 15 * 60 * 1000; // Default 15 minutes
  // SETTING ACCESS TOKEN IN HTTP-ONLY COOKIE
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: accessTokenMaxAge,
  });
  // SETTING REFRESH TOKEN IN HTTP-ONLY COOKIE
  const refreshTokenMaxAge = expiresInDays * 24 * 60 * 60 * 1000;
  // SETTING REFRESH TOKEN IN HTTP-ONLY COOKIE
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: refreshTokenMaxAge,
  });
  // REDIRECT TO FRONTEND WITH SUCCESS
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // REDIRECTING TO FRONTEND WITH SUCCESS
  res.redirect(`${frontendUrl}/dashboard?oauth=success`);
  return;
});

/**
 * GET CURRENT USER
 * RETURNS CURRENT USER BASED ON ACCESS TOKEN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET CURRENT USER ==>
export const getCurrentUser = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as any).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // FIND USER BY ID
  const user = await User.findById(userId).select("-password").lean().exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    return;
  }
  // RETURN USER DATA
  res.status(200).json({
    message: "User retrieved successfully!",
    success: true,
    data: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  });
  return;
});

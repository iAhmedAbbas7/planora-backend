// <== IMPORTS ==>
import {
  sendVerificationEmail,
  sendEmailVerificationConfirmation,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangeConfirmation,
} from "../utils/mailer.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";
import { PendingUser } from "../models/pendingUser.model.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import { PasswordReset } from "../models/passwordReset.model.js";
import passport from "../config/passport.js";
import { Request, Response, NextFunction } from "express";

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
  const { name, email, password, acceptedTerms } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!name || !email || !password) {
    res.status(400).json({
      message: "Name, Email, and Password are Required!",
      success: false,
    });
    return;
  }
  // VALIDATING TERMS ACCEPTANCE
  if (!acceptedTerms || acceptedTerms !== true) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "You must accept the Terms & Conditions to create an account!",
      success: false,
    });
    return;
  }
  // VALIDATING EMAIL FORMAT (IMPROVED VALIDATION)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
  if (!emailRegex.test(email)) {
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    return;
  }
  // VALIDATING PASSWORD STRENGTH (8+ CHARACTERS, UPPERCASE, LOWERCASE, DIGIT, SPECIAL)
  if (password.length < 8) {
    res.status(400).json({
      message: "Password must be at least 8 characters long!",
      success: false,
    });
    return;
  }
  // CHECK FOR UPPERCASE LETTER
  if (!/[A-Z]/.test(password)) {
    res.status(400).json({
      message: "Password must contain at least one uppercase letter!",
      success: false,
    });
    return;
  }
  // CHECK FOR LOWERCASE LETTER
  if (!/[a-z]/.test(password)) {
    res.status(400).json({
      message: "Password must contain at least one lowercase letter!",
      success: false,
    });
    return;
  }
  // CHECK FOR DIGIT
  if (!/[0-9]/.test(password)) {
    res.status(400).json({
      message: "Password must contain at least one digit!",
      success: false,
    });
    return;
  }
  // CHECK FOR SPECIAL CHARACTER
  if (!/[^A-Za-z0-9]/.test(password)) {
    res.status(400).json({
      message: "Password must contain at least one special character!",
      success: false,
    });
    return;
  }
  // CHECKING IF USER ALREADY EXISTS (VERIFIED USER)
  const existingUser = await User.findOne({ email }).lean().exec();
  // IF USER ALREADY EXISTS, RETURN 409 ERROR
  if (existingUser) {
    res.status(409).json({
      message: "User with this email already exists!",
      success: false,
    });
    return;
  }
  // CHECKING IF PENDING USER EXISTS
  const existingPendingUser = await PendingUser.findOne({ email }).exec();
  // IF PENDING USER EXISTS, DELETE IT (TO ALLOW RE-SIGNUP WITH NEW CODE)
  if (existingPendingUser) {
    // DELETING EXISTING PENDING USER
    await existingPendingUser.deleteOne().exec();
  }
  // HASHING PASSWORD
  const hashedPassword = await bcrypt.hash(password, 10);
  // GENERATING 6-DIGIT VERIFICATION CODE
  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();
  // CALCULATING EXPIRY TIME (2 MINUTES FROM NOW)
  const verificationCodeExpiresAt = new Date();
  // SETTING EXPIRY TIME TO 2 MINUTES
  verificationCodeExpiresAt.setMinutes(
    verificationCodeExpiresAt.getMinutes() + 2
  );
  // CREATING PENDING USER
  const pendingUser = await PendingUser.create({
    name,
    email,
    password: hashedPassword,
    verificationCode,
    verificationCodeExpiresAt,
    resendAttempts: 0,
    lastResendAt: new Date(),
  });
  // SENDING VERIFICATION EMAIL
  try {
    await sendVerificationEmail(pendingUser.email, verificationCode, name);
  } catch (error) {
    // DELETING PENDING USER IF EMAIL SENDING FAILS
    await pendingUser.deleteOne().exec();
    // LOGGING ERROR
    console.error("Error sending verification email:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again later.",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE (NO SENSITIVE DATA)
  res.status(201).json({
    message: "Verification code sent to your email! Please check your inbox.",
    success: true,
    data: {
      email: pendingUser.email,
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
  // GETTING USER ID FROM DECODED TOKEN
  const userId = decodedToken.userId;
  // GETTING TOKEN ID FROM DECODED TOKEN
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
  // CALCULATING EXPIRATION DAYS
  const expiresInDays = expiresIn.includes("d") ? parseInt(expiresIn) : 30;
  // CALCULATING EXPIRATION DATE
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
 * GOOGLE OAUTH CALLBACK MIDDLEWARE
 * HANDLES GOOGLE OAUTH AUTHENTICATION AND ERROR HANDLING
 * @param req - Request Object
 * @param res - Response Object
 * @param next - Next Function
 * @returns Response Object or Next Function
 */
// <== GOOGLE OAUTH CALLBACK MIDDLEWARE ==>
export const googleOAuthCallback = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  passport.authenticate(
    "google",
    (err: Error | null, user: any, _info: any) => {
      // IF ERROR OCCURRED, RETURN ERROR RESPONSE
      if (err) {
        // EXTRACT ERROR MESSAGE
        const errorMessage = err.message || "OAuth authentication failed";
        // ENCODING ERROR MESSAGE
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        // ENCODING ERROR MESSAGE
        const encodedMessage = encodeURIComponent(errorMessage);
        // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
        res.redirect(
          `${frontendUrl}/login?error=oauth_failed&message=${encodedMessage}`
        );
        return;
      }
      // IF USER NOT FOUND, RETURN ERROR RESPONSE
      if (!user) {
        // NO USER RETURNED
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
        res.redirect(`${frontendUrl}/login?error=oauth_failed`);
        // RETURNING
        return;
      }
      // USER FOUND - CONTINUE TO OAUTH CALLBACK
      (req as any).user = user;
      // CONTINUING TO OAUTH CALLBACK
      next();
    }
  )(req, res, next);
};

/**
 * GITHUB OAUTH CALLBACK MIDDLEWARE
 * HANDLES GITHUB OAUTH AUTHENTICATION AND ERROR HANDLING
 * @param req - Request Object
 * @param res - Response Object
 * @param next - Next Function
 * @returns Response Object or Next Function
 */
// <== GITHUB OAUTH CALLBACK MIDDLEWARE ==>
export const githubOAuthCallback = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  passport.authenticate(
    "github",
    (err: Error | null, user: any, _info: any) => {
      // IF ERROR OCCURRED, RETURN ERROR RESPONSE
      if (err) {
        // EXTRACT ERROR MESSAGE
        const errorMessage = err.message || "OAuth authentication failed";
        // ENCODING ERROR MESSAGE
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        // ENCODING ERROR MESSAGE
        const encodedMessage = encodeURIComponent(errorMessage);
        // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
        res.redirect(
          `${frontendUrl}/login?error=oauth_failed&message=${encodedMessage}`
        );
        return;
      }
      // IF USER NOT FOUND, RETURN ERROR RESPONSE
      if (!user) {
        // NO USER RETURNED
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
        res.redirect(`${frontendUrl}/login?error=oauth_failed`);
        // RETURNING
        return;
      }
      // USER FOUND - CONTINUING TO OAUTH CALLBACK
      (req as any).user = user;
      next();
    }
  )(req, res, next);
};

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
  // CHECK IF USER IS NEW (CREATED WITHIN LAST 10 SECONDS) AND SEND WELCOME EMAIL
  try {
    // FETCH USER FROM DATABASE TO GET CREATED AT TIMESTAMP
    const dbUser = await User.findById(userId).lean().exec();
    // IF USER FOUND, CHECK IF USER WAS CREATED WITHIN LAST 10 SECONDS (NEW USER)
    if (dbUser) {
      // CHECK IF USER WAS CREATED WITHIN LAST 10 SECONDS (NEW USER)
      const userCreatedAt = new Date(dbUser.createdAt || Date.now());
      // CHECK IF USER WAS CREATED WITHIN LAST 10 SECONDS (NEW USER)
      const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
      // CHECK IF USER WAS CREATED WITHIN LAST 10 SECONDS (NEW USER)
      const isNewUser = userCreatedAt > tenSecondsAgo;
      // IF NEW USER, SEND WELCOME EMAIL
      if (isNewUser) {
        // SEND WELCOME EMAIL (DON'T AWAIT - SEND IN BACKGROUND)
        sendWelcomeEmail(dbUser.email, dbUser.name).catch((error) => {
          // LOG ERROR BUT DON'T FAIL THE REQUEST
          console.error("Error sending welcome email to OAuth user:", error);
        });
      }
    }
  } catch (error) {
    // LOG ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error checking if user is new for welcome email:", error);
  }
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

/**
 * VERIFY EMAIL WITH CODE
 * VERIFIES THE EMAIL CODE AND COMPLETES USER SIGNUP
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== VERIFY EMAIL ==>
export const verifyEmail = expressAsyncHandler(async (req, res) => {
  // GETTING EMAIL AND CODE FROM REQUEST BODY
  const { email, code } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email || !code) {
    res.status(400).json({
      message: "Email and Verification Code are Required!",
      success: false,
    });
    return;
  }
  // VALIDATING CODE FORMAT (6 DIGITS)
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({
      message: "Verification code must be 6 digits!",
      success: false,
    });
    return;
  }
  // FINDING PENDING USER BY EMAIL AND CODE
  const pendingUser = await PendingUser.findOne({
    email: email.toLowerCase().trim(),
    verificationCode: code,
  }).exec();
  // IF PENDING USER NOT FOUND, RETURN ERROR
  if (!pendingUser) {
    res.status(400).json({
      message: "Invalid email or verification code!",
      success: false,
    });
    return;
  }
  // CHECKING IF CODE HAS EXPIRED
  if (pendingUser.verificationCodeExpiresAt < new Date()) {
    // DELETE EXPIRED PENDING USER
    await pendingUser.deleteOne();
    res.status(400).json({
      message: "Verification code has expired! Please request a new one.",
      success: false,
    });
    return;
  }
  // CHECKING IF USER ALREADY EXISTS (RACE CONDITION CHECK)
  const existingUser = await User.findOne({ email: pendingUser.email })
    .lean()
    .exec();
  if (existingUser) {
    // DELETE PENDING USER IF USER ALREADY EXISTS
    await pendingUser.deleteOne();
    res.status(409).json({
      message: "User with this email already exists!",
      success: false,
    });
    return;
  }
  // CREATING VERIFIED USER
  const newUser = await User.create({
    name: pendingUser.name,
    email: pendingUser.email,
    password: pendingUser.password,
  });
  // CLEANING UP ANY EXISTING REFRESH TOKENS
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
    : 15 * 60 * 1000;
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
  // SENDING EMAIL VERIFICATION CONFIRMATION (BEFORE WELCOME EMAIL)
  try {
    // SENDING EMAIL VERIFICATION CONFIRMATION
    await sendEmailVerificationConfirmation(newUser.email, newUser.name);
  } catch (error) {
    // LOG ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending email verification confirmation:", error);
  }
  // SENDING WELCOME EMAIL (AFTER VERIFICATION CONFIRMATION)
  try {
    // SENDING WELCOME EMAIL
    await sendWelcomeEmail(newUser.email, newUser.name);
  } catch (error) {
    // LOG ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending welcome email:", error);
  }
  // DELETING PENDING USER (VERIFICATION COMPLETE)
  await pendingUser.deleteOne();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Email verified successfully! Welcome to PlanOra!",
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
 * RESEND VERIFICATION CODE
 * RESENDS VERIFICATION CODE TO USER'S EMAIL WITH RATE LIMITING
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RESEND VERIFICATION CODE ==>
export const resendVerificationCode = expressAsyncHandler(async (req, res) => {
  // GETTING EMAIL FROM REQUEST BODY
  const { email } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email) {
    res.status(400).json({
      message: "Email is Required!",
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
  // FINDING PENDING USER BY EMAIL
  const pendingUser = await PendingUser.findOne({
    email: email.toLowerCase().trim(),
  }).exec();
  // IF PENDING USER NOT FOUND, RETURN ERROR
  if (!pendingUser) {
    res.status(404).json({
      message: "No pending verification found for this email!",
      success: false,
    });
    return;
  }
  // RATE LIMITING: CHECK IF USER HAS EXCEEDED RESEND LIMIT (MAX 3 RESENDS PER 5 MINUTES)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (
    pendingUser.lastResendAt > fiveMinutesAgo &&
    pendingUser.resendAttempts >= 3
  ) {
    res.status(429).json({
      message:
        "Too many resend attempts! Please wait 5 minutes before requesting again.",
      success: false,
    });
    return;
  }
  // RESET RESEND ATTEMPTS IF 5 MINUTES HAVE PASSED
  if (pendingUser.lastResendAt <= fiveMinutesAgo) {
    // RESETING RESEND ATTEMPTS
    pendingUser.resendAttempts = 0;
  }
  // GENERATING NEW 6-DIGIT VERIFICATION CODE
  const newVerificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();
  // CALCULATING NEW EXPIRATION DATE (2 MINUTES FROM NOW)
  const newExpiry = new Date();
  // SETTING EXPIRATION DATE
  newExpiry.setMinutes(newExpiry.getMinutes() + 2);
  // UPDATING PENDING USER WITH NEW CODE AND EXPIRATION DATE
  pendingUser.verificationCode = newVerificationCode;
  // SETTING NEW EXPIRATION DATE
  pendingUser.verificationCodeExpiresAt = newExpiry;
  // INCREMENTING RESEND ATTEMPTS
  pendingUser.resendAttempts += 1;
  // SETTING LAST RESEND TIMESTAMP
  pendingUser.lastResendAt = new Date();
  // SAVING PENDING USER
  await pendingUser.save();
  // SENDING NEW VERIFICATION EMAIL
  try {
    // SENDING NEW VERIFICATION EMAIL
    await sendVerificationEmail(
      pendingUser.email,
      newVerificationCode,
      pendingUser.name
    );
  } catch (error) {
    // LOGGING ERROR
    console.error("Error sending verification email:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again later.",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Verification code resent successfully! Please check your inbox.",
    success: true,
  });
  return;
});

/**
 * REQUEST PASSWORD RESET
 * SENDS PASSWORD RESET CODE TO USER'S EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REQUEST PASSWORD RESET ==>
export const requestPasswordReset = expressAsyncHandler(async (req, res) => {
  // GETTING EMAIL FROM REQUEST BODY
  const { email } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email) {
    res.status(400).json({
      message: "Email is required!",
      success: false,
    });
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN ERROR RESPONSE
  if (!emailRegex.test(email)) {
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    return;
  }
  // FINDING USER BY EMAIL
  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .lean()
    .exec();
  // IF USER NOT FOUND, STILL RETURN SUCCESS (SECURITY: DON'T REVEAL IF EMAIL EXISTS)
  if (!user) {
    // RETURN SUCCESS TO PREVENT EMAIL ENUMERATION
    res.status(200).json({
      message:
        "If an account exists with this email, a password reset code has been sent.",
      success: true,
    });
    return;
  }
  // CHECKING IF PASSWORD RESET REQUEST ALREADY EXISTS
  const existingReset = await PasswordReset.findOne({
    email: email.toLowerCase().trim(),
  }).exec();
  // RATE LIMITING: CHECK IF USER HAS EXCEEDED RESEND LIMIT (MAX 3 REQUESTS PER 5 MINUTES)
  if (existingReset) {
    // CALCULATING 5 MINUTES AGO
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    // CHECK IF USER HAS EXCEEDED RESEND LIMIT
    if (
      existingReset.lastResendAt > fiveMinutesAgo &&
      existingReset.resendAttempts >= 3
    ) {
      // RETURN ERROR RESPONSE
      res.status(429).json({
        message:
          "Too many reset requests! Please wait 5 minutes before requesting again.",
        success: false,
      });
      return;
    }
    // RESET RESEND ATTEMPTS IF 5 MINUTES HAVE PASSED
    if (existingReset.lastResendAt <= fiveMinutesAgo) {
      // RESET RESEND ATTEMPTS
      existingReset.resendAttempts = 0;
    }
    // DELETE EXISTING RESET REQUEST TO CREATE NEW ONE
    await existingReset.deleteOne().exec();
  }
  // GENERATING 6-DIGIT RESET CODE
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  // CALCULATING EXPIRY TIME (2 MINUTES FROM NOW)
  const resetCodeExpiresAt = new Date();
  // SETTING EXPIRY TIME TO 2 MINUTES
  resetCodeExpiresAt.setMinutes(resetCodeExpiresAt.getMinutes() + 2);
  // CREATING PASSWORD RESET REQUEST
  const passwordReset = await PasswordReset.create({
    email: email.toLowerCase().trim(),
    resetCode,
    resetCodeExpiresAt,
    resendAttempts: existingReset ? existingReset.resendAttempts + 1 : 1,
    lastResendAt: new Date(),
    verificationAttempts: 0,
    lastVerificationAttemptAt: new Date(),
    used: false,
  });
  // SENDING PASSWORD RESET EMAIL
  try {
    // SENDING PASSWORD RESET EMAIL
    await sendPasswordResetEmail(user.email, resetCode, user.name);
  } catch (error) {
    // DELETING PASSWORD RESET REQUEST IF EMAIL SENDING FAILS
    await passwordReset.deleteOne().exec();
    // LOGGING ERROR
    console.error("Error sending password reset email:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send password reset email. Please try again later.",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE (SECURITY: DON'T REVEAL IF EMAIL EXISTS)
  res.status(200).json({
    message:
      "If an account exists with this email, a password reset code has been sent.",
    success: true,
  });
  return;
});

/**
 * RESET PASSWORD
 * VERIFIES RESET CODE AND UPDATES USER PASSWORD
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RESET PASSWORD ==>
export const resetPassword = expressAsyncHandler(async (req, res) => {
  // GETTING DATA FROM REQUEST BODY
  const { email, code, newPassword } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email || !code || !newPassword) {
    res.status(400).json({
      message: "Email, code, and new password are required!",
      success: false,
    });
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL IS NOT VALID, RETURN ERROR
  if (!emailRegex.test(email)) {
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    return;
  }
  // VALIDATING CODE FORMAT (6 DIGITS)
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({
      message: "Reset code must be 6 digits!",
      success: false,
    });
    return;
  }
  // VALIDATING PASSWORD STRENGTH (8+ CHARACTERS, UPPERCASE, LOWERCASE, DIGIT, SPECIAL)
  if (newPassword.length < 8) {
    res.status(400).json({
      message: "Password must be at least 8 characters long!",
      success: false,
    });
    return;
  }
  // CHECK FOR UPPERCASE LETTER
  if (!/[A-Z]/.test(newPassword)) {
    res.status(400).json({
      message: "Password must contain at least one uppercase letter!",
      success: false,
    });
    return;
  }
  // CHECK FOR LOWERCASE LETTER
  if (!/[a-z]/.test(newPassword)) {
    res.status(400).json({
      message: "Password must contain at least one lowercase letter!",
      success: false,
    });
    return;
  }
  // CHECK FOR DIGIT
  if (!/[0-9]/.test(newPassword)) {
    res.status(400).json({
      message: "Password must contain at least one digit!",
      success: false,
    });
    return;
  }
  // CHECK FOR SPECIAL CHARACTER
  if (!/[^A-Za-z0-9]/.test(newPassword)) {
    res.status(400).json({
      message: "Password must contain at least one special character!",
      success: false,
    });
    return;
  }
  // FINDING PASSWORD RESET REQUEST
  const passwordReset = await PasswordReset.findOne({
    email: email.toLowerCase().trim(),
  }).exec();
  // IF PASSWORD RESET REQUEST NOT FOUND, RETURN ERROR
  if (!passwordReset) {
    res.status(404).json({
      message:
        "No password reset request found for this email. Please request a new code.",
      success: false,
    });
    return;
  }
  // CHECK IF CODE HAS BEEN USED
  if (passwordReset.used) {
    res.status(400).json({
      message:
        "This reset code has already been used. Please request a new code.",
      success: false,
    });
    return;
  }
  // CHECK IF CODE HAS EXPIRED
  if (passwordReset.resetCodeExpiresAt < new Date()) {
    // DELETE EXPIRED RESET REQUEST
    await passwordReset.deleteOne().exec();
    // RETURN ERROR RESPONSE
    res.status(400).json({
      message: "Reset code has expired! Please request a new code.",
      success: false,
    });
    return;
  }
  // RATE LIMITING: CHECK VERIFICATION ATTEMPTS (MAX 5 ATTEMPTS PER 15 MINUTES)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (
    passwordReset.lastVerificationAttemptAt > fifteenMinutesAgo &&
    passwordReset.verificationAttempts >= 5
  ) {
    // RETURN ERROR RESPONSE
    res.status(429).json({
      message:
        "Too many verification attempts! Please wait 15 minutes before trying again.",
      success: false,
    });
    return;
  }
  // RESET VERIFICATION ATTEMPTS IF 15 MINUTES HAVE PASSED
  if (passwordReset.lastVerificationAttemptAt <= fifteenMinutesAgo) {
    // RESET VERIFICATION ATTEMPTS
    passwordReset.verificationAttempts = 0;
  }
  // INCREMENT VERIFICATION ATTEMPTS
  passwordReset.verificationAttempts += 1;
  // SET LAST VERIFICATION ATTEMPT TIMESTAMP
  passwordReset.lastVerificationAttemptAt = new Date();
  // SAVING PASSWORD RESET REQUEST
  await passwordReset.save();
  // CHECK IF CODE MATCHES
  if (passwordReset.resetCode !== code) {
    res.status(400).json({
      message: "Invalid reset code! Please check and try again.",
      success: false,
    });
    return;
  }
  // FINDING USER BY EMAIL
  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select("+password")
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    // DELETE PASSWORD RESET REQUEST
    await passwordReset.deleteOne().exec();
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    return;
  }
  // CHECK IF NEW PASSWORD IS SAME AS CURRENT PASSWORD
  const isSamePassword = await bcrypt.compare(newPassword, user.password || "");
  // IF NEW PASSWORD IS SAME AS CURRENT PASSWORD, RETURN ERROR RESPONSE
  if (isSamePassword) {
    res.status(400).json({
      message: "New password must be different from your current password!",
      success: false,
    });
    return;
  }
  // HASHING NEW PASSWORD
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  // UPDATING USER PASSWORD
  user.password = hashedPassword;
  // SAVING USER
  await user.save();
  // MARKING RESET CODE AS USED
  passwordReset.used = true;
  // SAVING PASSWORD RESET REQUEST
  await passwordReset.save();
  // SENDING PASSWORD CHANGE CONFIRMATION EMAIL
  try {
    await sendPasswordChangeConfirmation(user.email, user.name, new Date());
  } catch (error) {
    // LOG ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending password change confirmation email:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message:
      "Password reset successfully! Please login with your new password.",
    success: true,
  });
  return;
});

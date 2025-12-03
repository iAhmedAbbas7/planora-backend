// <== IMPORTS ==>
import {
  sendVerificationEmail,
  sendEmailVerificationConfirmation,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangeConfirmation,
  sendAccountReactivated,
  sendPasswordResetRecoveryEmail,
  sendAccountRecoveryCode,
} from "../utils/mailer.js";
import axios from "axios";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import speakeasy from "speakeasy";
import { Octokit } from "@octokit/rest";
import passport from "../config/passport.js";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import expressAsyncHandler from "express-async-handler";
import { verifyBackupCode } from "../utils/encryption.js";
import { Request, Response, NextFunction } from "express";
import { createSession } from "../utils/sessionManager.js";
import { PendingUser } from "../models/pendingUser.model.js";
import { getLocationFromIp } from "../utils/ipGeolocation.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import { PasswordReset } from "../models/passwordReset.model.js";
import { AccountRecovery } from "../models/accountRecovery.model.js";
import { decryptSecret, encryptSecret } from "../utils/encryption.js";
import { extractDeviceInfo, getIpAddress } from "../utils/deviceFingerprint.js";

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
  const { name, email, password, acceptedTerms, phoneNumber } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!name || !email || !password) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Name, Email, and Password are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING TERMS ACCEPTANCE
  if (!acceptedTerms || acceptedTerms !== true) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "You must accept the Terms & Conditions to create an account!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING EMAIL FORMAT (IMPROVED VALIDATION)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
  if (!emailRegex.test(email)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING PASSWORD STRENGTH (8+ CHARACTERS, UPPERCASE, LOWERCASE, DIGIT, SPECIAL)
  if (password.length < 8) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must be at least 8 characters long!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR UPPERCASE LETTER
  if (!/[A-Z]/.test(password)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one uppercase letter!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR LOWERCASE LETTER
  if (!/[a-z]/.test(password)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one lowercase letter!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR DIGIT
  if (!/[0-9]/.test(password)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one digit!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR SPECIAL CHARACTER
  if (!/[^A-Za-z0-9]/.test(password)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one special character!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING PHONE NUMBER IF PROVIDED
  let formattedPhoneNumber: string | null = null;
  // IF PHONE NUMBER IS PROVIDED
  if (phoneNumber) {
    // TRIM PHONE NUMBER
    const trimmedPhone = phoneNumber.trim();
    // VALIDATE PHONE NUMBER FORMAT
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    // IF PHONE NUMBER FORMAT IS INVALID, RETURN 400 ERROR
    if (!phoneRegex.test(trimmedPhone)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Please provide a valid phone number with country code (e.g., +1234567890)!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // SET FORMATTED PHONE NUMBER
    formattedPhoneNumber = trimmedPhone;
    // CHECK IF PHONE NUMBER ALREADY EXISTS
    const existingUserWithPhone = await User.findOne({
      phoneNumber: formattedPhoneNumber,
    })
      .lean()
      .exec();
    // IF PHONE NUMBER ALREADY EXISTS, RETURN 409 ERROR
    if (existingUserWithPhone) {
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "User with this phone number already exists!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
  // CHECKING IF USER ALREADY EXISTS (VERIFIED USER)
  const existingUser = await User.findOne({ email }).lean().exec();
  // IF USER ALREADY EXISTS, RETURN 409 ERROR
  if (existingUser) {
    // RETURNING ERROR RESPONSE
    res.status(409).json({
      message: "User with this email already exists!",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
    phoneNumber: formattedPhoneNumber,
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
    // RETURNING FROM FUNCTION
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
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Email and Password are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING USER BY EMAIL WITH PASSWORD FIELD
  const user = await User.findOne({ email }).select("+password").lean().exec();
  // IF USER NOT FOUND, RETURN 401 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // COMPARING PASSWORD
  const isMatch = await bcrypt.compare(password, user.password || "");
  // IF PASSWORD DOES NOT MATCH, RETURN 401 ERROR
  if (!isMatch) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER IS FLAGGED FOR DELETION
  let accountReactivated = false;
  // IF USER IS FLAGGED FOR DELETION
  if (user.flaggedForDeletion && user.flaggedAt) {
    // CALCULATING DAYS SINCE FLAGGED
    const daysSinceFlagged = Math.floor(
      (new Date().getTime() - new Date(user.flaggedAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    // IF WITHIN 30 DAYS, REACTIVATE ACCOUNT
    if (daysSinceFlagged < 30) {
      // FINDING USER DOCUMENT TO UPDATE
      const userDoc = await User.findById(user._id).exec();
      // IF USER DOCUMENT FOUND
      if (userDoc) {
        // REACTIVATING ACCOUNT
        userDoc.flaggedForDeletion = false;
        // SETTING FLAGGED AT TO NULL
        userDoc.flaggedAt = null as unknown as Date;
        // SAVING USER DOCUMENT
        await userDoc.save();
        // SETTING ACCOUNT REACTIVATED TO TRUE
        accountReactivated = true;
        // SENDING REACTIVATION EMAIL
        try {
          // SENDING REACTIVATION EMAIL
          await sendAccountReactivated(userDoc.email, userDoc.name, new Date());
        } catch (error) {
          // LOGGING ERROR
          console.error("Error sending account reactivation email:", error);
        }
      }
    } else {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "Your account has been permanently deleted. Please contact support if you believe this is an error.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
  // CHECK IF USER HAS PREVIOUS SESSIONS (ACTIVE OR REVOKED)
  const hasPreviousSessions = await Session.countDocuments({
    userId: user._id,
    expiresAt: { $gt: new Date() },
  }).exec();
  // IF USER HAS PREVIOUS SESSIONS, CHECK DEVICE MATCHING
  if (hasPreviousSessions > 0) {
    // EXTRACT DEVICE INFO FROM REQUEST
    const deviceInfo = extractDeviceInfo(req);
    // GET IP ADDRESS FROM REQUEST
    const ipAddress = getIpAddress(req);
    // GET LOCATION INFO FROM IP
    const locationInfo = await getLocationFromIp(ipAddress);
    // FIND ALL PREVIOUS SESSIONS (ACTIVE AND REVOKED)
    const allSessions = await Session.find({
      userId: user._id,
      expiresAt: { $gt: new Date() },
    })
      .lean()
      .exec();
    // CHECK IF THIS IS THE SAME DEVICE AS ANY PREVIOUS SESSION
    const isSameDevice = allSessions.some((session) => {
      // CHECK IF THE DEVICE IS THE SAME BY CHECKING THE DEVICE FINGERPRINT (BROWSER, OS, DEVICE TYPE)
      const deviceMatch =
        session.browserName === deviceInfo.browserName &&
        session.operatingSystem === deviceInfo.operatingSystem &&
        session.deviceType === deviceInfo.deviceType;
      // CHECK IF THE IP ADDRESS IS THE SAME
      const ipMatch = session.ipAddress === ipAddress;
      // CHECK IF THE LOCATION IS THE SAME
      const locationMatch =
        session.locationCountry === (locationInfo?.country || "Unknown") &&
        session.locationCity === (locationInfo?.city || "Unknown");
      // RETURN TRUE IF THE DEVICE IS THE SAME
      return deviceMatch && (ipMatch || locationMatch);
    });
    // CHECK IF THERE ARE ACTIVE SESSIONS FROM OTHER DEVICES
    const hasActiveOtherDevices = await Session.countDocuments({
      userId: user._id,
      revoked: false,
      expiresAt: { $gt: new Date() },
      $or: [
        { browserName: { $ne: deviceInfo.browserName } },
        { operatingSystem: { $ne: deviceInfo.operatingSystem } },
        { deviceType: { $ne: deviceInfo.deviceType } },
      ],
    }).exec();
    // CHECK IF SAME DEVICE WAS PREVIOUSLY TRUSTED
    const wasDeviceTrusted = allSessions.some((session) => {
      const deviceMatch =
        session.browserName === deviceInfo.browserName &&
        session.operatingSystem === deviceInfo.operatingSystem &&
        session.deviceType === deviceInfo.deviceType;
      const ipMatch = session.ipAddress === ipAddress;
      const locationMatch =
        session.locationCountry === (locationInfo?.country || "Unknown") &&
        session.locationCity === (locationInfo?.city || "Unknown");
      return (
        deviceMatch && (ipMatch || locationMatch) && session.isTrusted === true
      );
    });
    // REQUIRE DEVICE VERIFICATION IF THE DEVICE IS NOT THE SAME, THERE ARE ACTIVE SESSIONS FROM OTHER DEVICES, OR THE DEVICE IS NOT PREVIOUSLY TRUSTED
    if (!isSameDevice || hasActiveOtherDevices > 0 || !wasDeviceTrusted) {
      // RETURNING RESPONSE REQUIRING DEVICE VERIFICATION
      res.status(200).json({
        message:
          "Device verification required. Please verify your device to continue.",
        success: true,
        requiresDeviceVerification: true,
        requires2FA: user.isTwoFactorEnabled || false,
        data: {
          email: user.email,
          deviceInfo: {
            deviceType: deviceInfo.deviceType,
            deviceName: deviceInfo.deviceName,
            browserName: deviceInfo.browserName,
            operatingSystem: deviceInfo.operatingSystem,
            location: {
              country: locationInfo?.country || "Unknown",
              city: locationInfo?.city || "Unknown",
              region: locationInfo?.region || "Unknown",
            },
          },
        },
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
  }
  // CHECK IF 2FA IS ENABLED
  if (user.isTwoFactorEnabled) {
    // RETURNING RESPONSE REQUIRING 2FA
    res.status(200).json({
      message:
        "Two-Factor Authentication required. Please enter your 2FA code.",
      success: true,
      requires2FA: true,
      data: {
        email: user.email,
      },
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // EXTRACT DEVICE INFO FROM REQUEST
  const deviceInfo = extractDeviceInfo(req);
  // GET IP ADDRESS FROM REQUEST
  const ipAddress = getIpAddress(req);
  // GET LOCATION INFO FROM IP ADDRESS
  const locationInfo = await getLocationFromIp(ipAddress);
  // CREATE SESSION
  const session = await createSession(
    user._id,
    deviceInfo,
    ipAddress,
    locationInfo || {
      country: "Unknown",
      city: "Unknown",
      region: "Unknown",
      countryCode: "XX",
    },
    true,
    false,
    false,
    ""
  );
  // CLEAN UP REFRESH TOKENS FOR OTHER SESSIONS (NOT THE CURRENT ONE)
  await RefreshToken.deleteMany({
    userId: user._id,
    sessionId: { $ne: session._id },
  }).exec();
  // GENERATE UNIQUE TOKEN ID
  const tokenId = crypto.randomUUID();
  // GENERATE ACCESS TOKEN
  const accessToken = generateToken(user._id.toString());
  // GENERATE REFRESH TOKEN WITH TOKEN ID
  const refreshToken = generateRefreshToken(user._id.toString(), tokenId);
  // CALCULATING REFRESH TOKEN EXPIRATION DATE
  const expiresIn = process.env.RT_EXPIRES_IN || "30d";
  // CALCULATING EXPIRATION DAYS
  const expiresInDays = expiresIn.includes("d") ? parseInt(expiresIn) : 30;
  // CALCULATING EXPIRATION DATE
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  // STORE REFRESH TOKEN IN DATABASE WITH SESSION ID
  await RefreshToken.create({
    tokenId,
    userId: user._id,
    sessionId: session._id,
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
  // RETURNING RESPONSE (NO TOKENS IN BODY FOR SECURITY)
  res.status(200).json({
    message: accountReactivated
      ? "Login successful! Your account has been reactivated."
      : "Login successful!",
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      accountReactivated: accountReactivated,
    },
  });
  return;
});

/**
 * VERIFY 2FA AND COMPLETE LOGIN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== VERIFY 2FA AND COMPLETE LOGIN ==>
export const verify2FA = expressAsyncHandler(async (req, res) => {
  // GETTING DATA FROM REQUEST BODY
  const { email, password, token, backupCode } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email || !password) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Email and Password are Required!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // VALIDATING 2FA TOKEN OR CODE
  if (!token && !backupCode) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "TOTP token or backup code is required!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING USER BY EMAIL WITH PASSWORD AND TOTP SECRET
  const user = await User.findOne({ email })
    .select("+password +totpSecret")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN 401 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF 2FA IS ENABLED
  if (!user.isTwoFactorEnabled) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Two-Factor Authentication is not enabled for this account.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // COMPARING PASSWORD
  const isMatch = await bcrypt.compare(password, user.password || "");
  // IF PASSWORD DOES NOT MATCH, RETURN 401 ERROR
  if (!isMatch) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF USER IS FLAGGED FOR DELETION
  let accountReactivated = false;
  // IF USER IS FLAGGED FOR DELETION
  if (user.flaggedForDeletion && user.flaggedAt) {
    // CALCULATING DAYS SINCE FLAGGED
    const daysSinceFlagged = Math.floor(
      (new Date().getTime() - new Date(user.flaggedAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    // IF WITHIN 30 DAYS, REACTIVATE ACCOUNT
    if (daysSinceFlagged < 30) {
      // FINDING USER DOCUMENT TO UPDATE
      const userDoc = await User.findById(user._id).exec();
      // IF USER DOCUMENT FOUND
      if (userDoc) {
        // REACTIVATING ACCOUNT
        userDoc.flaggedForDeletion = false;
        // SETTING FLAGGED AT TO NULL
        userDoc.flaggedAt = null as unknown as Date;
        // SAVING USER DOCUMENT
        await userDoc.save();
        // SETTING ACCOUNT REACTIVATED TO TRUE
        accountReactivated = true;
        // SENDING REACTIVATION EMAIL
        try {
          // SENDING REACTIVATION EMAIL
          await sendAccountReactivated(userDoc.email, userDoc.name, new Date());
        } catch (error) {
          // LOGGING ERROR
          console.error("Error sending account reactivation email:", error);
        }
      }
    } else {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "Your account has been permanently deleted. Please contact support if you believe this is an error.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
  }
  // VERIFYING 2FA
  let twoFactorVerified = false;
  // IF TOTP TOKEN PROVIDED
  if (token) {
    // CHECK IF TOTP SECRET EXISTS
    if (!user.totpSecret) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "2FA is not properly configured for this account.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // DECRYPTING TOTP SECRET
    let decryptedSecret: string;
    try {
      // DECRYPTING TOTP SECRET
      decryptedSecret = decryptSecret(user.totpSecret);
    } catch (error) {
      // RETURNING ERROR RESPONSE
      res.status(500).json({
        message: "Error processing 2FA secret. Please contact support.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // VERIFYING TOTP TOKEN
    const verified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: "base32",
      token,
      window: 2,
    });
    // IF VERIFIED, SET FLAG
    if (verified) {
      // SETTING VERIFIED FLAG TO TRUE
      twoFactorVerified = true;
    }
  }
  // IF BACKUP CODE PROVIDED
  if (backupCode && !twoFactorVerified) {
    // FINDING USER WITH BACKUP CODES
    const userWithCodes = await User.findById(user._id).exec();
    // IF USER NOT FOUND
    if (!userWithCodes || !userWithCodes.backupCodes) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "No backup codes available for this account.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // FINDING UNUSED BACKUP CODE
    let backupCodeIndex = -1;
    // ITERATING THROUGH BACKUP CODES
    for (let i = 0; i < userWithCodes.backupCodes.length; i++) {
      // GETTING CODE OBJECT
      const codeObj = userWithCodes.backupCodes[i];
      // CHECKING IF CODE OBJECT EXISTS AND IS NOT USED
      if (codeObj && !codeObj.used && codeObj.code) {
        // VERIFYING BACKUP CODE
        const isValid = await verifyBackupCode(backupCode, codeObj.code);
        // IF BACKUP CODE IS VALID, SET BACKUP CODE INDEX
        if (isValid) {
          // SETTING BACKUP CODE INDEX
          backupCodeIndex = i;
          // BREAKING OUT OF LOOP
          break;
        }
      }
    }
    // IF BACKUP CODE NOT FOUND OR INVALID
    if (backupCodeIndex === -1) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Invalid or already used backup code.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // GETTING BACKUP CODE OBJECT AT INDEX
    const backupCodeObj = userWithCodes.backupCodes[backupCodeIndex];
    // CHECKING IF BACKUP CODE OBJECT EXISTS
    if (!backupCodeObj) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Backup code not found.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // MARKING BACKUP CODE AS USED
    backupCodeObj.used = true;
    // SETTING USED AT TO CURRENT DATE
    backupCodeObj.usedAt = new Date();
    // UPDATING USER
    await userWithCodes.save();
    // SETTING VERIFIED FLAG
    twoFactorVerified = true;
  }
  // IF 2FA NOT VERIFIED, RETURN ERROR
  if (!twoFactorVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid 2FA code. Please try again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // EXTRACT DEVICE INFO FROM REQUEST
  const deviceInfo = extractDeviceInfo(req);
  // GET IP ADDRESS FROM REQUEST
  const ipAddress = getIpAddress(req);
  // GET LOCATION INFO FROM IP
  const locationInfo = await getLocationFromIp(ipAddress);
  // CREATE SESSION FOR 2FA LOGIN
  const session = await createSession(
    user._id,
    deviceInfo,
    ipAddress,
    locationInfo || {
      country: "Unknown",
      city: "Unknown",
      region: "Unknown",
      countryCode: "XX",
    },
    true,
    false,
    false,
    ""
  );
  // CLEAN UP REFRESH TOKENS FOR OTHER SESSIONS (NOT THE CURRENT ONE)
  await RefreshToken.deleteMany({
    userId: user._id,
    sessionId: { $ne: session._id },
  }).exec();
  // GENERATE UNIQUE TOKEN ID
  const tokenId = crypto.randomUUID();
  // GENERATE ACCESS TOKEN
  const accessToken = generateToken(user._id.toString());
  // GENERATE REFRESH TOKEN WITH TOKEN ID
  const refreshToken = generateRefreshToken(user._id.toString(), tokenId);
  // CALCULATE REFRESH TOKEN EXPIRATION DATE
  const expiresIn = process.env.RT_EXPIRES_IN || "30d";
  // CALCULATE EXPIRATION DAYS
  const expiresInDays = expiresIn.includes("d") ? parseInt(expiresIn) : 30;
  // CALCULATE EXPIRATION DATE
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  // STORING REFRESH TOKEN IN DATABASE WITH SESSION ID
  await RefreshToken.create({
    tokenId,
    userId: user._id,
    sessionId: session._id,
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
  // RETURNING RESPONSE (NO TOKENS IN BODY FOR SECURITY)
  res.status(200).json({
    message: accountReactivated
      ? "Login successful! Your account has been reactivated."
      : "Login successful!",
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      accountReactivated: accountReactivated,
    },
  });
  // RETURNING FROM THE FUNCTION
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
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Refresh token not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DECODING REFRESH TOKEN
  let decodedToken: jwt.JwtPayload | undefined;
  try {
    // DECODING REFRESH TOKEN
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
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING USER ID FROM DECODED TOKEN
  const userId = decodedToken.userId;
  // GETTING TOKEN ID FROM DECODED TOKEN
  const tokenId = decodedToken.tokenId;
  // IF TOKEN ID NOT FOUND, RETURN 401 ERROR
  if (!tokenId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Invalid refresh token format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Refresh token not found or expired!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET SESSION ID FROM STORED TOKEN (IF EXISTS)
  const sessionId = storedToken.sessionId || null;
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
  // STORING NEW REFRESH TOKEN IN DATABASE WITH SESSION ID
  await RefreshToken.create({
    tokenId: newTokenId,
    userId,
    sessionId: sessionId,
    expiresAt,
    revoked: false,
  });
  // SETTING NEW ACCESS TOKEN IN HTTP-ONLY COOKIE
  const accessTokenExpiresIn = process.env.AT_EXPIRES_IN || "15m";
  // CALCULATING ACCESS TOKEN MAX AGE
  const accessTokenMaxAge = accessTokenExpiresIn.includes("m")
    ? parseInt(accessTokenExpiresIn) * 60 * 1000
    : 15 * 60 * 1000;
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
  // GETTING REFRESH TOKEN FROM COOKIES
  const refreshTokenCookie = req.cookies.refreshToken;
  // IF REFRESH TOKEN EXISTS, REVOKE CURRENT SESSION AND ITS REFRESH TOKENS
  if (refreshTokenCookie) {
    try {
      // DECODE REFRESH TOKEN TO GET USER ID AND TOKEN ID
      const decoded: any = jwt.verify(
        refreshTokenCookie,
        process.env.RT_SECRET!
      );
      // GET USER ID FROM DECODED TOKEN
      const userId = decoded.userId;
      // GET TOKEN ID FROM DECODED TOKEN
      const tokenId = decoded.tokenId;
      // IF USER ID OR TOKEN ID NOT FOUND, RETURN ERROR
      if (!userId || !tokenId) {
        // RETURN ERROR RESPONSE
        res.status(401).json({
          message: "Invalid refresh token!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // CONVERT USER ID TO OBJECT ID
      const userIdObjectId =
        typeof userId === "string"
          ? new mongoose.Types.ObjectId(userId)
          : userId;
      // FIND REFRESH TOKEN IN DATABASE TO GET SESSION ID
      const storedRefreshToken = await RefreshToken.findOne({
        tokenId,
        userId: userIdObjectId,
        revoked: false,
      }).exec();
      // IF REFRESH TOKEN FOUND, REVOKE ITS SESSION
      if (storedRefreshToken && storedRefreshToken.sessionId) {
        // FIND AND REVOKE THE SESSION LINKED TO THIS REFRESH TOKEN
        const currentSession = await Session.findOne({
          _id: storedRefreshToken.sessionId,
          userId: userIdObjectId,
          revoked: false,
        }).exec();
        // IF CURRENT SESSION FOUND, REVOKE IT AND ALL REFRESH TOKENS LINKED TO THIS SESSION
        if (currentSession) {
          // REVOKE CURRENT SESSION
          currentSession.revoked = true;
          // SET REVOKED AT DATE
          currentSession.revokedAt = new Date();
          // SET IS CURRENT TO FALSE
          currentSession.isCurrent = false;
          // SAVE CURRENT SESSION
          await currentSession.save();
        }
        // REVOKE ALL REFRESH TOKENS LINKED TO THIS SESSION
        await RefreshToken.updateMany(
          { sessionId: storedRefreshToken.sessionId, revoked: false },
          { revoked: true }
        ).exec();
      }
    } catch (error) {
      // LOG ERROR
      console.error("Error processing logout:", error);
    }
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
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "OAuth authentication failed!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET USER ID (HANDLE BOTH OBJECTID AND STRING)
  const userId = user._id?.toString() || user._id || user.id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "OAuth authentication failed!",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND USER BY ID
  const user = await User.findById(userId).select("-password").lean().exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
      recoveryEmail: user.recoveryEmail || null,
      recoveryEmailVerified: user.recoveryEmailVerified || false,
      phoneNumber: user.phoneNumber || null,
      phoneNumberVerified: user.phoneNumberVerified || false,
    },
  });
  // RETURNING FROM FUNCTION
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
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Email and Verification Code are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING CODE FORMAT (6 DIGITS)
  if (!/^\d{6}$/.test(code)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code must be 6 digits!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING PENDING USER BY EMAIL AND CODE
  const pendingUser = await PendingUser.findOne({
    email: email.toLowerCase().trim(),
    verificationCode: code,
  }).exec();
  // IF PENDING USER NOT FOUND, RETURN ERROR
  if (!pendingUser) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid email or verification code!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING IF CODE HAS EXPIRED
  if (pendingUser.verificationCodeExpiresAt < new Date()) {
    // DELETE EXPIRED PENDING USER
    await pendingUser.deleteOne();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code has expired! Please request a new one.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING IF USER ALREADY EXISTS (RACE CONDITION CHECK)
  const existingUser = await User.findOne({ email: pendingUser.email })
    .lean()
    .exec();
  if (existingUser) {
    // DELETE PENDING USER IF USER ALREADY EXISTS
    await pendingUser.deleteOne();
    // RETURNING ERROR RESPONSE
    res.status(409).json({
      message: "User with this email already exists!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CREATING VERIFIED USER
  const newUser = await User.create({
    name: pendingUser.name,
    email: pendingUser.email,
    password: pendingUser.password,
    phoneNumber: pendingUser.phoneNumber || null,
    phoneNumberVerified: pendingUser.phoneNumber ? false : false,
  });
  // EXTRACT DEVICE INFO FROM REQUEST
  const deviceInfo = extractDeviceInfo(req);
  // GET IP ADDRESS FROM REQUEST
  const ipAddress = getIpAddress(req);
  // GET LOCATION INFO FROM IP ADDRESS
  const locationInfo = await getLocationFromIp(ipAddress);
  // CREATE SESSION
  const session = await createSession(
    newUser._id,
    deviceInfo,
    ipAddress,
    locationInfo || {
      country: "Unknown",
      city: "Unknown",
      region: "Unknown",
      countryCode: "XX",
    },
    true,
    false,
    false,
    ""
  );
  // CLEANING UP ANY EXISTING REFRESH TOKENS FOR OTHER SESSIONS (NOT THE CURRENT ONE)
  await RefreshToken.deleteMany({
    userId: newUser._id,
    sessionId: { $ne: session._id },
  }).exec();
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
  // STORING REFRESH TOKEN IN DATABASE WITH SESSION ID
  await RefreshToken.create({
    tokenId,
    userId: newUser._id,
    sessionId: session._id,
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
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Email is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^\S+@\S+\.\S+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
  if (!emailRegex.test(email)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING PENDING USER BY EMAIL
  const pendingUser = await PendingUser.findOne({
    email: email.toLowerCase().trim(),
  }).exec();
  // IF PENDING USER NOT FOUND, RETURN ERROR
  if (!pendingUser) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "No pending verification found for this email!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RATE LIMITING: CHECK IF USER HAS EXCEEDED RESEND LIMIT (MAX 3 RESENDS PER 5 MINUTES)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (
    pendingUser.lastResendAt > fiveMinutesAgo &&
    pendingUser.resendAttempts >= 3
  ) {
    // RETURNING ERROR RESPONSE
    res.status(429).json({
      message:
        "Too many resend attempts! Please wait 5 minutes before requesting again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Verification code resent successfully! Please check your inbox.",
    success: true,
  });
  // RETURNING FROM FUNCTION
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
  // GETTING EMAIL AND USE RECOVERY EMAIL FROM REQUEST BODY
  const { email, useRecoveryEmail } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Email is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN ERROR RESPONSE
  if (!emailRegex.test(email)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING USER BY EMAIL
  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select("recoveryEmail recoveryEmailVerified")
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
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING IF USER WANTS TO USE RECOVERY EMAIL
  const shouldUseRecoveryEmail =
    useRecoveryEmail === true &&
    user.recoveryEmail &&
    user.recoveryEmailVerified;
  // IF USER REQUESTED RECOVERY EMAIL BUT DOESN'T HAVE ONE, RETURN ERROR
  if (
    useRecoveryEmail === true &&
    (!user.recoveryEmail || !user.recoveryEmailVerified)
  ) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "You don't have a verified recovery email. Please use your primary email.",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
      // RETURNING FROM FUNCTION
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
    // IF USING RECOVERY EMAIL, SEND TO RECOVERY EMAIL
    if (shouldUseRecoveryEmail) {
      // SENDING PASSWORD RESET EMAIL TO RECOVERY EMAIL
      await sendPasswordResetRecoveryEmail(
        user.recoveryEmail!,
        user.name,
        resetCode,
        user.email
      );
    } else {
      // SENDING PASSWORD RESET EMAIL TO PRIMARY EMAIL
      await sendPasswordResetEmail(user.email, resetCode, user.name);
    }
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
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE (SECURITY: DON'T REVEAL IF EMAIL EXISTS)
  res.status(200).json({
    message:
      "If an account exists with this email, a password reset code has been sent.",
    success: true,
    data: {
      sentToRecoveryEmail: shouldUseRecoveryEmail,
    },
  });
  // RETURNING FROM FUNCTION
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
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Email, code, and new password are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL IS NOT VALID, RETURN ERROR
  if (!emailRegex.test(email)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING CODE FORMAT (6 DIGITS)
  if (!/^\d{6}$/.test(code)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Reset code must be 6 digits!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING PASSWORD STRENGTH (8+ CHARACTERS, UPPERCASE, LOWERCASE, DIGIT, SPECIAL)
  if (newPassword.length < 8) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must be at least 8 characters long!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR UPPERCASE LETTER
  if (!/[A-Z]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one uppercase letter!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR LOWERCASE LETTER
  if (!/[a-z]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one lowercase letter!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR DIGIT
  if (!/[0-9]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one digit!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR SPECIAL CHARACTER
  if (!/[^A-Za-z0-9]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one special character!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING PASSWORD RESET REQUEST
  const passwordReset = await PasswordReset.findOne({
    email: email.toLowerCase().trim(),
  }).exec();
  // IF PASSWORD RESET REQUEST NOT FOUND, RETURN ERROR
  if (!passwordReset) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message:
        "No password reset request found for this email. Please request a new code.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF CODE HAS BEEN USED
  if (passwordReset.used) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "This reset code has already been used. Please request a new code.",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
    // RETURNING FROM FUNCTION
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
    // RETURNING FROM FUNCTION
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
    // RETURNING FROM FUNCTION
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
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF NEW PASSWORD IS SAME AS CURRENT PASSWORD
  const isSamePassword = await bcrypt.compare(newPassword, user.password || "");
  // IF NEW PASSWORD IS SAME AS CURRENT PASSWORD, RETURN ERROR RESPONSE
  if (isSamePassword) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New password must be different from your current password!",
      success: false,
    });
    // RETURNING FROM FUNCTION
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
  // RETURNING FROM FUNCTION
  return;
});

/**
 * REQUEST ACCOUNT RECOVERY
 * SENDS RECOVERY CODE TO USER'S RECOVERY EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REQUEST ACCOUNT RECOVERY ==>
export const requestAccountRecovery = expressAsyncHandler(async (req, res) => {
  // GETTING RECOVERY EMAIL FROM REQUEST BODY
  const { recoveryEmail } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!recoveryEmail) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery email is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN ERROR RESPONSE
  if (!emailRegex.test(recoveryEmail)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING USER BY RECOVERY EMAIL
  const user = await User.findOne({
    recoveryEmail: recoveryEmail.toLowerCase().trim(),
    recoveryEmailVerified: true,
  })
    .select("email recoveryEmail name")
    .lean()
    .exec();
  // IF USER NOT FOUND, STILL RETURN SUCCESS (SECURITY: DON'T REVEAL IF EMAIL EXISTS)
  if (!user) {
    // RETURN SUCCESS TO PREVENT EMAIL ENUMERATION
    res.status(200).json({
      message:
        "If an account exists with this recovery email, a recovery code has been sent.",
      success: true,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING IF ACCOUNT RECOVERY REQUEST ALREADY EXISTS
  const existingRecovery = await AccountRecovery.findOne({
    recoveryEmail: recoveryEmail.toLowerCase().trim(),
  }).exec();
  // RATE LIMITING: CHECK IF USER HAS EXCEEDED RESEND LIMIT (MAX 3 REQUESTS PER 15 MINUTES)
  if (existingRecovery) {
    // CALCULATING 15 MINUTES AGO
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    // CHECK IF USER HAS EXCEEDED RESEND LIMIT
    if (
      existingRecovery.lastResendAt > fifteenMinutesAgo &&
      existingRecovery.resendAttempts >= 3
    ) {
      // RETURN ERROR RESPONSE
      res.status(429).json({
        message:
          "Too many recovery requests! Please wait 15 minutes before requesting again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // RESET RESEND ATTEMPTS IF 15 MINUTES HAVE PASSED
    if (existingRecovery.lastResendAt <= fifteenMinutesAgo) {
      // RESET RESEND ATTEMPTS
      existingRecovery.resendAttempts = 0;
    }
    // DELETE EXISTING RECOVERY REQUEST TO CREATE NEW ONE
    await existingRecovery.deleteOne().exec();
  }
  // GENERATING 6-DIGIT RECOVERY CODE
  const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
  // CALCULATING EXPIRY TIME (10 MINUTES FROM NOW)
  const recoveryCodeExpiresAt = new Date();
  // SETTING EXPIRY TIME TO 10 MINUTES
  recoveryCodeExpiresAt.setMinutes(recoveryCodeExpiresAt.getMinutes() + 10);
  // CREATING ACCOUNT RECOVERY REQUEST
  const accountRecovery = await AccountRecovery.create({
    recoveryEmail: recoveryEmail.toLowerCase().trim(),
    primaryEmail: user.email.toLowerCase(),
    recoveryCode,
    recoveryCodeExpiresAt,
    resendAttempts: existingRecovery ? existingRecovery.resendAttempts + 1 : 1,
    lastResendAt: new Date(),
    verificationAttempts: 0,
    lastVerificationAttemptAt: new Date(),
    used: false,
  });
  // SENDING ACCOUNT RECOVERY EMAIL
  try {
    // SENDING ACCOUNT RECOVERY EMAIL
    await sendAccountRecoveryCode(
      user.recoveryEmail!,
      user.name,
      recoveryCode,
      user.email
    );
  } catch (error) {
    // DELETING ACCOUNT RECOVERY REQUEST IF EMAIL SENDING FAILS
    await accountRecovery.deleteOne().exec();
    // LOGGING ERROR
    console.error("Error sending account recovery email:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send account recovery email. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE (SECURITY: DON'T REVEAL IF EMAIL EXISTS)
  res.status(200).json({
    message:
      "If an account exists with this recovery email, a recovery code has been sent.",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * VERIFY ACCOUNT RECOVERY CODE
 * VERIFIES RECOVERY CODE AND RETURNS ACCOUNT INFO
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== VERIFY ACCOUNT RECOVERY ==>
export const verifyAccountRecovery = expressAsyncHandler(async (req, res) => {
  // GETTING DATA FROM REQUEST BODY
  const { recoveryEmail, code } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!recoveryEmail || !code) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery email and code are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL IS NOT VALID, RETURN ERROR
  if (!emailRegex.test(recoveryEmail)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING CODE FORMAT (6 DIGITS)
  if (!/^\d{6}$/.test(code)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery code must be 6 digits!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING ACCOUNT RECOVERY REQUEST
  const accountRecovery = await AccountRecovery.findOne({
    recoveryEmail: recoveryEmail.toLowerCase().trim(),
  }).exec();
  // IF RECOVERY REQUEST NOT FOUND, RETURN ERROR
  if (!accountRecovery) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Recovery request not found. Please request a new code.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF CODE HAS EXPIRED
  if (new Date() > accountRecovery.recoveryCodeExpiresAt) {
    // DELETE EXPIRED RECOVERY REQUEST
    await accountRecovery.deleteOne().exec();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery code has expired! Please request a new one.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF CODE HAS BEEN USED
  if (accountRecovery.used) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery code has already been used. Please request a new one.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RATE LIMITING: CHECK VERIFICATION ATTEMPTS (MAX 5 ATTEMPTS PER 15 MINUTES)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (
    accountRecovery.lastVerificationAttemptAt > fifteenMinutesAgo &&
    accountRecovery.verificationAttempts >= 5
  ) {
    // RETURN ERROR RESPONSE
    res.status(429).json({
      message:
        "Too many verification attempts! Please wait 15 minutes before trying again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RESET VERIFICATION ATTEMPTS IF 15 MINUTES HAVE PASSED
  if (accountRecovery.lastVerificationAttemptAt <= fifteenMinutesAgo) {
    // RESET VERIFICATION ATTEMPTS
    accountRecovery.verificationAttempts = 0;
  }
  // INCREMENT VERIFICATION ATTEMPTS
  accountRecovery.verificationAttempts += 1;
  // SET LAST VERIFICATION ATTEMPT TIMESTAMP
  accountRecovery.lastVerificationAttemptAt = new Date();
  // SAVING ACCOUNT RECOVERY REQUEST
  await accountRecovery.save();
  // CHECK IF CODE MATCHES
  if (accountRecovery.recoveryCode !== code) {
    res.status(400).json({
      message: "Invalid recovery code! Please check and try again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING USER BY PRIMARY EMAIL
  const user = await User.findOne({
    email: accountRecovery.primaryEmail,
  })
    .select("email name")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    // DELETE ACCOUNT RECOVERY REQUEST
    await accountRecovery.deleteOne().exec();
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // MARKING RECOVERY CODE AS USED
  accountRecovery.used = true;
  // SAVING ACCOUNT RECOVERY REQUEST
  await accountRecovery.save();
  // RETURNING SUCCESS RESPONSE WITH ACCOUNT INFO
  res.status(200).json({
    message: "Account recovery verified successfully!",
    success: true,
    data: {
      primaryEmail: user.email,
      name: user.name,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GITHUB LINK CALLBACK HANDLER
 * HANDLES GITHUB OAUTH CALLBACK FOR LINKING GITHUB TO EXISTING ACCOUNT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GITHUB LINK CALLBACK HANDLER ==>
export const githubLinkCallback = expressAsyncHandler(async (req, res) => {
  // GET FRONTEND URL
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // GET CODE AND STATE FROM QUERY PARAMETERS
  const { code, state } = req.query;
  // VALIDATE CODE
  if (!code || typeof code !== "string") {
    // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
    res.redirect(
      `${frontendUrl}/settings/integrations?error=github_link_failed&message=${encodeURIComponent(
        "Authorization code not provided"
      )}`
    );
    // RETURNING FROM FUNCTION
    return;
  }
  // PARSE STATE TO GET USER ID
  let linkUserId: string | null = null;
  // IF STATE IS FOUND, PARSE IT TO GET USER ID
  if (state && typeof state === "string") {
    try {
      // PARSING STATE
      const stateObj = JSON.parse(state);
      // EXTRACTING LINK USER ID
      linkUserId = stateObj.linkUserId;
    } catch (error) {
      // INVALID STATE FORMAT
      console.error("Error parsing GitHub link state:", error);
    }
  }
  // VALIDATE USER ID FROM STATE
  if (!linkUserId) {
    // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
    res.redirect(
      `${frontendUrl}/settings/integrations?error=github_link_failed&message=${encodeURIComponent(
        "Invalid link request. Please try again."
      )}`
    );
    // RETURNING FROM FUNCTION
    return;
  }
  // EXCHANGE CODE FOR ACCESS TOKEN
  try {
    // MAKE REQUEST TO GITHUB TO EXCHANGE CODE FOR ACCESS TOKEN
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );
    // GET TOKEN DATA FROM RESPONSE
    const tokenData = tokenResponse.data;
    // CHECK FOR ERROR IN TOKEN RESPONSE
    if (tokenData.error) {
      // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
      res.redirect(
        `${frontendUrl}/settings/integrations?error=github_link_failed&message=${encodeURIComponent(
          tokenData.error_description ||
            "Failed to get access token from GitHub"
        )}`
      );
      // RETURNING FROM FUNCTION
      return;
    }
    // GET ACCESS TOKEN
    const accessToken = tokenData.access_token;
    // IF NO ACCESS TOKEN, RETURN ERROR
    if (!accessToken) {
      // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
      res.redirect(
        `${frontendUrl}/settings/integrations?error=github_link_failed&message=${encodeURIComponent(
          "No access token received from GitHub"
        )}`
      );
      // RETURNING FROM FUNCTION
      return;
    }
    // USE ACCESS TOKEN TO GET GITHUB USER INFO
    const octokit = new Octokit({ auth: accessToken });
    // GET AUTHENTICATED USER
    const { data: githubUser } = await octokit.users.getAuthenticated();
    // FIND THE USER WHO INITIATED THE LINK
    const user = await User.findById(linkUserId).exec();
    // IF USER NOT FOUND, RETURN ERROR
    if (!user) {
      // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
      res.redirect(
        `${frontendUrl}/settings/integrations?error=github_link_failed&message=${encodeURIComponent(
          "User not found. Please login and try again."
        )}`
      );
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF THIS GITHUB ACCOUNT IS ALREADY LINKED TO ANOTHER USER
    const existingGitHubUser = await User.findOne({
      githubUsername: githubUser.login,
      _id: { $ne: linkUserId },
    })
      .lean()
      .exec();
    // IF GITHUB ACCOUNT IS ALREADY LINKED, RETURN ERROR
    if (existingGitHubUser) {
      // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
      res.redirect(
        `${frontendUrl}/settings/integrations?error=github_link_failed&message=${encodeURIComponent(
          "This GitHub account is already linked to another PlanOra account."
        )}`
      );
      // RETURNING FROM FUNCTION
      return;
    }
    // ENCRYPT ACCESS TOKEN
    const encryptedAccessToken = encryptSecret(accessToken);
    // GITHUB SCOPES
    const githubScopes = ["user:email", "read:user", "repo"];
    // SET GITHUB ACCESS TOKEN
    user.githubAccessToken = encryptedAccessToken;
    // SET GITHUB USERNAME
    user.githubUsername = githubUser.login;
    // SET GITHUB CONNECTED AT
    user.githubConnectedAt = new Date();
    // SET GITHUB SCOPES
    user.githubScopes = githubScopes;
    // SAVING USER
    await user.save();
    // REDIRECTING TO FRONTEND WITH SUCCESS
    res.redirect(
      `${frontendUrl}/settings/integrations?github_linked=success&username=${encodeURIComponent(
        githubUser.login
      )}`
    );
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error in GitHub link callback:", error);
    // REDIRECTING TO FRONTEND WITH ERROR MESSAGE
    res.redirect(
      `${frontendUrl}/settings/integrations?error=github_link_failed&message=${encodeURIComponent(
        "An error occurred while linking GitHub. Please try again."
      )}`
    );
    // RETURNING FROM FUNCTION
    return;
  }
});

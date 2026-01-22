// <== IMPORTS ==>
import {
  sendDeviceVerificationCode,
  sendDeviceTrustVerificationCode,
  sendNewDeviceLoginAlert,
  sendSuspiciousActivityAlert,
} from "../utils/mailer.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import { Request, Response } from "express";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import expressAsyncHandler from "express-async-handler";
import { getLocationFromIp } from "../utils/ipGeolocation.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import { checkSuspiciousActivity } from "../utils/suspiciousActivity.js";
import { decryptSecret, verifyBackupCode } from "../utils/encryption.js";
import { DeviceVerification } from "../models/deviceVerification.model.js";
import { generateToken, generateRefreshToken } from "./auth.controller.js";
import { extractDeviceInfo, getIpAddress } from "../utils/deviceFingerprint.js";
import { createSession, getActiveSessions, addTrustedDevice } from "../utils/sessionManager.js";

/**
 * REQUEST DEVICE VERIFICATION
 * SENDS VERIFICATION CODE TO USER'S EMAIL FOR NEW DEVICE LOGIN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REQUEST DEVICE VERIFICATION ==>
export const requestDeviceVerification = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GETTING EMAIL AND PASSWORD FROM REQUEST BODY
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
    const user = await User.findOne({ email })
      .select("+password")
      .lean()
      .exec();
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
    // COMPARING PASSWORD WITH BCRYPT
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
    // EXTRACT DEVICE INFO FROM REQUEST
    const deviceInfo = extractDeviceInfo(req);
    // GET IP ADDRESS FROM REQUEST
    const ipAddress = getIpAddress(req);
    // GET LOCATION INFO FROM IP
    const locationInfo = await getLocationFromIp(ipAddress);
    // GET EXISTING ACTIVE SESSIONS FOR SUSPICIOUS ACTIVITY DETECTION
    const existingSessions = await getActiveSessions(user._id);
    // FIND ALL SESSIONS FOR THE USER (INCLUDING REVOKED ONES)
    const allSessions = await Session.find({
      userId: user._id,
      expiresAt: { $gt: new Date() },
    })
      .lean()
      .exec();
    // CHECK IF THE DEVICE IS THE SAME
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
    // CHECK IF THE DEVICE IS A COMPLETELY NEW DEVICE
    const isCompletelyNewDevice = !allSessions.some((session) => {
      // CHECK IF THE DEVICE IS THE SAME BY CHECKING THE DEVICE FINGERPRINT (BROWSER, OS, DEVICE TYPE)
      const deviceMatch =
        session.browserName === deviceInfo.browserName ||
        session.operatingSystem === deviceInfo.operatingSystem ||
        session.deviceType === deviceInfo.deviceType;
      // RETURN TRUE IF THE DEVICE IS THE SAME
      return deviceMatch;
    });
    // CHECK FOR SUSPICIOUS ACTIVITY
    const suspiciousCheck = await checkSuspiciousActivity(
      locationInfo || {
        country: "Unknown",
        city: "Unknown",
        region: "Unknown",
        countryCode: "XX",
      },
      ipAddress,
      existingSessions
    );
    // IF SUSPICIOUS ACTIVITY DETECTED, SEND ALERT EMAIL
    if (suspiciousCheck.isSuspicious) {
      try {
        // SENDING SUSPICIOUS ACTIVITY ALERT
        await sendSuspiciousActivityAlert(
          user.email,
          user.name,
          deviceInfo,
          locationInfo || {
            country: "Unknown",
            city: "Unknown",
            region: "Unknown",
            countryCode: "XX",
          },
          ipAddress,
          suspiciousCheck.reason
        );
      } catch (error) {
        // LOG ERROR BUT DON'T FAIL THE REQUEST
        console.error("Error sending suspicious activity alert:", error);
      }
    }
    // CLEAN UP EXPIRED AND COMPLETED DEVICE VERIFICATION RECORDS
    await DeviceVerification.deleteMany({
      userId: user._id,
      $or: [
        { emailCodeExpiresAt: { $lt: new Date() } },
        { completed: true },
      ],
    }).exec();
    // CHECK IF EXISTING DEVICE VERIFICATION EXISTS
    const existingVerification = await DeviceVerification.findOne({
      userId: user._id,
      completed: false,
      emailCodeExpiresAt: { $gt: new Date() },
    }).exec();
    // IF EXISTING VERIFICATION EXISTS, DELETE IT
    if (existingVerification) {
      // DELETING EXISTING VERIFICATION
      await existingVerification.deleteOne().exec();
    }
    // GENERATING 6-DIGIT VERIFICATION CODE
    const emailCode = Math.floor(100000 + Math.random() * 900000).toString();
    // CALCULATING EXPIRATION TIME (10 MINUTES FROM NOW)
    const emailCodeExpiresAt = new Date();
    // SETTING EXPIRATION TIME TO 10 MINUTES FROM NOW
    emailCodeExpiresAt.setMinutes(emailCodeExpiresAt.getMinutes() + 10);
    // CREATING DEVICE VERIFICATION RECORD
    const deviceVerification = await DeviceVerification.create({
      userId: user._id,
      emailCode,
      emailCodeExpiresAt,
      emailCodeVerified: false,
      twoFactorCodeVerified: false,
      deviceInfo: {
        deviceType: deviceInfo.deviceType,
        deviceName: deviceInfo.deviceName,
        browserName: deviceInfo.browserName,
        browserVersion: deviceInfo.browserVersion,
        operatingSystem: deviceInfo.operatingSystem,
        userAgent: deviceInfo.userAgent,
      },
      ipAddress,
      locationInfo: {
        country: locationInfo?.country || "Unknown",
        city: locationInfo?.city || "Unknown",
        region: locationInfo?.region || "Unknown",
        countryCode: locationInfo?.countryCode || "XX",
      },
      verificationAttempts: 0,
      completed: false,
    });
    // SENDING VERIFICATION EMAIL
    try {
      // IF SAME DEVICE, SEND "MARK DEVICE TRUSTED" EMAIL
      if (isSameDevice) {
        await sendDeviceTrustVerificationCode(
          user.email,
          user.name,
          emailCode,
          deviceInfo,
          locationInfo || {
            country: "Unknown",
            city: "Unknown",
            region: "Unknown",
            countryCode: "XX",
          }
        );
      } else {
        // IF NEW DEVICE, SEND STANDARD VERIFICATION CODE EMAIL
        await sendDeviceVerificationCode(
          user.email,
          user.name,
          emailCode,
          deviceInfo,
          locationInfo || {
            country: "Unknown",
            city: "Unknown",
            region: "Unknown",
            countryCode: "XX",
          }
        );
        // ONLY SEND NEW DEVICE LOGIN ALERT IF THIS IS A COMPLETELY NEW DEVICE
        if (isCompletelyNewDevice) {
          // SENDING NEW DEVICE LOGIN ALERT
          await sendNewDeviceLoginAlert(
            user.email,
            user.name,
            deviceInfo,
            locationInfo || {
              country: "Unknown",
              city: "Unknown",
              region: "Unknown",
              countryCode: "XX",
            },
            ipAddress
          );
        }
      }
    } catch (error) {
      // DELETING DEVICE VERIFICATION IF EMAIL SENDING FAILS
      await deviceVerification.deleteOne().exec();
      // LOGGING ERROR
      console.error("Error sending device verification email:", error);
      // RETURNING ERROR RESPONSE
      res.status(500).json({
        message: "Failed to send verification email. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURNING RESPONSE WITH DEVICE VERIFICATION ID (USED AS SESSION ID)
    res.status(200).json({
      message: "Verification code sent to your email! Please check your inbox.",
      success: true,
      data: {
        email: user.email,
        requires2FA: user.isTwoFactorEnabled || false,
        sessionId: deviceVerification._id.toString(),
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * VERIFY DEVICE CODE
 * VERIFIES THE EMAIL CODE FOR DEVICE VERIFICATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== VERIFY DEVICE CODE ==>
export const verifyDeviceCode = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GETTING EMAIL, PASSWORD, CODE, AND REMEMBER DEVICE FLAG FROM REQUEST BODY
    const { email, password, code, rememberDevice } = req.body;
    // VALIDATING REQUIRED FIELDS
    if (!email || !password || !code) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Email, Password, and Verification Code are Required!",
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
    // FINDING USER BY EMAIL WITH PASSWORD FIELD
    const user = await User.findOne({ email })
      .select("+password")
      .lean()
      .exec();
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
    // COMPARING PASSWORD WITH BCRYPT
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
    // GET SESSION ID FROM REQUEST BODY (IF PROVIDED)
    const { sessionId } = req.body;
    // FIND DEVICE VERIFICATION BY ID OR USER ID AND COMPLETED FALSE
    let deviceVerification;
    // IF SESSION ID PROVIDED, FIND DEVICE VERIFICATION BY ID
    if (sessionId) {
      // FIND DEVICE VERIFICATION BY ID
      deviceVerification = await DeviceVerification.findOne({
        _id: sessionId,
        userId: user._id,
        completed: false,
        emailCodeExpiresAt: { $gt: new Date() },
      }).exec();
      // IF NOT FOUND BY SESSION ID, TRY TO FIND ANY ACTIVE VERIFICATION
      if (!deviceVerification) {
        // FIND MOST RECENT ACTIVE VERIFICATION
        deviceVerification = await DeviceVerification.findOne({
          userId: user._id,
          completed: false,
          emailCodeExpiresAt: { $gt: new Date() },
        })
          .sort({ createdAt: -1 })
          .exec();
      }
    } else {
      // FIND MOST RECENT ACTIVE VERIFICATION
      deviceVerification = await DeviceVerification.findOne({
        userId: user._id,
        completed: false,
        emailCodeExpiresAt: { $gt: new Date() },
      })
        .sort({ createdAt: -1 })
        .exec();
    }
    // IF DEVICE VERIFICATION NOT FOUND, RETURN ERROR
    if (!deviceVerification) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "No active device verification found. Please request a new verification code.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECKING IF CODE HAS EXPIRED
    if (deviceVerification.emailCodeExpiresAt < new Date()) {
      // DELETE EXPIRED DEVICE VERIFICATION
      await deviceVerification.deleteOne().exec();
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Verification code has expired! Please request a new one.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECKING IF CODE MATCHES
    if (deviceVerification.emailCode !== code) {
      // INCREMENT VERIFICATION ATTEMPTS
      deviceVerification.verificationAttempts += 1;
      // SETTING LAST VERIFICATION ATTEMPT AT TO CURRENT DATE
      deviceVerification.lastVerificationAttemptAt = new Date();
      // SAVING UPDATED DEVICE VERIFICATION
      await deviceVerification.save();
      // IF TOO MANY ATTEMPTS, DELETE VERIFICATION
      if (deviceVerification.verificationAttempts >= 5) {
        // DELETING DEVICE VERIFICATION
        await deviceVerification.deleteOne().exec();
        // RETURNING ERROR RESPONSE
        res.status(429).json({
          message:
            "Too many failed verification attempts. Please request a new verification code.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Invalid verification code. Please try again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // SETTING EMAIL CODE VERIFIED TO TRUE
    deviceVerification.emailCodeVerified = true;
    // SAVING UPDATED DEVICE VERIFICATION
    await deviceVerification.save();
    // CHECK IF 2FA IS ENABLED
    if (user.isTwoFactorEnabled) {
      // RETURNING RESPONSE WITH 2FA REQUIRED
      res.status(200).json({
        message:
          "Email code verified! Please enter your 2FA code to complete login.",
        success: true,
        requires2FA: true,
        data: {
          email: user.email,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATE DEVICE INFO AND LOCATION INFO
    if (!deviceVerification.deviceInfo || !deviceVerification.locationInfo) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Device verification data is incomplete. Please request a new verification code.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // STORE DEVICE INFO FROM DEVICE VERIFICATION IN VARIABLES
    const deviceInfoData = deviceVerification.deviceInfo;
    // STORE LOCATION INFO FROM DEVICE VERIFICATION IN VARIABLES
    const locationInfoData = deviceVerification.locationInfo;
    // EXTRACT DEVICE INFO FROM DEVICE VERIFICATION IN VARIABLES
    const deviceInfo = {
      deviceType: deviceInfoData.deviceType as
        | "desktop"
        | "mobile"
        | "tablet"
        | "unknown",
      deviceName: deviceInfoData.deviceName,
      browserName: deviceInfoData.browserName,
      browserVersion: deviceInfoData.browserVersion || "",
      operatingSystem: deviceInfoData.operatingSystem,
      userAgent: deviceInfoData.userAgent,
    };
    // GET LOCATION INFO FROM DEVICE VERIFICATION
    const locationInfo = {
      country: locationInfoData.country || "Unknown",
      city: locationInfoData.city || "Unknown",
      region: locationInfoData.region || "Unknown",
      countryCode: locationInfoData.countryCode || "XX",
    };
    // GET EXISTING ACTIVE SESSIONS FOR SUSPICIOUS ACTIVITY DETECTION
    const existingSessions = await getActiveSessions(user._id);
    // CHECK FOR SUSPICIOUS ACTIVITY
    const suspiciousCheck = await checkSuspiciousActivity(
      locationInfo,
      deviceVerification.ipAddress,
      existingSessions
    );
    // CREATE SESSION WITH REMEMBER DEVICE FLAG
    const session = await createSession(
      user._id,
      deviceInfo,
      deviceVerification.ipAddress,
      locationInfo,
      rememberDevice === true, // TRUST DEVICE IF USER SELECTED REMEMBER DEVICE
      suspiciousCheck.isSuspicious,
      suspiciousCheck.reason
    );
    // IF REMEMBER DEVICE IS ENABLED, ADD TO TRUSTED DEVICES FOR FUTURE AUTO-TRUST
    if (rememberDevice === true) {
      // ADDING DEVICE TO TRUSTED DEVICES
      await addTrustedDevice(user._id, deviceInfo);
    }
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
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: refreshTokenMaxAge,
    });
    // SETTING SESSION ID COOKIE (NOT HTTP-ONLY SO FRONTEND CAN IDENTIFY CURRENT SESSION)
    res.cookie("sessionId", session.sessionId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: refreshTokenMaxAge,
    });
    // DELETE DEVICE VERIFICATION
    await deviceVerification.deleteOne().exec();
    // RETURN SUCCESS
    res.status(200).json({
      message: "Device verified and login successful!",
      success: true,
      requires2FA: false,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        phoneNumberVerified: user.phoneNumberVerified,
        recoveryEmail: user.recoveryEmail,
        recoveryEmailVerified: user.recoveryEmailVerified,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * VERIFY DEVICE 2FA
 * VERIFIES THE 2FA CODE FOR DEVICE VERIFICATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== VERIFY DEVICE 2FA ==>
export const verifyDevice2FA = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GETTING EMAIL, PASSWORD, TOKEN, AND BACKUP CODE FROM REQUEST BODY
    const { email, password, token, backupCode } = req.body;
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
    // VALIDATING 2FA TOKEN OR CODE
    if (!token && !backupCode) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "TOTP token or backup code is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
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
      // RETURNING FROM FUNCTION
      return;
    }
    // COMPARING PASSWORD WITH BCRYPT
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
    // CHECK IF 2FA IS ENABLED
    if (!user.isTwoFactorEnabled || !user.totpSecret) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Two-Factor Authentication is not enabled for this account!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FINDING DEVICE VERIFICATION BY USER ID
    const deviceVerification = await DeviceVerification.findOne({
      userId: user._id,
      completed: false,
      emailCodeVerified: true,
    }).exec();
    // IF DEVICE VERIFICATION NOT FOUND, RETURN ERROR
    if (!deviceVerification) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "No active device verification found. Please start the verification process again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VERIFYING 2FA CODE
    let twoFactorVerified = false;
    // IF TOTP TOKEN PROVIDED
    if (token) {
      // DECRYPTING TOTP SECRET
      const decryptedSecret = decryptSecret(user.totpSecret || "");
      // VERIFYING TOTP TOKEN
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: "base32",
        token: token,
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
      // IF USER NOT FOUND, RETURN ERROR
      if (!userWithCodes || !userWithCodes.backupCodes) {
        // RETURNING ERROR RESPONSE
        res.status(400).json({
          message: "Invalid backup code!",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // FINDING UNUSED BACKUP CODE
      const backupCodeIndex = userWithCodes.backupCodes.findIndex(
        (bc) => !bc.used && verifyBackupCode(backupCode, bc.code)
      );
      // IF BACKUP CODE NOT FOUND, RETURN ERROR
      if (backupCodeIndex === -1) {
        // RETURNING ERROR RESPONSE
        res.status(400).json({
          message: "Invalid backup code!",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // GETTING BACKUP CODE OBJECT
      const backupCodeObj = userWithCodes.backupCodes[backupCodeIndex];
      // IF BACKUP CODE OBJECT NOT FOUND, RETURN ERROR
      if (!backupCodeObj) {
        // RETURNING ERROR RESPONSE
        res.status(400).json({
          message: "Invalid backup code!",
          success: false,
        });
        // RETURNING FROM FUNCTION
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
      // RETURNING FROM FUNCTION
      return;
    }
    // SETTING TWO FACTOR CODE VERIFIED TO TRUE
    deviceVerification.twoFactorCodeVerified = true;
    // SAVING UPDATED DEVICE VERIFICATION
    await deviceVerification.save();
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "2FA code verified! Completing login...",
      success: true,
      data: {
        email: user.email,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * COMPLETE DEVICE LOGIN
 * COMPLETES THE DEVICE VERIFICATION AND CREATES SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== COMPLETE DEVICE LOGIN ==>
export const completeDeviceLogin = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GETTING EMAIL AND PASSWORD FROM REQUEST BODY
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
    const user = await User.findOne({ email })
      .select("+password")
      .lean()
      .exec();
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
    // COMPARING PASSWORD WITH BCRYPT
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
    // FINDING DEVICE VERIFICATION BY USER ID
    const deviceVerification = await DeviceVerification.findOne({
      userId: user._id,
      completed: false,
      emailCodeVerified: true,
    }).exec();
    // IF DEVICE VERIFICATION NOT FOUND, RETURN ERROR
    if (!deviceVerification) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "No active device verification found. Please start the verification process again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF 2FA IS REQUIRED AND VERIFIED
    if (user.isTwoFactorEnabled && !deviceVerification.twoFactorCodeVerified) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "2FA verification is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATE DEVICE INFO AND LOCATION INFO
    if (!deviceVerification.deviceInfo || !deviceVerification.locationInfo) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Device verification data is incomplete. Please request a new verification code.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // STORE DEVICE INFO FROM DEVICE VERIFICATION IN VARIABLES
    const deviceInfoData = deviceVerification.deviceInfo;
    // STORE LOCATION INFO FROM DEVICE VERIFICATION IN VARIABLES
    const locationInfoData = deviceVerification.locationInfo;
    // EXTRACT DEVICE INFO FROM DEVICE VERIFICATION IN VARIABLES
    const deviceInfo = {
      deviceType: deviceInfoData.deviceType as
        | "desktop"
        | "mobile"
        | "tablet"
        | "unknown",
      deviceName: deviceInfoData.deviceName,
      browserName: deviceInfoData.browserName,
      browserVersion: deviceInfoData.browserVersion || "",
      operatingSystem: deviceInfoData.operatingSystem,
      userAgent: deviceInfoData.userAgent,
    };
    // GET LOCATION INFO FROM DEVICE VERIFICATION
    const locationInfo = {
      country: locationInfoData.country || "Unknown",
      city: locationInfoData.city || "Unknown",
      region: locationInfoData.region || "Unknown",
      countryCode: locationInfoData.countryCode || "XX",
    };
    // GET EXISTING ACTIVE SESSIONS FOR SUSPICIOUS ACTIVITY DETECTION
    const existingSessions = await getActiveSessions(user._id);
    // CHECK FOR SUSPICIOUS ACTIVITY
    const suspiciousCheck = await checkSuspiciousActivity(
      locationInfo,
      deviceVerification.ipAddress,
      existingSessions
    );
    // GET REMEMBER DEVICE FLAG FROM REQUEST BODY
    const { rememberDevice } = req.body;
    // CREATING SESSION
    const session = await createSession(
      user._id,
      deviceInfo,
      deviceVerification.ipAddress,
      locationInfo,
      rememberDevice === true, // TRUST DEVICE IF USER SELECTED REMEMBER DEVICE
      suspiciousCheck.isSuspicious,
      suspiciousCheck.reason
    );
    // IF REMEMBER DEVICE IS ENABLED, ADD TO TRUSTED DEVICES FOR FUTURE AUTO-TRUST
    if (rememberDevice === true) {
      await addTrustedDevice(user._id, deviceInfo);
    }
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
    // SETTING SESSION ID COOKIE (NOT HTTP-ONLY SO FRONTEND CAN IDENTIFY CURRENT SESSION)
    res.cookie("sessionId", session.sessionId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: refreshTokenMaxAge,
    });
    // IF REMEMBER DEVICE IS ENABLED, SET DEVICE TOKEN COOKIE
    if (rememberDevice === true) {
      // GENERATE DEVICE TOKEN
      const deviceToken = crypto.randomUUID();
      // CALCULATE DEVICE TOKEN EXPIRATION (90 DAYS)
      const deviceTokenMaxAge = 90 * 24 * 60 * 60 * 1000;
      // SET DEVICE TOKEN COOKIE
      res.cookie("deviceToken", deviceToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: deviceTokenMaxAge,
      });
    }
    // SETTING DEVICE VERIFICATION AS COMPLETED TO TRUE
    deviceVerification.completed = true;
    // SETTING COMPLETED AT TO CURRENT DATE
    deviceVerification.completedAt = new Date();
    // SAVING UPDATED DEVICE VERIFICATION
    await deviceVerification.save();
    // RETURNING RESPONSE
    res.status(200).json({
      message: "Login successful!",
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        sessionId: session.sessionId,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

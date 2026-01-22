// <== IMPORTS ==>
import crypto from "crypto";
import mongoose from "mongoose";
import { LocationInfo } from "./ipGeolocation.js";
import { Session } from "../models/session.model.js";
import { getPlanLimits } from "../config/planLimits.js";
import { PlanType } from "../models/subscription.model.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import { Subscription } from "../models/subscription.model.js";
import { TrustedDevice } from "../models/trustedDevice.model.js";
import { DeviceInfo, generateTrustedDeviceFingerprint } from "./deviceFingerprint.js";

// <== SESSION EXPIRATION DAYS ==>
const SESSION_EXPIRATION_DAYS = parseInt(
  process.env.SESSION_EXPIRES_IN_DAYS || "30"
);
// <== DEFAULT MAX ACTIVE SESSIONS ==>
const DEFAULT_MAX_ACTIVE_SESSIONS = 3;

/**
 * CHECK IF THIS IS THE USER'S FIRST SESSION
 * @param userId - User ID
 * @returns Boolean Indicating If This Is The First Session
 */
// <== IS FIRST SESSION ==>
export const isFirstSession = async (
  userId: mongoose.Types.ObjectId
): Promise<boolean> => {
  // COUNT ALL SESSIONS FOR THIS USER (INCLUDING EXPIRED/REVOKED)
  const sessionCount = await Session.countDocuments({ userId }).exec();
  // RETURN TRUE IF NO SESSIONS FOUND, FALSE OTHERWISE
  return sessionCount === 0;
};

/**
 * CHECK IF A DEVICE IS IN THE USER'S TRUSTED DEVICES LIST
 * @param userId - User ID
 * @param deviceInfo - Device Info Object
 * @returns Boolean Indicating If Device Is Trusted
 */
// <== IS DEVICE TRUSTED ==>
export const isDeviceTrusted = async (
  userId: mongoose.Types.ObjectId,
  deviceInfo: DeviceInfo
): Promise<boolean> => {
  // GENERATE TRUSTED DEVICE FINGERPRINT
  const fingerprint = generateTrustedDeviceFingerprint(deviceInfo);
  // CHECK IF DEVICE EXISTS IN TRUSTED DEVICES
  const trustedDevice = await TrustedDevice.findOne({
    userId,
    deviceFingerprint: fingerprint,
    isActive: true,
  })
    .lean()
    .exec();
  // IF FOUND, UPDATE LAST USED TIMESTAMP (NON-BLOCKING)
  if (trustedDevice) {
    TrustedDevice.updateOne(
      { _id: trustedDevice._id },
      { lastUsedAt: new Date() }
    ).exec();
  }
  // RETURN TRUE IF DEVICE IS TRUSTED, FALSE OTHERWISE
  return trustedDevice !== null;
};

/**
 * ADD A DEVICE TO USER'S TRUSTED DEVICES LIST
 * @param userId - User ID
 * @param deviceInfo - Device Info Object
 * @returns Created or Updated TrustedDevice
 */
// <== ADD TRUSTED DEVICE ==>
export const addTrustedDevice = async (
  userId: mongoose.Types.ObjectId,
  deviceInfo: DeviceInfo
): Promise<any> => {
  // GENERATE TRUSTED DEVICE FINGERPRINT
  const fingerprint = generateTrustedDeviceFingerprint(deviceInfo);
  // EXTRACT MAJOR BROWSER VERSION
  const majorBrowserVersion = deviceInfo.browserVersion.split(".")[0] || "";
  // UPSERT TRUSTED DEVICE (UPDATE IF EXISTS, CREATE IF NOT)
  const trustedDevice = await TrustedDevice.findOneAndUpdate(
    {
      userId,
      deviceFingerprint: fingerprint,
    },
    {
      $set: {
        deviceType: deviceInfo.deviceType,
        deviceName: deviceInfo.deviceName,
        browserName: deviceInfo.browserName,
        browserVersion: majorBrowserVersion,
        operatingSystem: deviceInfo.operatingSystem,
        lastUsedAt: new Date(),
        isActive: true,
      },
      $setOnInsert: {
        trustedAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
    }
  ).exec();
  return trustedDevice;
};

/**
 * REMOVE A DEVICE FROM USER'S TRUSTED DEVICES LIST
 * @param userId - User ID
 * @param deviceInfo - Device Info Object
 * @returns Boolean Indicating If Device Was Removed
 */
// <== REMOVE TRUSTED DEVICE ==>
export const removeTrustedDevice = async (
  userId: mongoose.Types.ObjectId,
  deviceInfo: DeviceInfo
): Promise<boolean> => {
  // GENERATE TRUSTED DEVICE FINGERPRINT
  const fingerprint = generateTrustedDeviceFingerprint(deviceInfo);
  // DEACTIVATE TRUSTED DEVICE
  const result = await TrustedDevice.updateOne(
    {
      userId,
      deviceFingerprint: fingerprint,
    },
    {
      isActive: false,
    }
  ).exec();
  // RETURN TRUE IF DEVICE WAS REMOVED, FALSE OTHERWISE
  return result.modifiedCount > 0;
};

/**
 * GET ALL TRUSTED DEVICES FOR A USER
 * @param userId - User ID
 * @returns Array of Trusted Devices
 */
// <== GET TRUSTED DEVICES ==>
export const getTrustedDevices = async (
  userId: mongoose.Types.ObjectId
): Promise<any[]> => {
  const devices = await TrustedDevice.find({
    userId,
    isActive: true,
  })
    .sort({ lastUsedAt: -1 })
    .lean()
    .exec();
  return devices;
};

/**
 * DETERMINE IF A NEW SESSION SHOULD BE AUTO-TRUSTED
 * @param userId - User ID
 * @param deviceInfo - Device Info Object
 * @returns Boolean Indicating If Session Should Be Auto-Trusted
 */
// <== SHOULD AUTO TRUST SESSION ==>
export const shouldAutoTrustSession = async (
  userId: mongoose.Types.ObjectId,
  deviceInfo: DeviceInfo
): Promise<boolean> => {
  // CHECK IF THIS IS THE FIRST SESSION (SIGNUP)
  const firstSession = await isFirstSession(userId);
  // IF THIS IS THE FIRST SESSION, RETURN TRUE
  if (firstSession) {
    // RETURN TRUE
    return true;
  }
  // CHECK IF DEVICE IS ALREADY TRUSTED
  const deviceTrusted = await isDeviceTrusted(userId, deviceInfo);
  // RETURN TRUE IF DEVICE IS TRUSTED, FALSE OTHERWISE
  return deviceTrusted;
};

/**
 * GET MAX SESSIONS FOR USER BASED ON THEIR SUBSCRIPTION PLAN
 * @param userId - User ID
 * @returns Max Sessions Number (100 Means Unlimited)
 */
// <== GET MAX SESSIONS FOR USER ==>
export const getMaxSessionsForUser = async (
  userId: mongoose.Types.ObjectId
): Promise<number> => {
  // TRY TO GET MAX SESSIONS FOR USER
  try {
    // FIND USER'S SUBSCRIPTION
    const subscription = await Subscription.findOne({
      userId,
      status: { $in: ["active", "trialing"] },
    })
      .lean()
      .exec();
    // IF SUBSCRIPTION FOUND, GET PLAN LIMITS
    if (subscription) {
      // GET PLAN LIMITS
      const planLimits = getPlanLimits(subscription.plan as PlanType);
      // RETURN MAX SESSIONS FROM PLAN LIMITS (-1 MEANS UNLIMITED, USE 100 AS PRACTICAL LIMIT)
      return planLimits.maxSessions === -1 ? 100 : planLimits.maxSessions;
    }
    // IF NO SUBSCRIPTION, RETURN DEFAULT
    return DEFAULT_MAX_ACTIVE_SESSIONS;
  } catch (error) {
    // LOG ERROR AND RETURN DEFAULT
    console.error("Error getting max sessions for user:", error);
    // RETURN DEFAULT MAX SESSIONS
    return DEFAULT_MAX_ACTIVE_SESSIONS;
  }
};

/**
 * CREATE NEW SESSION
 * @param userId - User ID
 * @param deviceInfo - Device Info Object
 * @param ipAddress - IP Address
 * @param locationInfo - Location Info Object
 * @param isTrusted - Is Trusted Device Flag
 * @param isSuspicious - Is Suspicious Activity Flag
 * @param suspiciousReason - Suspicious Activity Reason
 * @returns Created Session Object
 */
// <== CREATE SESSION ==>
export const createSession = async (
  userId: mongoose.Types.ObjectId,
  deviceInfo: DeviceInfo,
  ipAddress: string,
  locationInfo: LocationInfo,
  isTrusted: boolean = false,
  isSuspicious: boolean = false,
  suspiciousReason: string = ""
): Promise<any> => {
  // GENERATE UNIQUE SESSION ID
  const sessionId = crypto.randomUUID();
  // CALCULATE EXPIRATION DATE
  const expiresAt = new Date();
  // SET EXPIRATION DATE
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRATION_DAYS);
  // GET MAX SESSIONS FOR USER BASED ON THEIR PLAN
  const maxSessions = await getMaxSessionsForUser(userId);
  // CHECK IF MAX SESSIONS REACHED
  const activeSessionCount = await Session.countDocuments({
    userId,
    revoked: false,
    expiresAt: { $gt: new Date() },
  }).exec();
  // IF MAX SESSIONS REACHED, REVOKE OLDEST NON-TRUSTED SESSION
  if (activeSessionCount >= maxSessions) {
    // FIND OLDEST NON-TRUSTED SESSION FIRST
    let oldestSession = await Session.findOne({
      userId,
      revoked: false,
      isTrusted: false,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastActivity: 1 })
      .lean()
      .exec();
    // IF NO NON-TRUSTED SESSION, FIND OLDEST SESSION OVERALL
    if (!oldestSession) {
      // FIND OLDEST SESSION OVERALL
      oldestSession = await Session.findOne({
        userId,
        revoked: false,
        expiresAt: { $gt: new Date() },
      })
        .sort({ lastActivity: 1 })
        .lean()
        .exec();
    }
    // IF OLDEST SESSION FOUND, REVOKE IT
    if (oldestSession) {
      // REVOKE OLDEST SESSION
      await Session.updateOne(
        { _id: oldestSession._id },
        {
          revoked: true,
          revokedAt: new Date(),
        }
      ).exec();
      // REVOKE ALL REFRESH TOKENS FOR OLDEST SESSION
      await RefreshToken.updateMany(
        { sessionId: oldestSession._id },
        { revoked: true }
      ).exec();
    }
  }
  // CREATE NEW SESSION IN DATABASE
  const session = await Session.create({
    userId,
    sessionId,
    deviceType: deviceInfo.deviceType,
    deviceName: deviceInfo.deviceName,
    browserName: deviceInfo.browserName,
    browserVersion: deviceInfo.browserVersion,
    operatingSystem: deviceInfo.operatingSystem,
    userAgent: deviceInfo.userAgent,
    ipAddress,
    locationCountry: locationInfo.country,
    locationCity: locationInfo.city,
    locationRegion: locationInfo.region,
    isTrusted,
    lastActivity: new Date(),
    expiresAt,
    revoked: false,
    isSuspicious,
    suspiciousReason,
  });
  // RETURN CREATED SESSION
  return session;
};

/**
 * UPDATE SESSION ACTIVITY
 * @param sessionId - Session ID
 * @returns Updated Session or Null
 */
// <== UPDATE SESSION ACTIVITY ==>
export const updateSessionActivity = async (
  sessionId: string
): Promise<any | null> => {
  // FIND SESSION BY SESSION ID
  const session = await Session.findOne({ sessionId, revoked: false }).exec();
  // IF SESSION NOT FOUND, RETURN NULL
  if (!session) {
    // RETURN NULL
    return null;
  }
  // UPDATE LAST ACTIVITY
  session.lastActivity = new Date();
  // SAVE SESSION
  await session.save();
  // RETURN UPDATED SESSION
  return session;
};

/**
 * REVOKE SESSION
 * @param sessionId - Session ID
 * @param userId - User ID (for security check)
 * @returns Revoked Session or Null
 */
// <== REVOKE SESSION ==>
export const revokeSession = async (
  sessionId: string,
  userId: mongoose.Types.ObjectId
): Promise<any | null> => {
  // FIND SESSION BY SESSION ID AND USER ID
  const session = await Session.findOne({
    sessionId,
    userId,
    revoked: false,
  }).exec();
  // IF SESSION NOT FOUND, RETURN NULL
  if (!session) {
    // RETURN NULL
    return null;
  }
  // REVOKE SESSION
  session.revoked = true;
  // SET REVOKED AT DATE
  session.revokedAt = new Date();
  // SAVE SESSION
  await session.save();
  // REVOKE ALL REFRESH TOKENS FOR THIS SESSION
  await RefreshToken.updateMany(
    { sessionId: session._id },
    { revoked: true }
  ).exec();
  // RETURN REVOKED SESSION
  return session;
};

/**
 * REVOKE ALL OTHER SESSIONS
 * @param userId - User ID
 * @param currentSessionId - Current Session ID to Exclude
 * @returns Number of Revoked Sessions
 */
// <== REVOKE ALL OTHER SESSIONS ==>
export const revokeAllOtherSessions = async (
  userId: mongoose.Types.ObjectId,
  currentSessionId: string
): Promise<number> => {
  // FIND CURRENT SESSION
  const currentSession = await Session.findOne({
    sessionId: currentSessionId,
    userId,
  }).exec();
  // IF CURRENT SESSION NOT FOUND, RETURN 0
  if (!currentSession) {
    // RETURN 0
    return 0;
  }
  // REVOKE ALL OTHER SESSIONS
  const result = await Session.updateMany(
    {
      userId,
      _id: { $ne: currentSession._id },
      revoked: false,
    },
    {
      revoked: true,
      revokedAt: new Date(),
    }
  ).exec();
  // GET REVOKED SESSION IDs
  const revokedSessions = await Session.find({
    userId,
    _id: { $ne: currentSession._id },
    revoked: true,
  })
    .select("_id")
    .lean()
    .exec();
  // REVOKE ALL REFRESH TOKENS FOR REVOKED SESSIONS
  if (revokedSessions.length > 0) {
    // CREATE ARRAY FOR SESSION IDs
    const sessionIds: mongoose.Types.ObjectId[] = [];
    // LOOP THROUGH REVOKED SESSIONS
    for (const session of revokedSessions) {
      // IF SESSION ID EXISTS, ADD TO ARRAY
      if (session._id) {
        sessionIds.push(
          typeof session._id === "string"
            ? new mongoose.Types.ObjectId(session._id)
            : session._id
        );
      }
    }
    // IF SESSION IDs EXISTS, REVOKE ALL REFRESH TOKENS FOR SESSIONS
    if (sessionIds.length > 0) {
      // REVOKE ALL REFRESH TOKENS FOR SESSIONS
      await RefreshToken.updateMany(
        { sessionId: { $in: sessionIds } },
        { revoked: true }
      ).exec();
    }
  }
  // RETURN NUMBER OF REVOKED SESSIONS
  return result.modifiedCount || 0;
};

/**
 * TRUST DEVICE
 * @param sessionId - Session ID
 * @param userId - User ID (For Security Check)
 * @returns Trusted Session or Null
 */
// <== TRUST DEVICE ==>
export const trustDevice = async (
  sessionId: string,
  userId: mongoose.Types.ObjectId
): Promise<any | null> => {
  // FIND SESSION BY SESSION ID AND USER ID
  const session = await Session.findOne({
    sessionId,
    userId,
    revoked: false,
  }).exec();
  // IF SESSION NOT FOUND, RETURN NULL
  if (!session) {
    // RETURN NULL
    return null;
  }
  // TRUST DEVICE ON SESSION
  session.isTrusted = true;
  // SAVE SESSION
  await session.save();
  // ALSO ADD TO TRUSTED DEVICES FOR FUTURE SESSIONS
  const deviceInfo: DeviceInfo = {
    deviceType: session.deviceType as "desktop" | "mobile" | "tablet" | "unknown",
    deviceName: session.deviceName,
    browserName: session.browserName,
    browserVersion: session.browserVersion,
    operatingSystem: session.operatingSystem,
    userAgent: session.userAgent,
  };
  await addTrustedDevice(userId, deviceInfo);
  // RETURN TRUSTED SESSION
  return session;
};

/**
 * UNTRUST DEVICE
 * @param sessionId - Session ID
 * @param userId - User ID (For Security Check)
 * @returns Untrusted Session or Null
 */
// <== UNTRUST DEVICE ==>
export const untrustDevice = async (
  sessionId: string,
  userId: mongoose.Types.ObjectId
): Promise<any | null> => {
  // FIND SESSION BY SESSION ID AND USER ID
  const session = await Session.findOne({
    sessionId,
    userId,
    revoked: false,
  }).exec();
  // IF SESSION NOT FOUND, RETURN NULL
  if (!session) {
    // RETURN NULL
    return null;
  }
  // UNTRUST DEVICE ON SESSION
  session.isTrusted = false;
  // SAVE SESSION
  await session.save();
  // ALSO REMOVE FROM TRUSTED DEVICES
  const deviceInfo: DeviceInfo = {
    deviceType: session.deviceType as "desktop" | "mobile" | "tablet" | "unknown",
    deviceName: session.deviceName,
    browserName: session.browserName,
    browserVersion: session.browserVersion,
    operatingSystem: session.operatingSystem,
    userAgent: session.userAgent,
  };
  await removeTrustedDevice(userId, deviceInfo);
  // RETURN UNTRUSTED SESSION
  return session;
};

/**
 * GET ACTIVE SESSIONS FOR USER
 * @param userId - User ID
 * @returns Array of Active Sessions
 */
// <== GET ACTIVE SESSIONS ==>
export const getActiveSessions = async (
  userId: mongoose.Types.ObjectId
): Promise<any[]> => {
  // FIND ALL ACTIVE SESSIONS
  const sessions = await Session.find({
    userId,
    revoked: false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastActivity: -1 })
    .lean()
    .exec();
  // RETURN SESSIONS
  return sessions;
};

/**
 * CHECK IF USER HAS ACTIVE SESSIONS
 * @param userId - User ID
 * @returns Boolean
 */
// <== CHECK ACTIVE SESSIONS ==>
export const hasActiveSessions = async (
  userId: mongoose.Types.ObjectId
): Promise<boolean> => {
  // COUNT ACTIVE SESSIONS
  const count = await Session.countDocuments({
    userId,
    revoked: false,
    expiresAt: { $gt: new Date() },
  }).exec();
  // RETURN TRUE IF COUNT > 0
  return count > 0;
};

/**
 * CLEANUP EXPIRED SESSIONS
 * @returns Number of Cleaned Up Sessions
 */
// <== CLEANUP EXPIRED SESSIONS ==>
export const cleanupExpiredSessions = async (): Promise<number> => {
  // FIND EXPIRED SESSIONS
  const expiredSessions = await Session.find({
    expiresAt: { $lte: new Date() },
    revoked: false,
  })
    .select("_id")
    .lean()
    .exec();
  // IF NO EXPIRED SESSIONS, RETURN 0
  if (expiredSessions.length === 0) {
    // RETURN 0
    return 0;
  }
  // GET SESSION IDs AND CONVERT TO OBJECTID ARRAY
  const sessionIds: mongoose.Types.ObjectId[] = [];
  // LOOP THROUGH EXPIRED SESSIONS
  for (const session of expiredSessions) {
    // IF SESSION ID EXISTS, ADD TO ARRAY
    if (session._id) {
      sessionIds.push(
        typeof session._id === "string"
          ? new mongoose.Types.ObjectId(session._id)
          : session._id
      );
    }
  }
  // REVOKE ALL REFRESH TOKENS FOR EXPIRED SESSIONS
  if (sessionIds.length > 0) {
    // REVOKE ALL REFRESH TOKENS FOR EXPIRED SESSIONS
    await RefreshToken.updateMany(
      { sessionId: { $in: sessionIds } },
      { revoked: true }
    ).exec();
  }
  // DELETE EXPIRED SESSIONS (TTL INDEX WILL HANDLE THIS, BUT WE CAN ALSO DO IT MANUALLY)
  const result = await Session.deleteMany({
    expiresAt: { $lte: new Date() },
    revoked: false,
  }).exec();
  // RETURN NUMBER OF DELETED SESSIONS
  return result.deletedCount || 0;
};

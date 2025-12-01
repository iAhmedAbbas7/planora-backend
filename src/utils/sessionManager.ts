// <== IMPORTS ==>
import crypto from "crypto";
import mongoose from "mongoose";
import { LocationInfo } from "./ipGeolocation.js";
import { DeviceInfo } from "./deviceFingerprint.js";
import { Session } from "../models/session.model.js";
import { RefreshToken } from "../models/refreshToken.model.js";

// <== SESSION EXPIRATION DAYS ==>
const SESSION_EXPIRATION_DAYS = parseInt(
  process.env.SESSION_EXPIRES_IN_DAYS || "30"
);
// <== MAX ACTIVE SESSIONS ==>
const MAX_ACTIVE_SESSIONS = parseInt(process.env.MAX_ACTIVE_SESSIONS || "5");

/**
 * CREATE NEW SESSION
 * @param userId - User ID
 * @param deviceInfo - Device Info Object
 * @param ipAddress - IP Address
 * @param locationInfo - Location Info Object
 * @param isCurrent - Is Current Session Flag
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
  isCurrent: boolean = false,
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
  // IF THIS IS CURRENT SESSION, MARK ALL OTHER SESSIONS AS NOT CURRENT
  if (isCurrent) {
    // UPDATE ALL OTHER SESSIONS AS NOT CURRENT
    await Session.updateMany(
      { userId, isCurrent: true },
      { isCurrent: false }
    ).exec();
  }
  // CHECK IF MAX SESSIONS REACHED
  const activeSessionCount = await Session.countDocuments({
    userId,
    revoked: false,
    expiresAt: { $gt: new Date() },
  }).exec();
  // IF MAX SESSIONS REACHED, REVOKE OLDEST SESSION
  if (activeSessionCount >= MAX_ACTIVE_SESSIONS) {
    // FIND OLDEST SESSION
    const oldestSession = await Session.findOne({
      userId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    // IF OLDEST SESSION FOUND, REVOKE IT
    if (oldestSession) {
      // REVOKE OLDEST SESSION
      await Session.updateOne(
        { _id: oldestSession._id },
        {
          revoked: true,
          revokedAt: new Date(),
          isCurrent: false,
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
    isCurrent,
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
  // SET IS CURRENT TO FALSE
  session.isCurrent = false;
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
      isCurrent: false,
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
 * @param userId - User ID (for security check)
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
  // TRUST DEVICE
  session.isTrusted = true;
  // SAVE SESSION
  await session.save();
  // RETURN TRUSTED SESSION
  return session;
};

/**
 * UNTRUST DEVICE
 * @param sessionId - Session ID
 * @param userId - User ID (for security check)
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
  // UNTRUST DEVICE
  session.isTrusted = false;
  // SAVE SESSION
  await session.save();
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

// <== IMPORTS ==>
import { LocationInfo } from "./ipGeolocation.js";
import { Session } from "../models/session.model.js";

/**
 * CHECK FOR SUSPICIOUS ACTIVITY
 * DETECTS SUSPICIOUS LOGIN ATTEMPTS BASED ON VARIOUS FACTORS
 * @param userId - User ID
 * @param newLocationInfo - New Location Info
 * @param newIpAddress - New IP Address
 * @param existingSessions - Existing Active Sessions
 * @returns Suspicious Activity Info
 */
// <== CHECK SUSPICIOUS ACTIVITY ==>
export const checkSuspiciousActivity = async (
  newLocationInfo: LocationInfo,
  newIpAddress: string,
  existingSessions: any[]
): Promise<{ isSuspicious: boolean; reason: string }> => {
  // IF NO EXISTING SESSIONS, NOT SUSPICIOUS
  if (existingSessions.length === 0) {
    return { isSuspicious: false, reason: "" };
  }
  // REASONS ARRAY
  const reasons: string[] = [];
  // CHECK FOR DIFFERENT COUNTRY
  const existingCountries = existingSessions
    .map((s) => s.locationCountry)
    .filter((c) => c && c !== "Unknown");
  // IF EXISTING COUNTRIES FOUND
  if (existingCountries.length > 0) {
    // GET UNIQUE COUNTRIES
    const uniqueCountries = [...new Set(existingCountries)];
    // IF NEW LOCATION IS IN DIFFERENT COUNTRY
    if (
      newLocationInfo.country !== "Unknown" &&
      !uniqueCountries.includes(newLocationInfo.country)
    ) {
      reasons.push(`Login from different country (${newLocationInfo.country})`);
    }
  }
  // GET CURRENT HOUR
  const currentHour = new Date().getHours();
  // IF CURRENT HOUR IS BETWEEN 2 AND 5
  if (currentHour >= 2 && currentHour <= 5) {
    // CHECK IF USER HAS PREVIOUS LOGINS AT THIS TIME
    const hasPreviousLateNightLogins = existingSessions.some((s) => {
      // GET SESSION HOUR
      const sessionHour = new Date(s.createdAt).getHours();
      // IF SESSION HOUR IS BETWEEN 2 AND 5
      return sessionHour >= 2 && sessionHour <= 5;
    });
    // IF NO PREVIOUS LATE NIGHT LOGINS, FLAG AS SUSPICIOUS
    if (!hasPreviousLateNightLogins) {
      // ADD REASON FOR SUSPICIOUS LOGIN AT UNUSUAL TIME
      reasons.push("Login at unusual time (2 AM - 5 AM)");
    }
  }
  // GET RECENT SESSIONS FROM LAST 24 HOURS
  const recentSessions = existingSessions.filter((s) => {
    // GET SESSION AGE
    const sessionAge = Date.now() - new Date(s.createdAt).getTime();
    // IF SESSION AGE IS LESS THAN 24 HOURS
    return sessionAge < 24 * 60 * 60 * 1000;
  });
  // IF MULTIPLE RECENT SESSIONS FROM DIFFERENT LOCATIONS
  if (recentSessions.length >= 3) {
    // GET UNIQUE RECENT LOCATIONS
    const recentLocations = recentSessions
      .map((s) => s.locationCountry)
      .filter((c) => c && c !== "Unknown");
    // GET UNIQUE RECENT LOCATIONS
    const uniqueRecentLocations = [...new Set(recentLocations)];
    // IF NEW LOCATION IS DIFFERENT AND MULTIPLE RECENT LOCATIONS EXIST
    if (
      uniqueRecentLocations.length >= 2 &&
      newLocationInfo.country !== "Unknown" &&
      !uniqueRecentLocations.includes(newLocationInfo.country)
    ) {
      reasons.push("Multiple logins from different locations in short time");
    }
  }
  // GET EXISTING IPS
  const existingIps = existingSessions
    .map((s) => s.ipAddress)
    .filter((ip) => ip && ip !== "unknown");
  // IF NEW IP IS COMPLETELY DIFFERENT FROM ALL EXISTING IPS
  if (
    existingIps.length > 0 &&
    newIpAddress !== "unknown" &&
    !existingIps.includes(newIpAddress)
  ) {
    // GET NEW IP PARTS
    const newIpParts = newIpAddress.split(".").slice(0, 2).join(".");
    // GET EXISTING IPS PARTS
    const existingIpParts = existingIps.map((ip) =>
      ip.split(".").slice(0, 2).join(".")
    );
    // GET UNIQUE IPS PARTS
    const uniqueIpSubnets = [...new Set(existingIpParts)];
    // IF NEW IP IS FROM DIFFERENT SUBNET
    if (!uniqueIpSubnets.includes(newIpParts)) {
      // ADD REASON FOR SUSPICIOUS LOGIN FROM DIFFERENT IP SUBNET
      reasons.push("Login from different IP subnet");
    }
  }
  // IF ANY REASONS FOUND, RETURN SUSPICIOUS ACTIVITY
  if (reasons.length > 0) {
    // RETURN SUSPICIOUS ACTIVITY
    return {
      isSuspicious: true,
      reason: reasons.join("; "),
    };
  }
  // NOT SUSPICIOUS ACTIVITY
  return { isSuspicious: false, reason: "" };
};

/**
 * UPDATE SESSION SUSPICIOUS FLAG
 * UPDATES THE SUSPICIOUS FLAG ON A SESSION
 * @param sessionId - Session ID
 * @param isSuspicious - Is Suspicious Flag
 * @param reason - Suspicious Reason
 * @returns Updated Session or Null
 */
// <== UPDATE SESSION SUSPICIOUS FLAG ==>
export const updateSessionSuspiciousFlag = async (
  sessionId: string,
  isSuspicious: boolean,
  reason: string
): Promise<any | null> => {
  // FIND SESSION BY SESSION ID
  const session = await Session.findOne({ sessionId }).exec();
  // IF SESSION NOT FOUND, RETURN NULL
  if (!session) {
    // RETURN NULL
    return null;
  }
  // UPDATE SUSPICIOUS FLAG
  session.isSuspicious = isSuspicious;
  // UPDATE SUSPICIOUS REASON
  session.suspiciousReason = reason;
  // SAVE SESSION
  await session.save();
  // RETURN UPDATED SESSION
  return session;
};

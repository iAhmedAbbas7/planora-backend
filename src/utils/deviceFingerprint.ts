// <== IMPORTS ==>
import crypto from "crypto";
import { Request } from "express";
import { UAParser } from "ua-parser-js";

// <== DEVICE INFO TYPE ==>
export type DeviceInfo = {
  // <== DEVICE TYPE ==>
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  // <== DEVICE NAME ==>
  deviceName: string;
  // <== BROWSER NAME ==>
  browserName: string;
  // <== BROWSER VERSION ==>
  browserVersion: string;
  // <== OPERATING SYSTEM ==>
  operatingSystem: string;
  // <== USER AGENT ==>
  userAgent: string;
};

/**
 * GET IP ADDRESS FROM REQUEST
 * @param req - Express Request Object
 * @returns IP Address String
 */
// <== GET IP ADDRESS ==>
export const getIpAddress = (req: Request): string => {
  // CHECKING FOR X-FORWARDED-FOR HEADER (PROXY/LOAD BALANCER)
  const forwardedFor = req.headers["x-forwarded-for"];
  // IF X-FORWARDED-FOR EXISTS
  if (forwardedFor) {
    // IF IT'S AN ARRAY, GET FIRST ELEMENT
    if (Array.isArray(forwardedFor)) {
      // RETURN FIRST ELEMENT
      return forwardedFor[0] || "";
    }
    // IF IT'S A STRING, SPLIT BY COMMA AND GET FIRST
    return forwardedFor.split(",")[0]?.trim() || "";
  }
  // CHECKING FOR X-REAL-IP HEADER
  const realIp = req.headers["x-real-ip"];
  // IF X-REAL-IP EXISTS
  if (realIp) {
    // IF IT'S AN ARRAY, GET FIRST ELEMENT
    if (Array.isArray(realIp)) {
      // RETURN FIRST ELEMENT
      return realIp[0] || "";
    }
    // RETURN AS STRING
    return realIp;
  }
  // FALLBACK TO REQUEST SOCKET REMOTE ADDRESS
  return req.socket.remoteAddress || req.ip || "unknown";
};

/**
 * EXTRACT DEVICE INFORMATION FROM REQUEST
 * @param req - Express Request Object
 * @returns Device Info Object
 */
// <== EXTRACT DEVICE INFO ==>
export const extractDeviceInfo = (req: Request): DeviceInfo => {
  // GET USER AGENT FROM REQUEST HEADERS
  const userAgent = req.headers["user-agent"] || "";
  // INITIALIZE UA PARSER
  const parser = new UAParser(userAgent);
  // GET PARSED RESULTS
  const result = parser.getResult();
  // DETERMINE DEVICE TYPE
  let deviceType: "desktop" | "mobile" | "tablet" | "unknown" = "unknown";
  // IF DEVICE TYPE IS MOBILE
  if (result.device.type === "mobile") {
    // SET DEVICE TYPE TO MOBILE
    deviceType = "mobile";
  }
  // IF DEVICE TYPE IS TABLET
  else if (result.device.type === "tablet") {
    // SET DEVICE TYPE TO TABLET
    deviceType = "tablet";
  }
  // IF DEVICE TYPE IS NOT MOBILE OR TABLET, ASSUME DESKTOP
  else if (result.device.type === undefined || result.device.type === null) {
    // SET DEVICE TYPE TO DESKTOP
    deviceType = "desktop";
  }
  // GET BROWSER NAME
  const browserName = result.browser.name || "Unknown Browser";
  // GET BROWSER VERSION
  const browserVersion = result.browser.version || "";
  // GET OPERATING SYSTEM
  const osName = result.os.name || "Unknown OS";
  // GET OPERATING SYSTEM VERSION
  const osVersion = result.os.version || "";
  // GENERATE OPERATING SYSTEM
  const operatingSystem = osVersion ? `${osName} ${osVersion}` : osName;
  // GENERATE DEVICE NAME
  const deviceName = result.device.model
    ? `${result.device.vendor || ""} ${result.device.model}`.trim()
    : `${osName} Device`;
  // RETURN DEVICE INFO
  return {
    deviceType,
    deviceName,
    browserName,
    browserVersion,
    operatingSystem,
    userAgent,
  };
};

/**
 * GENERATE DEVICE FINGERPRINT HASH (INCLUDES IP ADDRESS)
 * @param deviceInfo - Device Info Object
 * @param ipAddress - IP Address
 * @returns Device Fingerprint Hash
 */
// <== GENERATE DEVICE FINGERPRINT ==>
export const generateDeviceFingerprint = (
  deviceInfo: DeviceInfo,
  ipAddress: string
): string => {
  // IMPORT CRYPTO
  const crypto = require("crypto");
  // CREATE FINGERPRINT STRING
  const fingerprintString = `${deviceInfo.browserName}-${deviceInfo.browserVersion}-${deviceInfo.operatingSystem}-${deviceInfo.deviceType}-${ipAddress}`;
  // GENERATE HASH
  const hash = crypto
    .createHash("sha256")
    .update(fingerprintString)
    .digest("hex");
  // RETURN HASH
  return hash;
};

/**
 * GENERATE TRUSTED DEVICE FINGERPRINT HASH (WITHOUT IP ADDRESS)
 * @param deviceInfo - Device Info Object
 * @returns Trusted Device Fingerprint Hash
 */
// <== GENERATE TRUSTED DEVICE FINGERPRINT ==>
export const generateTrustedDeviceFingerprint = (
  deviceInfo: DeviceInfo
): string => {
  // EXTRACT MAJOR BROWSER VERSION ONLY (E.G., "120" FROM "120.0.6099.130")
  const majorBrowserVersion = deviceInfo.browserVersion.split(".")[0] || "";
  // CREATE FINGERPRINT STRING WITHOUT IP AND WITH MAJOR VERSION ONLY
  const fingerprintString = `${deviceInfo.browserName}-${majorBrowserVersion}-${deviceInfo.operatingSystem}-${deviceInfo.deviceType}`;
  // GENERATE HASH
  const hash = crypto
    .createHash("sha256")
    .update(fingerprintString)
    .digest("hex");
  // RETURN HASH
  return hash;
};

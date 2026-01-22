// <== IMPORTS ==>
import {
  getActiveSessions,
  revokeSession,
  revokeAllOtherSessions,
  trustDevice,
  untrustDevice,
} from "../utils/sessionManager.js";
import mongoose from "mongoose";
import { Request, Response } from "express";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { sendSessionRevoked } from "../utils/mailer.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET ALL ACTIVE SESSIONS
 * RETURNS ALL ACTIVE SESSIONS FOR THE CURRENT USER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ALL ACTIVE SESSIONS ==>
export const getSessions = expressAsyncHandler(
  async (req: Request, res: Response) => {
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
    // GET ACTIVE SESSIONS
    const sessions = await getActiveSessions(
      new mongoose.Types.ObjectId(userId)
    );
    // RETURN SESSIONS
    res.status(200).json({
      message: "Sessions retrieved successfully!",
      success: true,
      data: {
        sessions: sessions.map((session: any) => ({
          sessionId: session.sessionId,
          deviceType:
            session.deviceInfo?.deviceType || session.deviceType || "unknown",
          deviceName:
            session.deviceInfo?.deviceName || session.deviceName || "",
          browserName:
            session.deviceInfo?.browserName || session.browserName || "",
          browserVersion:
            session.deviceInfo?.browserVersion || session.browserVersion || "",
          operatingSystem:
            session.deviceInfo?.operatingSystem ||
            session.operatingSystem ||
            "",
          ipAddress: session.ipAddress || "",
          locationCountry:
            session.location?.country || session.locationCountry || "",
          locationCity: session.location?.city || session.locationCity || "",
          locationRegion:
            session.location?.region || session.locationRegion || "",
          isTrusted: session.isTrusted || false,
          lastActivity: session.lastActivity || session.createdAt,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          isSuspicious: session.isSuspicious || false,
          suspiciousReason: session.suspiciousReason || "",
        })),
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * REVOKE SESSION
 * REVOKES A SPECIFIC SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REVOKE SESSION ==>
export const revokeSessionController = expressAsyncHandler(
  async (req: Request, res: Response) => {
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
    // GET SESSION ID FROM REQUEST PARAMS
    const { sessionId } = req.params;
    // VALIDATING SESSION ID
    if (!sessionId) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Session ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FIND SESSION TO GET DEVICE INFO FOR EMAIL
    const session = await Session.findOne({
      sessionId,
      userId: new mongoose.Types.ObjectId(userId),
    })
      .lean()
      .exec();
    // IF SESSION NOT FOUND, RETURN ERROR
    if (!session) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Session not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // REVOKE SESSION
    const revokedSession = await revokeSession(
      sessionId,
      new mongoose.Types.ObjectId(userId)
    );
    // IF SESSION NOT REVOKED, RETURN ERROR
    if (!revokedSession) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Session not found or already revoked!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET USER FOR EMAIL
    const user = await User.findById(userId).lean().exec();
    // IF USER FOUND, SEND EMAIL NOTIFICATION
    if (user) {
      // TRY TO SEND EMAIL
      try {
        // EXTRACT DEVICE TYPE INFO FROM SESSION
        const deviceType =
          (session as any).deviceInfo?.deviceType ||
          session.deviceType ||
          "unknown";
        // EXTRACT DEVICE NAME FROM SESSION
        const deviceName =
          (session as any).deviceInfo?.deviceName || session.deviceName || "";
        // EXTRACT BROWSER NAME FROM SESSION
        const browserName =
          (session as any).deviceInfo?.browserName || session.browserName || "";
        // EXTRACT BROWSER VERSION FROM SESSION
        const browserVersion =
          (session as any).deviceInfo?.browserVersion ||
          session.browserVersion ||
          "";
        // EXTRACT OPERATING SYSTEM FROM SESSION
        const operatingSystem =
          (session as any).deviceInfo?.operatingSystem ||
          session.operatingSystem ||
          "";
        // EXTRACT USER AGENT FROM SESSION
        const userAgent =
          (session as any).deviceInfo?.userAgent || session.userAgent || "";
        // EXTRACT LOCATION COUNTRY FROM SESSION
        const country =
          (session as any).location?.country || session.locationCountry || "";
        // EXTRACT LOCATION CITY FROM SESSION
        const city =
          (session as any).location?.city || session.locationCity || "";
        // EXTRACT LOCATION REGION FROM SESSION
        const region =
          (session as any).location?.region || session.locationRegion || "";
        // SEND SESSION REVOKED EMAIL
        await sendSessionRevoked(
          user.email,
          user.name,
          {
            deviceType: deviceType as
              | "desktop"
              | "mobile"
              | "tablet"
              | "unknown",
            deviceName,
            browserName,
            browserVersion,
            operatingSystem,
            userAgent,
          },
          {
            country,
            city,
            region,
            countryCode: country || "XX",
          },
          new Date()
        );
      } catch (error) {
        // LOG ERROR BUT DON'T FAIL THE REQUEST
        console.error("Error sending session revoked email:", error);
      }
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Session revoked successfully!",
      success: true,
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * REVOKE ALL OTHER SESSIONS
 * REVOKES ALL SESSIONS EXCEPT THE CURRENT ONE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REVOKE ALL OTHER SESSIONS ==>
export const revokeAllOtherSessionsController = expressAsyncHandler(
  async (req: Request, res: Response) => {
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
    // GET CURRENT SESSION ID FROM REQUEST BODY, OR COOKIE AS FALLBACK
    let sessionId = req.body.currentSessionId || req.cookies?.sessionId;
    // IF CURRENT SESSION ID NOT PROVIDED, RETURN ERROR
    if (!sessionId) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Current session ID is required! Please provide it in the request body or ensure the sessionId cookie is set.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VERIFY THE SESSION EXISTS AND BELONGS TO THE USER
    const currentSession = await Session.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      sessionId: sessionId,
      revoked: false,
    })
      .lean()
      .exec();
    // IF CURRENT SESSION NOT FOUND, RETURN ERROR
    if (!currentSession) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Current session not found or already revoked!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // REVOKE ALL OTHER SESSIONS
    const revokedCount = await revokeAllOtherSessions(
      new mongoose.Types.ObjectId(userId),
      sessionId
    );
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: `Successfully revoked ${revokedCount} session(s)!`,
      success: true,
      data: {
        revokedCount,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * TRUST DEVICE
 * MARKS A DEVICE AS TRUSTED
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== TRUST DEVICE ==>
export const trustDeviceController = expressAsyncHandler(
  async (req: Request, res: Response) => {
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
    // GET SESSION ID FROM REQUEST PARAMS
    const { sessionId } = req.params;
    // VALIDATING SESSION ID
    if (!sessionId) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Session ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // TRUST DEVICE
    const trustedSession = await trustDevice(
      sessionId,
      new mongoose.Types.ObjectId(userId)
    );
    // IF SESSION NOT FOUND, RETURN ERROR
    if (!trustedSession) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Session not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Device marked as trusted!",
      success: true,
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * UNTRUST DEVICE
 * REMOVES TRUSTED STATUS FROM A DEVICE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNTRUST DEVICE ==>
export const untrustDeviceController = expressAsyncHandler(
  async (req: Request, res: Response) => {
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
    // GET SESSION ID FROM REQUEST PARAMS
    const { sessionId } = req.params;
    // VALIDATING SESSION ID
    if (!sessionId) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Session ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // UNTRUST DEVICE
    const untrustedSession = await untrustDevice(
      sessionId,
      new mongoose.Types.ObjectId(userId)
    );
    // IF SESSION NOT FOUND, RETURN ERROR
    if (!untrustedSession) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Session not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Device trust removed!",
      success: true,
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

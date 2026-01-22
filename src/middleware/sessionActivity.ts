// <== IMPORTS ==>
import { Session } from "../models/session.model.js";
import { Request, Response, NextFunction } from "express";
import { getIpAddress } from "../utils/deviceFingerprint.js";
import { updateSessionActivity } from "../utils/sessionManager.js";

/**
 * SESSION ACTIVITY UPDATER MIDDLEWARE
 * UPDATES THE LAST ACTIVITY TIMESTAMP FOR THE CURRENT SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @param next - Next Function
 * @returns Next Function
 */
// <== SESSION ACTIVITY UPDATER MIDDLEWARE ==>
export const updateSessionActivityMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as any).id;
    // IF USER ID NOT FOUND, CONTINUE (NOT AUTHENTICATED REQUEST)
    if (!userId) {
      // CONTINUE TO NEXT MIDDLEWARE
      next();
      // RETURN
      return;
    }
    // GET SESSION ID FROM COOKIE (PRIMARY METHOD - MOST ACCURATE)
    const sessionIdFromCookie = req.cookies?.sessionId;
    // IF SESSION ID FROM COOKIE EXISTS, USE IT DIRECTLY
    if (sessionIdFromCookie) {
      // FIND SESSION BY SESSION ID FROM COOKIE
      const sessionFromCookie = await Session.findOne({
        userId,
        sessionId: sessionIdFromCookie,
        revoked: false,
        expiresAt: { $gt: new Date() },
      })
        .lean()
        .exec();
      // IF SESSION FOUND, UPDATE ACTIVITY
      if (sessionFromCookie) {
        await updateSessionActivity(sessionFromCookie.sessionId);
        next();
        return;
      }
    }
    // FALLBACK: GET IP ADDRESS FROM REQUEST
    const ipAddress = getIpAddress(req);
    // FALLBACK: FIND SESSION BY IP ADDRESS (IF COOKIE NOT AVAILABLE)
    const sessionByIp = await Session.findOne({
      userId,
      ipAddress,
      revoked: false,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastActivity: -1 })
      .lean()
      .exec();
    // IF SESSION FOUND BY IP, UPDATE ACTIVITY
    if (sessionByIp) {
      // UPDATE SESSION ACTIVITY
      await updateSessionActivity(sessionByIp.sessionId);
    }
    // CONTINUE TO NEXT MIDDLEWARE
    next();
  } catch (error) {
    // LOG ERROR BUT DON'T BREAK THE REQUEST
    console.error("Error updating session activity:", error);
    // CONTINUE TO NEXT MIDDLEWARE EVEN IF UPDATE FAILS
    next();
  }
};

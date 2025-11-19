// <== IMPORTS ==>
import jwt, { JwtPayload } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

/**
 * AUTHENTICATION
 * @param req - Request Object
 * @param res - Response Object
 * @param next - Next Function
 * @returns void
 */
const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // CHECKING FOR ACCESS TOKEN IN REQUEST COOKIES
  const accessToken = req.cookies.accessToken;
  // IF NO ACCESS TOKEN FOUND
  if (!accessToken) {
    // SENDING UNAUTHORIZED RESPONSE (CLIENT SHOULD TRY REFRESH TOKEN)
    res.status(401).json({
      message: "Unauthorized to Perform Action!",
      success: false,
      code: "NO_ACCESS_TOKEN",
    });
    return;
  }
  // INITIATING DECODED TOKEN
  let decodedToken: JwtPayload | undefined;
  try {
    // DECODING THE ACCESS TOKEN as JwtPayload
    decodedToken = jwt.verify(accessToken, process.env.AT_SECRET!) as JwtPayload;
  } catch (error: any) {
    // IF TOKEN EXPIRED, CLIENT SHOULD CALL REFRESH TOKEN ENDPOINT
    if (error.name === "TokenExpiredError") {
      // SENDING UNAUTHORIZED RESPONSE WITH EXPIRED TOKEN CODE
      res.status(401).json({
        message: "Access token expired!",
        success: false,
        code: "ACCESS_TOKEN_EXPIRED",
      });
      return;
    }
    // IF INVALID TOKEN OR OTHER ERRORS
    // SENDING UNAUTHORIZED RESPONSE
    res.status(401).json({
      message: "Invalid access token!",
      success: false,
      code: "INVALID_ACCESS_TOKEN",
    });
    return;
  }
  // RETRIEVING USER ID FROM DECODED TOKEN
  if (!decodedToken || !decodedToken.userId) {
    // SENDING UNAUTHORIZED RESPONSE
    res.status(401).json({
      message: "Unauthorized to Perform Action!",
      success: false,
      code: "INVALID_TOKEN_PAYLOAD",
    });
    return;
  }
  // SETTING USER ID IN REQUEST OBJECT
  (req as any).id = decodedToken.userId as string;
  // CALLING NEXT MIDDLEWARE
  next();
};

export default isAuthenticated;

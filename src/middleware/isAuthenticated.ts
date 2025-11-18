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
  // CHECKING FOR TOKEN IN REQUEST COOKIES
  const token = req.cookies.token;
  // IF NO TOKEN FOUND
  if (!token) {
    // SENDING UNAUTHORIZED RESPONSE
    res
      .status(401)
      .json({ message: "Unauthorized to Perform Action!", success: false });
    return;
  }
  // INITIATING DECODED TOKEN
  let decodedToken: JwtPayload | undefined;
  try {
    // DECODING THE ACCESS TOKEN as JwtPayload
    decodedToken = jwt.verify(token, process.env.AT_SECRET!) as JwtPayload;
  } catch (error: any) {
    // IF TOKEN EXPIRED TRIGGERING REFRESH TOKEN ON CLIENT SIDE
    if (error.name === "TokenExpiredError") {
      // LOGGING ERROR MESSAGE
      console.log(error);
      // SENDING UNAUTHORIZED RESPONSE
      res.status(401).json({
        message: "Unauthorized to Perform Action!",
        success: false,
      });
      return;
    }
    // IF INVALID TOKEN OR OTHER ERRORS
    // LOGGING ERROR MESSAGE
    console.log(error);
    // SENDING UNAUTHORIZED RESPONSE
    res.status(401).json({ message: "Invalid Token Found", success: false });
    return;
  }
  // RETRIEVING USER ID FROM DECODED TOKEN
  if (!decodedToken) {
    // SENDING UNAUTHORIZED RESPONSE
    res
      .status(401)
      .json({ message: "Unauthorized to Perform Action!", success: false });
    return;
  }
  (req as any).id = decodedToken.userId as string;
  // CALLING NEXT MIDDLEWARE
  next();
};

export default isAuthenticated;

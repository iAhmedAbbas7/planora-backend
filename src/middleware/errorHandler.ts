// <== IMPORTS ==>
import { logEvents } from "./logger.js";
import { Request, Response, NextFunction } from "express";

/**
 * ERROR HANDLER FUNCTION
 * @param err - Error Object
 * @param req - Request Object
 * @param res - Response Object
 * @param _next - Next Function
 * @returns void
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // LOGGING ERROR MESSAGE
  logEvents(
    `${err.name} : ${err.message}\t${req.method}\t${req.url}\t${req.headers.origin}`,
    "errorLog.log"
  );
  // LOGGING ERROR STACK
  console.log(err.stack);
  // SETTING STATUS CODE
  const status = res.statusCode ? res.statusCode : 500;
  // SETTING STATUS CODE
  res.status(status);
  // SENDING ERROR RESPONSE
  res.json({ message: err.message, success: false });
};

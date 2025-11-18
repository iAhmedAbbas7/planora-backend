// <== IMPORTS ==>
import fs from "fs";
import path from "path";
import { format } from "date-fns";
import { v4 as uuid } from "uuid";
import fsPromises from "fs/promises";
import { getDirName } from "../utils/getDirName.js";
import { Request, Response, NextFunction } from "express";

// <== DIRNAME ==>
const __dirname = getDirName(import.meta.url);

/**
 * MAIN LOGGER FUNCTION
 * @param message - Message to log
 * @param logFileName - Name of the log file
 * @returns void
 */
export const logEvents = async (
  message: string,
  logFileName: string
): Promise<void> => {
  // CREATING THE DATE & TIME FORMAT FOR LOG ITEMS
  const dateTime = format(new Date(), "yyyyMMdd\tHH:mm:ss");
  // CREATING THE LOG ITEM
  const logItem = `${dateTime}\t${uuid()}\t${message}\n`;
  try {
    // CHECKING IF THE LOGS DIRECTORY EXISTS
    if (!fs.existsSync(path.join(__dirname, "..", "..", "logs"))) {
      await fsPromises.mkdir(path.join(__dirname, "..", "..", "logs"));
    }
    // APPENDING THE LOG ITEM TO THE LOG FILE
    await fsPromises.appendFile(
      path.join(__dirname, "..", "..", "logs", logFileName),
      logItem
    );
  } catch (error: any) {
    // LOGGING ERROR MESSAGE
    console.log(error || "Unknown Error");
    // THROWING ERROR
    throw new Error(
      `Internal Server Error -_- ::: ${error?.message || "Unknown Error"}`
    );
  }
};

/**
 * LOGGER MIDDLEWARE
 * @param req - Request Object
 * @param _res - Response Object
 * @param next - Next Function
 * @returns void
 */
export const logger = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // LOGGING REQUEST
  logEvents(`${req.method}\t${req.url}\t${req.headers.origin}`, "reqLog.log");
  // LOGGING REQUEST PATH
  console.log(`${req.method} ${req.path}`);
  // CALLING NEXT MIDDLEWARE
  next();
};

// <== IMPORTS ==>
import allowedOrigins from "./allowedOrigins.js";

// <== CORS OPTIONS ==>
const corsOptions = {
  // <== ORIGIN ==>
  origin: (
    // <== ORIGIN FUNCTION ==>
    origin: string | undefined,
    // <== CALLBACK FUNCTION ==>
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    if (allowedOrigins.indexOf(origin!) !== -1 || !origin) {
      // <== ALLOW ORIGIN ==>
      callback(null, true);
    } else {
      // <== NOT ALLOW ORIGIN ==>
      callback(new Error("Not Allowed by CORS"));
    }
  },
  // <== CREDENTIALS ==>
  credentials: true,
  // <== OPTIONS SUCCESS STATUS ==>
  optionsSuccessStatus: 200,
};

export default corsOptions;

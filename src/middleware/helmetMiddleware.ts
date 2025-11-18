// <== IMPORTS ==>
import helmet from "helmet";

/**
 * HELMET MIDDLEWARE CONFIGURATION
 * @returns Helmet Middleware
 */
const helmetMiddleware = (): ReturnType<typeof helmet> => {
  // RETURNING HELMET MIDDLEWARE
  return helmet({
    // CONTENT SECURITY POLICY
    contentSecurityPolicy: false,
    // CROSS ORIGIN RESOURCE SHARING
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    // X-XSS-PROTECTION
    xssFilter: false,
    // STRICT-TRANSPORT-SECURITY
    strictTransportSecurity: false,
    // X-CONTENT-TYPE-OPTIONS
    xContentTypeOptions: false,
    // REFERRER-POLICY
    referrerPolicy: false,
  });
};

export default helmetMiddleware;

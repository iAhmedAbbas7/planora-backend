// <== IMPORTS ==>
import rateLimit from "express-rate-limit";

/**
 * AUTH ROUTES LIMITER
 * @returns Auth Limiter
 */
export const authLimiter = rateLimit({
  // <== WINDOW MS ==>
  windowMs: 10 * 60 * 1000,
  // <== LIMIT ==>
  limit: 5,
  // <== MESSAGE ==>
  message: {
    // <== SUCCESS FIELD ==>
    success: false,
    // <== MESSAGE FIELD ==>
    message: "Too many Attempts, Please try again after 15 Minutes.",
  },
  // <== STANDARD HEADERS ==>
  standardHeaders: true,
  // <== LEGACY HEADERS ==>
  legacyHeaders: false,
});

/**
 * GLOBAL RATE LIMITER
 * @returns Global Limiter
 */
export const globalLimiter = rateLimit({
  // <== WINDOW MS ==>
  windowMs: 60 * 60 * 1000,
  // <== LIMIT ==>
  limit: 10000,
  // <== MESSAGE ==>
  message: {
    // <== SUCCESS FIELD ==>
    success: false,
    // <== MESSAGE FIELD ==>
    message: "Too many Attempts, Please try again after 1 Hour.",
  },
  // <== STANDARD HEADERS ==>
  standardHeaders: true,
  // <== LEGACY HEADERS ==>
  legacyHeaders: false,
});

/**
 * TWO FACTOR AUTHENTICATION RATE LIMITER
 * @returns 2FA Limiter
 */
export const twoFactorLimiter = rateLimit({
  // <== WINDOW MS ==>
  windowMs: 15 * 60 * 1000,
  // <== LIMIT ==>
  limit: 3,
  // <== MESSAGE ==>
  message: {
    // <== SUCCESS FIELD ==>
    success: false,
    // <== MESSAGE FIELD ==>
    message: "Too many attempts. Please try again after 15 minutes.",
  },
  // <== STANDARD HEADERS ==>
  standardHeaders: true,
  // <== LEGACY HEADERS ==>
  legacyHeaders: false,
});

/**
 * DEVICE VERIFICATION RATE LIMITER
 * @returns Device Verification Limiter
 */
export const deviceVerificationLimiter = rateLimit({
  // <== WINDOW MS ==>
  windowMs: 15 * 60 * 1000,
  // <== LIMIT ==>
  limit: 5,
  // <== MESSAGE ==>
  message: {
    // <== SUCCESS FIELD ==>
    success: false,
    // <== MESSAGE FIELD ==>
    message:
      "Too many verification attempts. Please try again after 15 minutes.",
  },
  // <== STANDARD HEADERS ==>
  standardHeaders: true,
  // <== LEGACY HEADERS ==>
  legacyHeaders: false,
});

/**
 * DEVICE VERIFICATION CODE RATE LIMITER (FOR CODE VERIFICATION)
 * @returns Device Verification Code Limiter
 */
export const deviceVerificationCodeLimiter = rateLimit({
  // <== WINDOW MS ==>
  windowMs: 10 * 60 * 1000,
  // <== LIMIT ==>
  limit: 10,
  // <== MESSAGE ==>
  message: {
    // <== SUCCESS FIELD ==>
    success: false,
    // <== MESSAGE FIELD ==>
    message:
      "Too many code verification attempts. Please try again after 10 minutes.",
  },
  // <== STANDARD HEADERS ==>
  standardHeaders: true,
  // <== LEGACY HEADERS ==>
  legacyHeaders: false,
});

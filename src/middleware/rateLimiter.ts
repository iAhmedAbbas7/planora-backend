// <== IMPORTS ==>
import rateLimit from "express-rate-limit";

/**
 * AUTH ROUTES LIMITER
 * @returns Auth Limiter
 */
export const authLimiter = rateLimit({
  // WINDOW MS
  windowMs: 10 * 60 * 1000,
  // LIMIT
  limit: 5,
  // MESSAGE
  message: {
    success: false,
    message: "Too many Attempts, Please try again after 15 Minutes.",
  },
  // STANDARD HEADERS
  standardHeaders: true,
  // LEGACY HEADERS
  legacyHeaders: false,
});

// GLOBAL RATE LIMITER
/**
 * GLOBAL RATE LIMITER
 * @returns Global Limiter
 */
export const globalLimiter = rateLimit({
  // WINDOW MS
  windowMs: 60 * 60 * 1000,
  // LIMIT
  limit: 10000,
  // MESSAGE
  message: {
    success: false,
    message: "Too many Attempts, Please try again after 1 Hour.",
  },
  // STANDARD HEADERS
  standardHeaders: true,
  // LEGACY HEADERS
  legacyHeaders: false,
});

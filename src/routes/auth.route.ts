// <== IMPORTS ==>
import {
  deviceVerificationLimiter,
  deviceVerificationCodeLimiter,
} from "../middleware/rateLimiter.js";
import {
  signup,
  login,
  logout,
  refreshToken,
  oauthCallback,
  googleOAuthCallback,
  getCurrentUser,
  verifyEmail,
  resendVerificationCode,
  requestPasswordReset,
  resetPassword,
  verify2FA,
  requestAccountRecovery,
  verifyAccountRecovery,
  getOnboardingStatus,
  completeOnboarding,
} from "../controllers/auth.controller.js";
import {
  requestDeviceVerification,
  verifyDeviceCode,
  verifyDevice2FA,
  completeDeviceLogin,
} from "../controllers/deviceVerification.controller.js";
import {
  initiateGitHubLink,
  handleGitHubCallback,
} from "../controllers/github.controller.js";
import express from "express";
import passport from "../config/passport.js";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// GOOGLE OAUTH INITIATION (WITH MODE AND PLAN SUPPORT)
router.get("/google", (req, res, next) => {
  // GET MODE FROM QUERY (LOGIN OR REGISTER), DEFAULT TO REGISTER
  const mode = req.query.mode === "login" ? "login" : "register";
  // GET PLAN FROM QUERY (OPTIONAL)
  const plan = req.query.plan || null;
  // GET BILLING CYCLE FROM QUERY (OPTIONAL)
  const billingCycle = req.query.cycle || "monthly";
  // CREATE STATE OBJECT TO PASS THROUGH OAUTH PROCESS
  const state = JSON.stringify({ mode, plan, billingCycle });
  // AUTHENTICATE WITH GOOGLE
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: state,
  })(req, res, next);
});
// GITHUB OAUTH INITIATION (FOR SIGNUP/LOGIN WITH MODE AND PLAN SUPPORT)
router.get("/github", (req, res, next) => {
  // GET MODE FROM QUERY (LOGIN OR REGISTER), DEFAULT TO REGISTER
  const mode = req.query.mode === "login" ? "login" : "register";
  // GET PLAN FROM QUERY (OPTIONAL)
  const plan = req.query.plan || null;
  // GET BILLING CYCLE FROM QUERY (OPTIONAL)
  const billingCycle = req.query.cycle || "monthly";
  // CREATE STATE OBJECT TO PASS THROUGH OAUTH PROCESS
  const state = JSON.stringify({ mode, plan, billingCycle });
  // AUTHENTICATE WITH GITHUB
  passport.authenticate("github", {
    scope: ["user:email", "read:user", "repo"],
    state: state,
  })(req, res, next);
});
// REQUEST DEVICE VERIFICATION ROUTE
router.post(
  "/device-verification/request",
  deviceVerificationLimiter,
  requestDeviceVerification
);
// VERIFY DEVICE CODE ROUTE
router.post(
  "/device-verification/verify-code",
  deviceVerificationCodeLimiter,
  verifyDeviceCode
);
// VERIFY DEVICE 2FA ROUTE
router.post(
  "/device-verification/verify-2fa",
  deviceVerificationCodeLimiter,
  verifyDevice2FA
);
// COMPLETE DEVICE LOGIN ROUTE
router.post(
  "/device-verification/complete",
  deviceVerificationCodeLimiter,
  completeDeviceLogin
);
// USER LOGIN ROUTE
router.post("/login", login);
// USER LOGOUT ROUTE
router.post("/logout", logout);
// USER SIGNUP ROUTE
router.post("/signup", signup);
// VERIFY 2FA ROUTE
router.post("/verify-2fa", verify2FA);
// REFRESH TOKEN ROUTE
router.post("/refresh", refreshToken);
// VERIFY EMAIL ROUTE
router.post("/verify-email", verifyEmail);
// RESET PASSWORD ROUTE
router.post("/reset-password", resetPassword);
// GET CURRENT USER ROUTE
router.get("/me", isAuthenticated, getCurrentUser);
// REQUEST PASSWORD RESET ROUTE
router.post("/forgot-password", requestPasswordReset);
// RESEND VERIFICATION CODE ROUTE
router.post("/resend-verification", resendVerificationCode);
// VERIFY ACCOUNT RECOVERY ROUTE
router.post("/account-recovery/verify", verifyAccountRecovery);
// GITHUB OAUTH INITIATION (FOR LINKING TO EXISTING ACCOUNT)
router.get("/github/link", isAuthenticated, initiateGitHubLink);
// REQUEST ACCOUNT RECOVERY ROUTE
router.post("/account-recovery/request", requestAccountRecovery);
// GOOGLE OAUTH CALLBACK
router.get("/google/callback", googleOAuthCallback, oauthCallback);
// GITHUB OAUTH CALLBACK - HANDLES BOTH LOGIN/SIGNUP AND LINKING
router.get("/github/callback", handleGitHubCallback, oauthCallback);
// GET ONBOARDING STATUS ROUTE
router.get("/onboarding/status", isAuthenticated, getOnboardingStatus);
// COMPLETE ONBOARDING ROUTE
router.post("/onboarding/complete", isAuthenticated, completeOnboarding);

export default router;

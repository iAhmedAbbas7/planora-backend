// <== IMPORTS ==>
import {
  signup,
  login,
  logout,
  refreshToken,
  oauthCallback,
  googleOAuthCallback,
  githubOAuthCallback,
  getCurrentUser,
  verifyEmail,
  resendVerificationCode,
  requestPasswordReset,
  resetPassword,
  verify2FA,
  requestAccountRecovery,
  verifyAccountRecovery,
} from "../controllers/auth.controller.js";
import express from "express";
import passport from "../config/passport.js";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// GOOGLE OAUTH INITIATION
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);
// GITHUB OAUTH INITIATION
router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email"],
  })
);
// USER LOGIN ROUTE
router.post("/login", login);
// USER SIGNUP ROUTE
router.post("/signup", signup);
// USER LOGOUT ROUTE
router.post("/logout", logout);
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
// REQUEST ACCOUNT RECOVERY ROUTE
router.post("/account-recovery/request", requestAccountRecovery);
// GOOGLE OAUTH CALLBACK
router.get("/google/callback", googleOAuthCallback, oauthCallback);
// GITHUB OAUTH CALLBACK
router.get("/github/callback", githubOAuthCallback, oauthCallback);

export default router;

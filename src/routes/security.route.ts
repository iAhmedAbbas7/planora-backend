// <== IMPORTS ==>
import {
  requestEnable2FA,
  verifyEnable2FACode,
  verifyEnable2FATOTP,
  requestDisable2FA,
  verifyDisable2FACode,
  verifyDisable2FATOTP,
  resend2FACode,
  cancel2FA,
  get2FAStatus,
  regenerateBackupCodes,
} from "../controllers/twoFactor.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";
import { twoFactorLimiter } from "../middleware/rateLimiter.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// REGENERATE BACKUP CODES
router.post(
  "/2fa/regenerate-backup-codes",
  twoFactorLimiter,
  regenerateBackupCodes
);
// GET 2FA STATUS
router.get("/2fa/status", get2FAStatus);
// CANCEL 2FA
router.delete("/2fa/cancel", cancel2FA);
// RESEND 2FA CODE
router.post("/2fa/resend-code", twoFactorLimiter, resend2FACode);
// REQUEST 2FA CODE
router.post("/2fa/enable/request-code", twoFactorLimiter, requestEnable2FA);
// VERIFY 2FA CODE
router.post("/2fa/enable/verify-code", twoFactorLimiter, verifyEnable2FACode);
// VERIFY 2FA TOTP CODE
router.post("/2fa/enable/verify-totp", twoFactorLimiter, verifyEnable2FATOTP);
// DISABLE 2FA FLOW
router.post("/2fa/disable/request-code", twoFactorLimiter, requestDisable2FA);
// VERIFY 2FA CODE
router.post("/2fa/disable/verify-code", twoFactorLimiter, verifyDisable2FACode);
// VERIFY 2FA TOTP CODE
router.post("/2fa/disable/verify-totp", twoFactorLimiter, verifyDisable2FATOTP);

export default router;

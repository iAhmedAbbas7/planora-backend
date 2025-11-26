// <== IMPORTS ==>
import {
  getAccount,
  updateAccount,
  deleteAccount,
} from "../controllers/account.controller.js";
import {
  sendCurrentEmailCode,
  verifyCurrentEmailCode,
  verifyNewEmailCode,
  resendVerificationCode,
  cancelEmailChange,
} from "../controllers/emailChange.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET ACCOUNT INFO
router.get("/info", getAccount);
// UPDATE ACCOUNT
router.put("/update", updateAccount);
// DELETE ACCOUNT
router.delete("/delete", deleteAccount);
// CANCEL EMAIL CHANGE
router.delete("/email/cancel", cancelEmailChange);
// VERIFY NEW EMAIL CODE AND UPDATE EMAIL
router.post("/email/verify-new-code", verifyNewEmailCode);
// RESEND VERIFICATION CODE
router.post("/email/resend-code", resendVerificationCode);
// SEND VERIFICATION CODE TO CURRENT EMAIL
router.post("/email/verify-current", sendCurrentEmailCode);
// VERIFY CURRENT EMAIL CODE
router.post("/email/verify-current-code", verifyCurrentEmailCode);

export default router;

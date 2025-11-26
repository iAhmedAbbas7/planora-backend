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
import {
  sendPasswordChangeCode,
  verifyPasswordChangeCode,
  changePassword,
  resendPasswordChangeCode,
  cancelPasswordChange,
} from "../controllers/passwordChange.controller.js";
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
// CHANGE PASSWORD
router.post("/password/change", changePassword);
// CANCEL EMAIL CHANGE
router.delete("/email/cancel", cancelEmailChange);
// CANCEL PASSWORD CHANGE
router.delete("/password/cancel", cancelPasswordChange);
// VERIFY NEW EMAIL CODE AND UPDATE EMAIL
router.post("/email/verify-new-code", verifyNewEmailCode);
// RESEND VERIFICATION CODE
router.post("/email/resend-code", resendVerificationCode);
// SEND VERIFICATION CODE TO CURRENT EMAIL
router.post("/email/verify-current", sendCurrentEmailCode);
// SEND PASSWORD CHANGE CODE
router.post("/password/send-code", sendPasswordChangeCode);
// VERIFY PASSWORD CHANGE CODE
router.post("/password/verify-code", verifyPasswordChangeCode);
// RESEND PASSWORD CHANGE CODE
router.post("/password/resend-code", resendPasswordChangeCode);
// VERIFY CURRENT EMAIL CODE
router.post("/email/verify-current-code", verifyCurrentEmailCode);

export default router;

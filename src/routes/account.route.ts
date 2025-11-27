// <== IMPORTS ==>
import {
  getAccount,
  updateAccount,
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
import {
  sendDeletionCode,
  verifyDeletionCode,
  deleteAccount as flagAccountForDeletion,
  resendDeletionCode,
  cancelAccountDeletion,
} from "../controllers/accountDeletion.controller.js";
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
// CHANGE PASSWORD
router.post("/password/change", changePassword);
// CANCEL EMAIL CHANGE
router.delete("/email/cancel", cancelEmailChange);
// SEND ACCOUNT DELETION VERIFICATION CODE
router.post("/deletion/send-code", sendDeletionCode);
// CANCEL PASSWORD CHANGE
router.delete("/password/cancel", cancelPasswordChange);
// VERIFY ACCOUNT DELETION CODE
router.post("/deletion/verify-code", verifyDeletionCode);
// FLAG ACCOUNT FOR DELETION (SOFT DELETE)
router.post("/deletion/confirm", flagAccountForDeletion);
// RESEND ACCOUNT DELETION CODE
router.post("/deletion/resend-code", resendDeletionCode);
// CANCEL ACCOUNT DELETION
router.delete("/deletion/cancel", cancelAccountDeletion);
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

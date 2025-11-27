// <== IMPORTS ==>
import {
  sendAccountDeletionVerificationCode,
  sendAccountDeletionCodeVerified,
  sendAccountFlaggedForDeletion,
} from "../utils/mailer.js";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";
import { AccountDeletionVerification } from "../models/accountDeletionVerification.model.js";

/**
 * GENERATE 6-DIGIT VERIFICATION CODE
 * @returns 6-Digit Verification Code as String
 */
const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * SEND VERIFICATION CODE TO USER'S EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const sendDeletionCode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING USER BY ID
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER IS ALREADY FLAGGED FOR DELETION
  if (user.flaggedForDeletion) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Account is already flagged for deletion. Please log in to reactivate your account.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER
  await AccountDeletionVerification.deleteMany({ userId }).exec();
  // GENERATE VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // CREATING EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // CREATING NEW VERIFICATION RECORD
  const verificationRecord = await AccountDeletionVerification.create({
    userId,
    email: user.email.toLowerCase(),
    verificationCode,
    expiresAt,
  });
  // SEND VERIFICATION EMAIL TO USER'S EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO USER'S EMAIL
    await sendAccountDeletionVerificationCode(
      user.email,
      verificationCode,
      user.name
    );
  } catch (error) {
    // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
    await AccountDeletionVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Verification code sent to your email address.",
    data: {
      expiresIn: 600,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * VERIFY CODE AND ALLOW ACCOUNT DELETION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyDeletionCode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING CODE FROM REQUEST BODY
  const { code } = req.body;
  // IF CODE NOT PROVIDED, RETURN 400 ERROR
  if (!code) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await AccountDeletionVerification.findOne({
    userId,
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please request a new code.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF VERIFICATION RECORD IS EXPIRED
  if (new Date() > verificationRecord.expiresAt) {
    await AccountDeletionVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code has expired. Please request a new code.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF EMAIL IS ALREADY VERIFIED
  if (verificationRecord.emailVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Email has already been verified.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // INCREMENTING VERIFICATION ATTEMPTS
  verificationRecord.verificationAttempts += 1;
  // SETTING LAST VERIFICATION ATTEMPT TIMESTAMP TO NOW
  verificationRecord.lastVerificationAttemptAt = new Date();
  // CHECKING IF MAX ATTEMPTS EXCEEDED (5 ATTEMPTS)
  if (verificationRecord.verificationAttempts > 5) {
    // DELETE VERIFICATION RECORD IF MAX ATTEMPTS EXCEEDED
    await AccountDeletionVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(429).json({
      message: "Too many verification attempts. Please request a new code.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // SAVING UPDATED RECORD
  await verificationRecord.save();
  // CHECKING IF CODE MATCHES
  if (verificationRecord.verificationCode !== code) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid verification code. Please check and try again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // MARK EMAIL AS VERIFIED
  verificationRecord.emailVerified = true;
  // SAVING UPDATED RECORD
  await verificationRecord.save();
  // FINDING USER TO GET NAME AND EMAIL FOR CONFIRMATION EMAIL
  const user = await User.findById(userId).lean().exec();
  // IF USER FOUND, SEND VERIFICATION CONFIRMATION EMAIL
  if (user) {
    try {
      // SENDING VERIFICATION CONFIRMATION EMAIL
      await sendAccountDeletionCodeVerified(user.email, user.name);
    } catch (error) {
      // LOGGING ERROR BUT DON'T FAIL THE REQUEST
      console.error("Error sending verification confirmation email:", error);
    }
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message:
      "Email verified successfully. You can now confirm account deletion.",
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * FLAG ACCOUNT FOR DELETION (SOFT DELETE)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const deleteAccount = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await AccountDeletionVerification.findOne({
    userId,
    emailVerified: true,
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please start the process again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF VERIFICATION RECORD IS EXPIRED
  if (new Date() > verificationRecord.expiresAt) {
    // DELETE VERIFICATION RECORD IF EXPIRED
    await AccountDeletionVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification has expired. Please start the process again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING USER BY ID
  const user = await User.findById(userId).exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER IS ALREADY FLAGGED FOR DELETION
  if (user.flaggedForDeletion) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Account is already flagged for deletion.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FLAG ACCOUNT FOR DELETION
  user.flaggedForDeletion = true;
  // SETTING FLAGGED AT TO NOW
  user.flaggedAt = new Date();
  // SAVING USER
  await user.save();
  // DELETING VERIFICATION RECORD AFTER SUCCESSFUL FLAGGING
  await AccountDeletionVerification.findByIdAndDelete(
    verificationRecord._id
  ).exec();
  // SEND CONFIRMATION EMAIL
  try {
    // SENDING ACCOUNT FLAGGED FOR DELETION EMAIL
    await sendAccountFlaggedForDeletion(user.email, user.name, user.flaggedAt);
  } catch (error) {
    // LOGGING ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending account flagged email:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Account flagged for deletion. You will be logged out shortly.",
    data: {
      flaggedAt: user.flaggedAt,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * RESEND VERIFICATION CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const resendDeletionCode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING USER BY ID
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await AccountDeletionVerification.findOne({
    userId,
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please request a new code.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GENERATE NEW VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // RESET EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // SETTING VERIFICATION CODE TO VERIFICATION RECORD
  verificationRecord.verificationCode = verificationCode;
  // SETTING EXPIRATION DATE TO VERIFICATION RECORD
  verificationRecord.expiresAt = expiresAt;
  // SETTING VERIFICATION ATTEMPTS TO 0
  verificationRecord.verificationAttempts = 0;
  // SAVING UPDATED VERIFICATION RECORD
  await verificationRecord.save();
  // SEND VERIFICATION EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO USER'S EMAIL
    await sendAccountDeletionVerificationCode(
      user.email,
      verificationCode,
      user.name
    );
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Verification code resent to your email address.",
    data: {
      expiresIn: 600,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * CANCEL ACCOUNT DELETION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const cancelAccountDeletion = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETE VERIFICATION RECORD
  await AccountDeletionVerification.deleteMany({ userId }).exec();
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Account deletion process cancelled.",
  });
  // RETURNING FROM FUNCTION
  return;
});

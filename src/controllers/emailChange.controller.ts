// <== IMPORTS ==>
import {
  sendEmailChangeVerificationCodeCurrent,
  sendEmailChangeVerificationCodeNew,
  sendEmailChangeConfirmation,
  sendEmailChangeNotification,
} from "../utils/mailer.js";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";
import { EmailChangeVerification } from "../models/emailChangeVerification.model.js";

/**
 * GENERATE 6-DIGIT VERIFICATION CODE
 * @returns 6-Digit Verification Code as String
 */
const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * SEND VERIFICATION CODE TO CURRENT EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const sendCurrentEmailCode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING NEW EMAIL FROM REQUEST BODY
  const { newEmail } = req.body;
  // IF NEW EMAIL NOT PROVIDED, RETURN 400 ERROR
  if (!newEmail) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New email address is required!",
      success: false,
    });
    return;
  }
  // VALIDATE EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
  if (!emailRegex.test(newEmail)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
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
    return;
  }
  // NORMALIZING NEW EMAIL
  const normalizedNewEmail = newEmail.toLowerCase().trim();
  // IF NEW EMAIL IS SAME AS CURRENT EMAIL, RETURN 400 ERROR
  if (normalizedNewEmail === user.email.toLowerCase()) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New email cannot be the same as your current email!",
      success: false,
    });
    return;
  }
  // CHECKING IF NEW EMAIL ALREADY EXISTS
  const existingUser = await User.findOne({
    email: normalizedNewEmail,
  })
    .lean()
    .exec();
  // IF EMAIL ALREADY EXISTS, RETURN 409 ERROR
  if (existingUser) {
    // RETURNING ERROR RESPONSE
    res.status(409).json({
      message: "This email address is already in use!",
      success: false,
    });
    return;
  }
  // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER
  await EmailChangeVerification.deleteMany({ userId }).exec();
  // GENERATE VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // CREATING EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // CREATING NEW VERIFICATION RECORD
  const verificationRecord = await EmailChangeVerification.create({
    userId,
    currentEmail: user.email.toLowerCase(),
    newEmail: normalizedNewEmail,
    currentEmailCode: verificationCode,
    expiresAt,
  });
  // SEND VERIFICATION EMAIL TO CURRENT EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO CURRENT EMAIL
    await sendEmailChangeVerificationCodeCurrent(
      user.email,
      verificationCode,
      user.name,
      normalizedNewEmail
    );
  } catch (error) {
    // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
    await EmailChangeVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again.",
      success: false,
    });
    return;
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Verification code sent to your current email address.",
    data: {
      expiresIn: 600,
    },
  });
  return;
});

/**
 * VERIFY CURRENT EMAIL CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyCurrentEmailCode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING CODE AND NEW EMAIL FROM REQUEST BODY
  const { code, newEmail } = req.body;
  // IF CODE NOT PROVIDED, RETURN 400 ERROR
  if (!code) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code is required!",
      success: false,
    });
    return;
  }
  // IF NEW EMAIL NOT PROVIDED, RETURN 400 ERROR
  if (!newEmail) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New email address is required!",
      success: false,
    });
    return;
  }
  // NORMALIZING NEW EMAIL
  const normalizedNewEmail = newEmail.toLowerCase().trim();
  // FINDING VERIFICATION RECORD
  const verificationRecord = await EmailChangeVerification.findOne({
    userId,
    newEmail: normalizedNewEmail,
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please request a new code.",
      success: false,
    });
    return;
  }
  // CHECK IF VERIFICATION RECORD IS EXPIRED
  if (new Date() > verificationRecord.expiresAt) {
    // DELETE EXPIRED RECORD
    await EmailChangeVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code has expired. Please request a new code.",
      success: false,
    });
    return;
  }
  // CHECK IF CURRENT EMAIL IS ALREADY VERIFIED
  if (verificationRecord.currentEmailVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Current email has already been verified.",
      success: false,
    });
    return;
  }
  // INCREMENTING VERIFICATION ATTEMPTS
  verificationRecord.currentEmailAttempts += 1;
  // SETTING LAST VERIFICATION ATTEMPT TIMESTAMP TO NOW
  verificationRecord.lastVerificationAttemptAt = new Date();
  // CHECKING IF MAX ATTEMPTS EXCEEDED (5 ATTEMPTS)
  if (verificationRecord.currentEmailAttempts > 5) {
    // DELETING VERIFICATION RECORD
    await EmailChangeVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(429).json({
      message: "Too many verification attempts. Please request a new code.",
      success: false,
    });
    return;
  }
  // SAVING UPDATED RECORD
  await verificationRecord.save();
  // CHECKING IF CODE MATCHES
  if (verificationRecord.currentEmailCode !== code) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid verification code. Please check and try again.",
      success: false,
    });
    return;
  }
  // MARK CURRENT EMAIL AS VERIFIED (TRUE)
  verificationRecord.currentEmailVerified = true;
  // GENERATING NEW VERIFICATION CODE FOR NEW EMAIL
  const newEmailCode = generateVerificationCode();
  // SETTING NEW VERIFICATION CODE FOR NEW EMAIL
  verificationRecord.newEmailCode = newEmailCode;
  // RESET EXPIRATION DATE (10 MINUTES FROM NOW)
  verificationRecord.expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  verificationRecord.expiresAt.setMinutes(
    verificationRecord.expiresAt.getMinutes() + 10
  );
  // SAVING UPDATED RECORD
  await verificationRecord.save();
  // FINDING USER BY ID
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    return;
  }
  // SENDING VERIFICATION EMAIL TO NEW EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO NEW EMAIL
    await sendEmailChangeVerificationCodeNew(
      normalizedNewEmail,
      newEmailCode,
      user.name,
      user.email
    );
  } catch (error) {
    // IF EMAIL SENDING FAILS, RESET VERIFICATION STATE (FALSE)
    verificationRecord.currentEmailVerified = false;
    // SETTING NEW VERIFICATION CODE FOR NEW EMAIL TO EMPTY STRING
    verificationRecord.newEmailCode = "";
    // SAVING UPDATED RECORD
    await verificationRecord.save();
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message:
        "Failed to send verification email to new address. Please try again.",
      success: false,
    });
    return;
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message:
      "Current email verified. Verification code sent to your new email address.",
    data: {
      expiresIn: 600,
    },
  });
  return;
});

/**
 * VERIFY NEW EMAIL CODE AND UPDATE EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyNewEmailCode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING CODE AND NEW EMAIL FROM REQUEST BODY
  const { code, newEmail } = req.body;
  // IF CODE NOT PROVIDED, RETURN 400 ERROR
  if (!code) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code is required!",
      success: false,
    });
    return;
  }
  // IF NEW EMAIL NOT PROVIDED, RETURN 400 ERROR
  if (!newEmail) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New email address is required!",
      success: false,
    });
    return;
  }
  // NORMALIZE EMAIL
  const normalizedNewEmail = newEmail.toLowerCase().trim();
  // FINDING VERIFICATION RECORD BY USER ID AND NEW EMAIL
  const verificationRecord = await EmailChangeVerification.findOne({
    userId,
    newEmail: normalizedNewEmail,
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please start the process again.",
      success: false,
    });
    return;
  }
  // CHECK IF CURRENT EMAIL IS VERIFIED
  if (!verificationRecord.currentEmailVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Current email must be verified first.",
      success: false,
    });
    return;
  }
  // CHECK IF VERIFICATION RECORD IS EXPIRED
  if (new Date() > verificationRecord.expiresAt) {
    // DELETE EXPIRED RECORD
    await EmailChangeVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code has expired. Please start the process again.",
      success: false,
    });
    return;
  }
  // CHECK IF NEW EMAIL IS ALREADY VERIFIED
  if (verificationRecord.newEmailVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New email has already been verified.",
      success: false,
    });
    return;
  }
  // INCREMENTING VERIFICATION ATTEMPTS
  verificationRecord.newEmailAttempts += 1;
  // SETTING LAST VERIFICATION ATTEMPT TIMESTAMP TO NOW
  verificationRecord.lastVerificationAttemptAt = new Date();
  // CHECKING IF MAX ATTEMPTS EXCEEDED (5 ATTEMPTS)
  if (verificationRecord.newEmailAttempts > 5) {
    // DELETING VERIFICATION RECORD
    await EmailChangeVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(429).json({
      message:
        "Too many verification attempts. Please start the process again.",
      success: false,
    });
    return;
  }
  // SAVE UPDATED RECORD
  await verificationRecord.save();
  // CHECK IF CODE MATCHES
  if (verificationRecord.newEmailCode !== code) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid verification code. Please check and try again.",
      success: false,
    });
    return;
  }
  // DOUBLE-CHECK IF NEW EMAIL ALREADY EXISTS (RACE CONDITION CHECK)
  const existingUser = await User.findOne({
    email: normalizedNewEmail,
  })
    .lean()
    .exec();
  if (existingUser) {
    // DELETING VERIFICATION RECORD
    await EmailChangeVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(409).json({
      message: "This email address is already in use!",
      success: false,
    });
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
    return;
  }
  // STORING OLD EMAIL FOR NOTIFICATION
  const oldEmail = user.email;
  // UPDATE USER EMAIL (PRESERVE OAUTH INFO)
  user.email = normalizedNewEmail;
  // IF USER IS OAUTH USER, UPDATE PROVIDER EMAIL TO NEW EMAIL
  if (user.provider) {
    // UPDATE PROVIDER EMAIL TO NEW EMAIL
    user.providerEmail = normalizedNewEmail;
  }
  // SAVE USER
  await user.save();
  // MARK NEW EMAIL AS VERIFIED
  verificationRecord.newEmailVerified = true;
  // SAVE VERIFICATION RECORD
  await verificationRecord.save();
  // SEND CONFIRMATION EMAIL TO NEW EMAIL
  try {
    // SENDING CONFIRMATION EMAIL TO NEW EMAIL
    await sendEmailChangeConfirmation(
      normalizedNewEmail,
      user.name,
      new Date()
    );
  } catch (error) {
    // LOGGING ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending email change confirmation:", error);
  }
  // SEND NOTIFICATION EMAIL TO OLD EMAIL
  try {
    // SENDING NOTIFICATION EMAIL TO OLD EMAIL
    await sendEmailChangeNotification(
      oldEmail,
      user.name,
      normalizedNewEmail,
      new Date()
    );
  } catch (error) {
    // LOGGING ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending email change notification:", error);
  }
  // DELETING VERIFICATION RECORD AFTER SUCCESSFUL UPDATE
  await EmailChangeVerification.findByIdAndDelete(
    verificationRecord._id
  ).exec();
  // DETERMINING OAUTH SYNC MESSAGE
  const providerName =
    user.provider === "google"
      ? "Google"
      : user.provider === "github"
      ? "GitHub"
      : null;
  // OAUTH SYNC MESSAGE
  const oauthSyncMessage = providerName
    ? ` Your OAuth account information will be automatically synced the next time you log in with ${providerName}.`
    : "";
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: `Email address updated successfully!${oauthSyncMessage}`,
    data: {
      email: normalizedNewEmail,
      provider: user.provider,
      providerEmail: user.providerEmail,
      isOAuthUser: !!user.provider,
    },
  });
  return;
});

/**
 * RESEND VERIFICATION CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const resendVerificationCode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING NEW EMAIL AND TYPE FROM REQUEST BODY
  const { newEmail, type } = req.body;
  // IF NEW EMAIL NOT PROVIDED, RETURN 400 ERROR
  if (!newEmail) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New email address is required!",
      success: false,
    });
    return;
  }
  // IF TYPE NOT PROVIDED, RETURN 400 ERROR
  if (!type || (type !== "current" && type !== "new")) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Type must be 'current' or 'new'!",
      success: false,
    });
    return;
  }
  // NORMALIZING NEW EMAIL
  const normalizedNewEmail = newEmail.toLowerCase().trim();
  // FINDING VERIFICATION RECORD BY USER ID AND NEW EMAIL
  const verificationRecord = await EmailChangeVerification.findOne({
    userId,
    newEmail: normalizedNewEmail,
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please start the process again.",
      success: false,
    });
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
    return;
  }
  // GENERATING NEW VERIFICATION CODE
  const newCode = generateVerificationCode();
  // SETTING EXPIRATION TIME TO 10 MINUTES FROM NOW
  verificationRecord.expiresAt = new Date();
  // SETTING EXPIRATION TIME TO 10 MINUTES FROM NOW
  verificationRecord.expiresAt.setMinutes(
    verificationRecord.expiresAt.getMinutes() + 10
  );
  // SENDING CODE BASED ON TYPE
  if (type === "current") {
    // RESETING CURRENT EMAIL VERIFICATION
    verificationRecord.currentEmailVerified = false;
    // SETTING NEW VERIFICATION CODE FOR CURRENT EMAIL
    verificationRecord.currentEmailCode = newCode;
    // SETTING CURRENT EMAIL ATTEMPTS TO 0
    verificationRecord.currentEmailAttempts = 0;
    // SAVING UPDATED RECORD
    await verificationRecord.save();
    // SENDING VERIFICATION EMAIL TO CURRENT EMAIL
    try {
      // SENDING VERIFICATION EMAIL TO CURRENT EMAIL
      await sendEmailChangeVerificationCodeCurrent(
        user.email,
        newCode,
        user.name,
        normalizedNewEmail
      );
    } catch (error) {
      // RETURNING ERROR RESPONSE
      res.status(500).json({
        message: "Failed to send verification email. Please try again.",
        success: false,
      });
      return;
    }
  } else {
    // IF CURRENT EMAIL IS NOT VERIFIED, RETURN 400 ERROR
    if (!verificationRecord.currentEmailVerified) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Current email must be verified first before resending new email code.",
        success: false,
      });
      return;
    }
    // RESETING NEW EMAIL VERIFICATION
    verificationRecord.newEmailVerified = false;
    // SETTING NEW VERIFICATION CODE FOR NEW EMAIL
    verificationRecord.newEmailCode = newCode;
    // SETTING NEW EMAIL ATTEMPTS TO 0
    verificationRecord.newEmailAttempts = 0;
    // SAVING UPDATED RECORD
    await verificationRecord.save();
    // SEND EMAIL TO NEW EMAIL
    try {
      // SENDING VERIFICATION EMAIL TO NEW EMAIL
      await sendEmailChangeVerificationCodeNew(
        normalizedNewEmail,
        newCode,
        user.name,
        user.email
      );
    } catch (error) {
      // RETURNING ERROR RESPONSE
      res.status(500).json({
        message: "Failed to send verification email. Please try again.",
        success: false,
      });
      return;
    }
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: `Verification code sent to your ${
      type === "current" ? "current" : "new"
    } email address.`,
    data: {
      expiresIn: 600,
    },
  });
  return;
});

/**
 * CANCEL EMAIL CHANGE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const cancelEmailChange = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING NEW EMAIL FROM REQUEST BODY (OPTIONAL)
  const { newEmail } = req.body;
  // DELETING VERIFICATION RECORDS FOR THIS USER
  if (newEmail) {
    // DELETING SPECIFIC VERIFICATION RECORD
    const normalizedNewEmail = newEmail.toLowerCase().trim();
    // DELETING SPECIFIC VERIFICATION RECORD
    await EmailChangeVerification.deleteOne({
      userId,
      newEmail: normalizedNewEmail,
    }).exec();
  } else {
    // DELETE ALL VERIFICATION RECORDS FOR THIS USER
    await EmailChangeVerification.deleteMany({ userId }).exec();
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Email change process cancelled successfully.",
  });
  return;
});

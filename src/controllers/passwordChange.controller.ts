// <== IMPORTS ==>
import {
  sendPasswordChangeVerificationCode,
  sendPasswordChangeConfirmation,
  sendPasswordChangeCodeVerified,
} from "../utils/mailer.js";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";
import { PasswordChangeVerification } from "../models/passwordChangeVerification.model.js";

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
export const sendPasswordChangeCode = expressAsyncHandler(async (req, res) => {
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
  // CHECK IF USER HAS OAUTH PROVIDER (OAUTH USERS DON'T HAVE PASSWORDS)
  if (user.provider) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "OAuth users cannot change password. Please use your OAuth provider to manage your account.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER
  await PasswordChangeVerification.deleteMany({ userId }).exec();
  // GENERATE VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // CREATING EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // CREATING NEW VERIFICATION RECORD
  const verificationRecord = await PasswordChangeVerification.create({
    userId,
    email: user.email.toLowerCase(),
    verificationCode,
    expiresAt,
  });
  // SEND VERIFICATION EMAIL TO USER'S EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO USER'S EMAIL
    await sendPasswordChangeVerificationCode(
      user.email,
      verificationCode,
      user.name
    );
  } catch (error) {
    // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
    await PasswordChangeVerification.findByIdAndDelete(
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
    message: "Verification code sent to your email address.",
    data: {
      expiresIn: 600,
    },
  });
  return;
});

/**
 * VERIFY CODE AND ALLOW PASSWORD CHANGE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyPasswordChangeCode = expressAsyncHandler(
  async (req, res) => {
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
    const verificationRecord = await PasswordChangeVerification.findOne({
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
      await PasswordChangeVerification.findByIdAndDelete(
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
      await PasswordChangeVerification.findByIdAndDelete(
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
        await sendPasswordChangeCodeVerified(user.email, user.name);
      } catch (error) {
        // LOGGING ERROR BUT DON'T FAIL THE REQUEST
        console.error("Error sending verification confirmation email:", error);
      }
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now change your password.",
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * CHANGE PASSWORD AFTER VERIFICATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const changePassword = expressAsyncHandler(async (req, res) => {
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
  // GETTING NEW PASSWORD FROM REQUEST BODY
  const { newPassword } = req.body;
  // IF NEW PASSWORD NOT PROVIDED, RETURN 400 ERROR
  if (!newPassword) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New password is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING PASSWORD STRENGTH (8+ CHARACTERS, UPPERCASE, LOWERCASE, DIGIT, SPECIAL)
  if (newPassword.length < 8) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must be at least 8 characters long!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR UPPERCASE LETTER
  if (!/[A-Z]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one uppercase letter!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR LOWERCASE LETTER
  if (!/[a-z]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one lowercase letter!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR DIGIT
  if (!/[0-9]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one digit!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK FOR SPECIAL CHARACTER
  if (!/[^A-Za-z0-9]/.test(newPassword)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Password must contain at least one special character!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await PasswordChangeVerification.findOne({
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
    await PasswordChangeVerification.findByIdAndDelete(
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
  const user = await User.findById(userId).select("+password").exec();
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
  // CHECK IF NEW PASSWORD IS SAME AS CURRENT PASSWORD
  const isSamePassword = await bcrypt.compare(newPassword, user.password || "");
  // IF NEW PASSWORD IS SAME AS CURRENT PASSWORD, RETURN 400 ERROR
  if (isSamePassword) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New password must be different from your current password!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // HASHING NEW PASSWORD
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  // SETTING NEW PASSWORD TO USER
  user.password = hashedPassword;
  // SAVING USER
  await user.save();
  // DELETING VERIFICATION RECORD AFTER SUCCESSFUL PASSWORD CHANGE
  await PasswordChangeVerification.findByIdAndDelete(
    verificationRecord._id
  ).exec();
  // SEND CONFIRMATION EMAIL
  try {
    // SENDING PASSWORD CHANGE CONFIRMATION EMAIL TO USER'S EMAIL
    await sendPasswordChangeConfirmation(user.email, user.name, new Date());
  } catch (error) {
    // LOGGING ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending password change confirmation:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Password changed successfully!",
  });
  return;
});

/**
 * RESEND VERIFICATION CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const resendPasswordChangeCode = expressAsyncHandler(
  async (req, res) => {
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
    const verificationRecord = await PasswordChangeVerification.findOne({
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
      await sendPasswordChangeVerificationCode(
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
    return;
  }
);

/**
 * CANCEL PASSWORD CHANGE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const cancelPasswordChange = expressAsyncHandler(async (req, res) => {
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
  await PasswordChangeVerification.deleteMany({ userId }).exec();
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Password change process cancelled.",
  });
  return;
});

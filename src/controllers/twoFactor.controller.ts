// <== IMPORTS ==>
import {
  send2FAEnableRequestEmail,
  send2FAEnableCodeVerifiedEmail,
  send2FAEnabledEmail,
  send2FADisableRequestEmail,
  send2FADisableCodeVerifiedEmail,
  send2FADisabledEmail,
  send2FABackupCodesEmail,
} from "../utils/mailer.js";
import {
  encryptSecret,
  decryptSecret,
  hashBackupCode,
} from "../utils/encryption.js";
import crypto from "crypto";
import qrcode from "qrcode";
import speakeasy from "speakeasy";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";
import { TwoFactorVerification } from "../models/twoFactorVerification.model.js";

/**
 * GENERATE 6-DIGIT VERIFICATION CODE
 * @returns 6-Digit Verification Code as String
 */
const generateVerificationCode = (): string => {
  // GENERATING 6-DIGIT VERIFICATION CODE
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * GENERATE BACKUP CODES
 * @param count - Number of Backup Codes to Generate (Default: 10)
 * @returns Array of Backup Codes
 */
const generateBackupCodes = (count: number = 10): string[] => {
  // CREATING AN ARRAY TO STORE THE BACKUP CODES
  const codes: string[] = [];
  // GENERATING THE BACKUP CODES
  for (let i = 0; i < count; i++) {
    // GENERATING THE FIRST PART OF THE BACKUP CODE
    const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    // GENERATING THE SECOND PART OF THE BACKUP CODE
    const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    // GENERATING THE THIRD PART OF THE BACKUP CODE
    const part3 = crypto.randomBytes(2).toString("hex").toUpperCase();
    // ADDING THE BACKUP CODE TO THE ARRAY
    codes.push(`${part1}-${part2}-${part3}`);
  }
  // RETURNING THE ARRAY OF BACKUP CODES
  return codes;
};

/**
 * REQUEST ENABLE 2FA - SEND VERIFICATION CODE TO EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const requestEnable2FA = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF USER HAS OAUTH PROVIDER (OAUTH USERS CANNOT ENABLE 2FA)
  if (user.provider) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "OAuth users cannot enable 2FA. Please use your OAuth provider's 2FA features.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF 2FA IS ALREADY ENABLED
  if (user.isTwoFactorEnabled) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Two-Factor Authentication is already enabled for your account.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER (ENABLE TYPE)
  await TwoFactorVerification.deleteMany({
    userId,
    type: "enable",
  }).exec();
  // GENERATE VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // CREATING EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // CREATING NEW VERIFICATION RECORD
  const verificationRecord = await TwoFactorVerification.create({
    userId,
    email: user.email.toLowerCase(),
    verificationCode,
    type: "enable",
    expiresAt,
  });
  // SEND VERIFICATION EMAIL TO USER'S EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO USER'S EMAIL
    await send2FAEnableRequestEmail(user.email, user.name, verificationCode);
  } catch (error) {
    // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
    await TwoFactorVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * VERIFY ENABLE 2FA CODE - VERIFY EMAIL CODE AND GENERATE QR CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyEnable2FACode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await TwoFactorVerification.findOne({
    userId,
    type: "enable",
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF VERIFICATION RECORD IS EXPIRED
  if (verificationRecord.expiresAt < new Date()) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code has expired. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF MAX ATTEMPTS EXCEEDED
  if (verificationRecord.verificationAttempts >= 5) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Maximum verification attempts exceeded. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF CODE MATCHES
  if (verificationRecord.verificationCode !== code) {
    // INCREMENTING VERIFICATION ATTEMPTS
    verificationRecord.verificationAttempts += 1;
    // SETTING LAST VERIFICATION ATTEMPT AT
    verificationRecord.lastVerificationAttemptAt = new Date();
    // SAVING VERIFICATION RECORD
    await verificationRecord.save();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: `Invalid verification code. ${
        5 - verificationRecord.verificationAttempts
      } attempts remaining.`,
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF EMAIL ALREADY VERIFIED
  if (verificationRecord.emailVerified) {
    // IF QR CODE ALREADY GENERATED, RETURN IT
    if (verificationRecord.qrCodeGenerated && verificationRecord.totpSecret) {
      // DECRYPTING TOTP SECRET
      let decryptedSecret: string;
      try {
        // DECRYPTING TOTP SECRET
        decryptedSecret = decryptSecret(verificationRecord.totpSecret);
      } catch (error) {
        // RETURNING ERROR RESPONSE
        res.status(500).json({
          message:
            "Error processing TOTP secret. Please start the enable process again.",
          success: false,
        });
        // RETURNING FROM THE FUNCTION
        return;
      }
      // GENERATING OTPAUTH URL FROM DECRYPTED SECRET
      const otpauthUrl = speakeasy.otpauthURL({
        secret: decryptedSecret,
        label: `PlanOra (${verificationRecord.email})`,
        issuer: "PlanOra",
        encoding: "base32",
      });
      // GENERATING QR CODE DATA URL
      const qrCodeDataURL = await qrcode.toDataURL(otpauthUrl);
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        success: true,
        message: "Email verified. Please scan the QR code.",
        data: {
          qrCodeDataURL,
        },
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
  }
  // FINDING USER
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GENERATING TOTP SECRET
  const secret = speakeasy.generateSecret({
    name: `PlanOra (${user.email})`,
    issuer: "PlanOra",
  });
  // ENCRYPTING TOTP SECRET
  const encryptedSecret = encryptSecret(secret.base32!);
  // SETTING EMAIL VERIFIED TO TRUE
  verificationRecord.emailVerified = true;
  // SETTING TOTP SECRET TO ENCRYPTED SECRET
  verificationRecord.totpSecret = encryptedSecret;
  // SETTING QR CODE GENERATED TO TRUE
  verificationRecord.qrCodeGenerated = true;
  // UPDATING VERIFICATION RECORD
  await verificationRecord.save();
  // GENERATING QR CODE DATA URL
  const qrCodeDataURL = await qrcode.toDataURL(secret.otpauth_url!);
  // SENDING CODE VERIFIED EMAIL
  try {
    // SENDING CODE VERIFIED EMAIL
    await send2FAEnableCodeVerifiedEmail(user.email, user.name);
  } catch (error) {
    // LOGGING ERROR
    console.error("Error sending 2FA enable code verified email:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Email verified. Please scan the QR code.",
    data: {
      qrCodeDataURL,
    },
  });
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * VERIFY ENABLE 2FA TOTP - VERIFY TOTP TOKEN AND ENABLE 2FA
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyEnable2FATOTP = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GETTING TOKEN FROM REQUEST BODY
  const { token } = req.body;
  // IF TOKEN NOT PROVIDED, RETURN 400 ERROR
  if (!token) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "TOTP token is required!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await TwoFactorVerification.findOne({
    userId,
    type: "enable",
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message:
        "Verification record not found. Please start the enable process again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF EMAIL IS VERIFIED
  if (!verificationRecord.emailVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Email verification is required first. Please verify your email code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF QR CODE WAS GENERATED
  if (!verificationRecord.qrCodeGenerated || !verificationRecord.totpSecret) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "QR code not generated. Please verify your email code first.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // DECRYPTING TOTP SECRET
  let decryptedSecret: string;
  try {
    // DECRYPTING TOTP SECRET
    decryptedSecret = decryptSecret(verificationRecord.totpSecret);
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message:
        "Error processing TOTP secret. Please start the enable process again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // VERIFYING TOTP TOKEN
  const verified = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: "base32",
    token,
    window: 2,
  });
  // IF TOTP NOT VERIFIED, RETURN 400 ERROR
  if (!verified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Invalid TOTP token. Please enter the code from your authenticator app.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING USER DOCUMENT
  const user = await User.findById(userId).exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GENERATING BACKUP CODES
  const backupCodes = generateBackupCodes(10);
  // HASHING BACKUP CODES
  const hashedBackupCodes = await Promise.all(
    backupCodes.map(async (code) => ({
      code: await hashBackupCode(code),
      used: false,
      usedAt: null as Date | null,
    }))
  );
  // ENABLING 2FA
  user.isTwoFactorEnabled = true;
  // SETTING TOTP SECRET TO ENCRYPTED SECRET
  user.totpSecret = verificationRecord.totpSecret;
  // SETTING BACKUP CODES TO HASHED BACKUP CODES
  user.backupCodes = hashedBackupCodes as any;
  // SETTING BACKUP CODES GENERATED AT TO CURRENT DATE
  user.backupCodesGeneratedAt = new Date();
  // SAVING USER
  await user.save();
  // DELETING VERIFICATION RECORD
  await TwoFactorVerification.findByIdAndDelete(verificationRecord._id).exec();
  // SENDING 2FA ENABLED EMAIL
  try {
    // SENDING 2FA ENABLED EMAIL
    await send2FAEnabledEmail(user.email, user.name, new Date());
  } catch (error) {
    // LOGGING ERROR
    console.error("Error sending 2FA enabled email:", error);
  }
  // SENDING BACKUP CODES EMAIL
  try {
    // SENDING BACKUP CODES EMAIL
    await send2FABackupCodesEmail(user.email, user.name, backupCodes);
  } catch (error) {
    // LOGGING ERROR
    console.error("Error sending backup codes email:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Two-Factor Authentication enabled successfully!",
    data: {
      backupCodes,
    },
  });
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * REQUEST DISABLE 2FA - SEND VERIFICATION CODE TO EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const requestDisable2FA = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF 2FA IS ENABLED
  if (!user.isTwoFactorEnabled) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Two-Factor Authentication is not enabled for your account.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER (DISABLE TYPE)
  await TwoFactorVerification.deleteMany({
    userId,
    type: "disable",
  }).exec();
  // GENERATING VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // CREATING EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // CREATING NEW VERIFICATION RECORD
  const verificationRecord = await TwoFactorVerification.create({
    userId,
    email: user.email.toLowerCase(),
    verificationCode,
    type: "disable",
    expiresAt,
  });
  // SEND VERIFICATION EMAIL TO USER'S EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO USER'S EMAIL
    await send2FADisableRequestEmail(user.email, user.name, verificationCode);
  } catch (error) {
    // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
    await TwoFactorVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * VERIFY DISABLE 2FA CODE - VERIFY EMAIL CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyDisable2FACode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await TwoFactorVerification.findOne({
    userId,
    type: "disable",
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF VERIFICATION RECORD IS EXPIRED
  if (verificationRecord.expiresAt < new Date()) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code has expired. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF MAX ATTEMPTS EXCEEDED
  if (verificationRecord.verificationAttempts >= 5) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Maximum verification attempts exceeded. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF CODE MATCHES
  if (verificationRecord.verificationCode !== code) {
    // INCREMENTING VERIFICATION ATTEMPTS
    verificationRecord.verificationAttempts += 1;
    // SETTING LAST VERIFICATION ATTEMPT AT
    verificationRecord.lastVerificationAttemptAt = new Date();
    // SAVING VERIFICATION RECORD
    await verificationRecord.save();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: `Invalid verification code. ${
        5 - verificationRecord.verificationAttempts
      } attempts remaining.`,
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING USER
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // UPDATING VERIFICATION RECORD
  verificationRecord.emailVerified = true;
  // SAVING VERIFICATION RECORD
  await verificationRecord.save();
  // SENDING CODE VERIFIED EMAIL
  try {
    // SENDING CODE VERIFIED EMAIL
    await send2FADisableCodeVerifiedEmail(user.email, user.name);
  } catch (error) {
    // LOGGING ERROR
    console.error("Error sending 2FA disable code verified email:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message:
      "Email verified. Please enter the code from your authenticator app.",
  });
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * VERIFY DISABLE 2FA TOTP - VERIFY TOTP TOKEN AND DISABLE 2FA
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyDisable2FATOTP = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GETTING TOKEN FROM REQUEST BODY
  const { token } = req.body;
  // IF TOKEN NOT PROVIDED, RETURN 400 ERROR
  if (!token) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "TOTP token is required!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await TwoFactorVerification.findOne({
    userId,
    type: "disable",
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message:
        "Verification record not found. Please start the disable process again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF EMAIL IS VERIFIED
  if (!verificationRecord.emailVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Email verification is required first. Please verify your email code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING USER WITH TOTP SECRET
  const user = await User.findById(userId).select("+totpSecret").exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF TOTP SECRET EXISTS
  if (!user.totpSecret) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "2FA is not initialized for your account.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // DECRYPTING TOTP SECRET
  let decryptedSecret: string;
  try {
    // DECRYPTING TOTP SECRET
    decryptedSecret = decryptSecret(user.totpSecret);
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error processing TOTP secret. Please contact support.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // VERIFYING TOTP TOKEN
  const verified = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: "base32",
    token,
    window: 2,
  });
  // IF TOTP NOT VERIFIED, RETURN 400 ERROR
  if (!verified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Invalid TOTP token. Please enter the code from your authenticator app.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // SETTING 2FA TO DISABLED
  user.isTwoFactorEnabled = false;
  // SETTING TOTP SECRET TO NULL
  user.totpSecret = null as any;
  // SETTING BACKUP CODES TO EMPTY ARRAY
  user.backupCodes = [] as any;
  // SETTING BACKUP CODES GENERATED AT TO NULL
  user.backupCodesGeneratedAt = null as any;
  // UPDATING USER
  await user.save();
  // DELETING VERIFICATION RECORD
  await TwoFactorVerification.findByIdAndDelete(verificationRecord._id).exec();
  // SENDING 2FA DISABLED EMAIL
  try {
    // SENDING 2FA DISABLED EMAIL
    await send2FADisabledEmail(user.email, user.name, new Date());
  } catch (error) {
    // LOGGING ERROR
    console.error("Error sending 2FA disabled email:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Two-Factor Authentication disabled successfully!",
  });
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * RESEND 2FA CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const resend2FACode = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GETTING TYPE FROM REQUEST BODY
  const { type } = req.body;
  // IF TYPE NOT PROVIDED, RETURN 400 ERROR
  if (!type || (type !== "enable" && type !== "disable")) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Type is required and must be 'enable' or 'disable'!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING VERIFICATION RECORD
  const verificationRecord = await TwoFactorVerification.findOne({
    userId,
    type,
  }).exec();
  // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
  if (!verificationRecord) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Verification record not found. Please start the process again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING USER
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GENERATING NEW VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // CREATING NEW EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // SETTING VERIFICATION CODE TO NEW VERIFICATION CODE
  verificationRecord.verificationCode = verificationCode;
  // SETTING EXPIRATION DATE TO NEW EXPIRATION DATE
  verificationRecord.expiresAt = expiresAt;
  // SETTING VERIFICATION ATTEMPTS TO 0
  verificationRecord.verificationAttempts = 0;
  // SETTING LAST VERIFICATION ATTEMPT AT TO NULL
  verificationRecord.lastVerificationAttemptAt = null as any;
  // UPDATING VERIFICATION RECORD
  await verificationRecord.save();
  // SENDING VERIFICATION EMAIL
  try {
    // SENDING VERIFICATION EMAIL BASED ON TYPE
    if (type === "enable") {
      // SENDING 2FA ENABLE REQUEST EMAIL
      await send2FAEnableRequestEmail(user.email, user.name, verificationCode);
    } else {
      // SENDING 2FA DISABLE REQUEST EMAIL
      await send2FADisableRequestEmail(user.email, user.name, verificationCode);
    }
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Failed to send verification email. Please try again.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * CANCEL 2FA PROCESS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const cancel2FA = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GETTING TYPE FROM REQUEST BODY (OPTIONAL)
  const { type } = req.body;
  // IF TYPE PROVIDED, DELETE SPECIFIC TYPE
  if (type && (type === "enable" || type === "disable")) {
    // DELETING VERIFICATION RECORD FOR SPECIFIC TYPE
    await TwoFactorVerification.deleteMany({
      userId,
      type,
    }).exec();
  } else {
    // DELETING ALL VERIFICATION RECORDS FOR USER
    await TwoFactorVerification.deleteMany({
      userId,
    }).exec();
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "2FA process cancelled successfully.",
  });
  return;
});

/**
 * GET 2FA STATUS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const get2FAStatus = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING USER
  const user = await User.findById(userId)
    .select("isTwoFactorEnabled backupCodes")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // COUNTING UNUSED BACKUP CODES
  let unusedBackupCodesCount = 0;
  // TYPE-SAFE ACCESS TO BACKUP CODES (USING JSON TO AVOID COMPLEX TYPE ISSUES)
  const userJson = JSON.parse(JSON.stringify(user)) as {
    backupCodes?: Array<{ used?: boolean }>;
  };
  // CHECKING IF BACKUP CODES EXISTS AND IS AN ARRAY
  if (userJson.backupCodes && Array.isArray(userJson.backupCodes)) {
    // ITERATING THROUGH BACKUP CODES
    for (const code of userJson.backupCodes) {
      // CHECKING IF BACKUP CODE IS NOT USED
      if (!code.used) {
        // INCREMENTING UNUSED BACKUP CODES COUNT
        unusedBackupCodesCount++;
      }
    }
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    data: {
      enabled: user.isTwoFactorEnabled || false,
      hasBackupCodes: unusedBackupCodesCount > 0,
      unusedBackupCodesCount,
    },
  });
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * REGENERATE BACKUP CODES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const regenerateBackupCodes = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // FINDING USER
  const user = await User.findById(userId).exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF 2FA IS ENABLED
  if (!user.isTwoFactorEnabled) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Two-Factor Authentication is not enabled for your account.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GENERATING NEW BACKUP CODES
  const backupCodes = generateBackupCodes(10);
  // HASHING BACKUP CODES
  const hashedBackupCodes = await Promise.all(
    backupCodes.map(async (code) => ({
      code: await hashBackupCode(code),
      used: false,
      usedAt: null as Date | null,
    }))
  );
  // SETTING BACKUP CODES TO HASHED BACKUP CODES
  user.backupCodes = hashedBackupCodes as any;
  // SETTING BACKUP CODES GENERATED AT TO CURRENT DATE
  user.backupCodesGeneratedAt = new Date();
  // UPDATING USER
  await user.save();
  // SENDING BACKUP CODES EMAIL
  try {
    // SENDING BACKUP CODES EMAIL
    await send2FABackupCodesEmail(user.email, user.name, backupCodes);
  } catch (error) {
    // LOGGING ERROR
    console.error("Error sending backup codes email:", error);
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Backup codes regenerated successfully!",
    data: {
      backupCodes, // Return codes once for user to save
    },
  });
  // RETURNING FROM THE FUNCTION
  return;
});

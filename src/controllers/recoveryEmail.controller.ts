// <== IMPORTS ==>
import {
  sendRecoveryEmailVerificationCode,
  sendRecoveryEmailAdded,
  sendRecoveryEmailUpdated,
  sendRecoveryEmailRemoved,
} from "../utils/mailer.js";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";
import { RecoveryEmailVerification } from "../models/recoveryEmailVerification.model.js";

/**
 * GENERATE 6-DIGIT VERIFICATION CODE
 * @returns 6-Digit Verification Code as String
 */
const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * REQUEST TO ADD RECOVERY EMAIL - SEND VERIFICATION CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const requestAddRecoveryEmail = expressAsyncHandler(async (req, res) => {
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
  // GETTING RECOVERY EMAIL FROM REQUEST BODY
  const { recoveryEmail } = req.body;
  // IF RECOVERY EMAIL NOT PROVIDED, RETURN 400 ERROR
  if (!recoveryEmail) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery email address is required!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // VALIDATE EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
  if (!emailRegex.test(recoveryEmail)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
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
  // NORMALIZING RECOVERY EMAIL
  const normalizedRecoveryEmail = recoveryEmail.toLowerCase().trim();
  // IF RECOVERY EMAIL IS SAME AS PRIMARY EMAIL, RETURN 400 ERROR
  if (normalizedRecoveryEmail === user.email.toLowerCase()) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery email cannot be the same as your primary email!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECKING IF RECOVERY EMAIL ALREADY EXISTS IN ANOTHER ACCOUNT
  const existingUser = await User.findOne({
    email: normalizedRecoveryEmail,
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
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECKING IF USER ALREADY HAS A RECOVERY EMAIL
  if (user.recoveryEmail && user.recoveryEmailVerified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "You already have a verified recovery email. Please update it instead.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER AND TYPE
  await RecoveryEmailVerification.deleteMany({
    userId,
    type: "add",
  }).exec();
  // GENERATE VERIFICATION CODE
  const verificationCode = generateVerificationCode();
  // CREATING EXPIRATION DATE (10 MINUTES FROM NOW)
  const expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  // CREATING NEW VERIFICATION RECORD
  const verificationRecord = await RecoveryEmailVerification.create({
    userId,
    recoveryEmail: normalizedRecoveryEmail,
    verificationCode,
    type: "add",
    expiresAt,
  });
  // SEND VERIFICATION EMAIL TO RECOVERY EMAIL
  try {
    // SENDING VERIFICATION EMAIL TO RECOVERY EMAIL
    await sendRecoveryEmailVerificationCode(
      normalizedRecoveryEmail,
      user.name,
      verificationCode,
      "add"
    );
  } catch (error) {
    // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
    await RecoveryEmailVerification.findByIdAndDelete(
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
    message: "Verification code sent to your recovery email address.",
    data: {
      expiresIn: 600,
    },
  });
  return;
});

/**
 * VERIFY CODE AND ADD RECOVERY EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyAddRecoveryEmail = expressAsyncHandler(async (req, res) => {
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
  const verificationRecord = await RecoveryEmailVerification.findOne({
    userId,
    type: "add",
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
  if (new Date() > verificationRecord.expiresAt) {
    // DELETE EXPIRED RECORD
    await RecoveryEmailVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Verification code has expired. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECK IF ALREADY VERIFIED
  if (verificationRecord.verified) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Recovery email has already been verified.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // INCREMENTING VERIFICATION ATTEMPTS
  verificationRecord.verificationAttempts += 1;
  // SETTING LAST VERIFICATION ATTEMPT TIMESTAMP TO NOW
  verificationRecord.lastVerificationAttemptAt = new Date();
  // CHECKING IF MAX ATTEMPTS EXCEEDED (5 ATTEMPTS)
  if (verificationRecord.verificationAttempts > 5) {
    // DELETING VERIFICATION RECORD
    await RecoveryEmailVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(429).json({
      message: "Too many verification attempts. Please request a new code.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
    // RETURNING FROM THE FUNCTION
    return;
  }
  // DOUBLE-CHECK IF RECOVERY EMAIL ALREADY EXISTS IN ANOTHER ACCOUNT (RACE CONDITION CHECK)
  const existingUser = await User.findOne({
    email: verificationRecord.recoveryEmail,
  })
    .lean()
    .exec();
  // IF EMAIL ALREADY EXISTS, RETURN 409 ERROR
  if (existingUser) {
    // DELETING VERIFICATION RECORD
    await RecoveryEmailVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(409).json({
      message: "This email address is already in use!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
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
    // RETURNING FROM THE FUNCTION
    return;
  }
  // CHECKING IF USER ALREADY HAS A RECOVERY EMAIL
  if (user.recoveryEmail && user.recoveryEmailVerified) {
    // DELETING VERIFICATION RECORD
    await RecoveryEmailVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "You already have a verified recovery email. Please update it instead.",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // SETTING RECOVERY EMAIL TO THE NEW RECOVERY EMAIL
  user.recoveryEmail = verificationRecord.recoveryEmail;
  // SETTING RECOVERY EMAIL VERIFIED TO TRUE
  user.recoveryEmailVerified = true;
  // SETTING RECOVERY EMAIL VERIFIED AT TO NOW
  user.recoveryEmailVerifiedAt = new Date();
  // SAVING USER
  await user.save();
  // SETTING VERIFICATION RECORD VERIFIED TO TRUE
  verificationRecord.verified = true;
  // SAVING VERIFICATION RECORD
  await verificationRecord.save();
  // SENDING CONFIRMATION EMAIL TO NEW RECOVERY EMAIL
  try {
    // SENDING CONFIRMATION EMAIL TO NEW RECOVERY EMAIL
    await sendRecoveryEmailAdded(
      user.email,
      verificationRecord.recoveryEmail,
      user.name,
      new Date()
    );
  } catch (error) {
    // LOGGING ERROR BUT DON'T FAIL THE REQUEST
    console.error("Error sending recovery email added confirmation:", error);
  }
  // DELETING VERIFICATION RECORD AFTER SUCCESSFUL ADDITION
  await RecoveryEmailVerification.findByIdAndDelete(
    verificationRecord._id
  ).exec();
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Recovery email added successfully!",
    data: {
      recoveryEmail: verificationRecord.recoveryEmail,
      verified: true,
    },
  });
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * REQUEST TO UPDATE RECOVERY EMAIL - SEND CODE TO CURRENT RECOVERY EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const requestUpdateRecoveryEmail = expressAsyncHandler(
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
      // RETURNING FROM THE FUNCTION
      return;
    }
    // GETTING NEW RECOVERY EMAIL FROM REQUEST BODY
    const { newRecoveryEmail } = req.body;
    // IF NEW RECOVERY EMAIL NOT PROVIDED, RETURN 400 ERROR
    if (!newRecoveryEmail) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "New recovery email address is required!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // VALIDATE EMAIL FORMAT
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
    if (!emailRegex.test(newRecoveryEmail)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Please provide a valid email address!",
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
    // CHECKING IF USER HAS A RECOVERY EMAIL
    if (!user.recoveryEmail || !user.recoveryEmailVerified) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "You don't have a verified recovery email. Please add one instead.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // NORMALIZING NEW RECOVERY EMAIL
    const normalizedNewRecoveryEmail = newRecoveryEmail.toLowerCase().trim();
    // IF NEW RECOVERY EMAIL IS SAME AS PRIMARY EMAIL, RETURN 400 ERROR
    if (normalizedNewRecoveryEmail === user.email.toLowerCase()) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Recovery email cannot be the same as your primary email!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // IF NEW RECOVERY EMAIL IS SAME AS CURRENT RECOVERY EMAIL, RETURN 400 ERROR
    if (normalizedNewRecoveryEmail === user.recoveryEmail.toLowerCase()) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "New recovery email cannot be the same as your current recovery email!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // CHECKING IF NEW RECOVERY EMAIL ALREADY EXISTS IN ANOTHER ACCOUNT
    const existingUser = await User.findOne({
      email: normalizedNewRecoveryEmail,
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
      // RETURNING FROM THE FUNCTION
      return;
    }
    // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER AND TYPE
    await RecoveryEmailVerification.deleteMany({
      userId,
      type: "update",
    }).exec();
    // GENERATE VERIFICATION CODE
    const verificationCode = generateVerificationCode();
    // CREATING EXPIRATION DATE 10 MINUTES FROM NOW IN THE FUTURE
    const expiresAt = new Date();
    // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW IN THE FUTURE
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    // CREATING NEW VERIFICATION RECORD
    const verificationRecord = await RecoveryEmailVerification.create({
      userId,
      recoveryEmail: user.recoveryEmail.toLowerCase(),
      verificationCode,
      type: "update",
      expiresAt,
      oldRecoveryEmail: user.recoveryEmail.toLowerCase(),
    });
    // SEND VERIFICATION EMAIL TO CURRENT RECOVERY EMAIL
    try {
      // SENDING VERIFICATION EMAIL TO CURRENT RECOVERY EMAIL
      await sendRecoveryEmailVerificationCode(
        user.recoveryEmail,
        user.name,
        verificationCode,
        "update"
      );
    } catch (error) {
      // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
      await RecoveryEmailVerification.findByIdAndDelete(
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
      message: "Verification code sent to your current recovery email address.",
      data: {
        expiresIn: 600,
        newRecoveryEmail: normalizedNewRecoveryEmail,
      },
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
);

/**
 * VERIFY CURRENT RECOVERY EMAIL CODE (FOR UPDATE)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyUpdateRecoveryEmailCurrent = expressAsyncHandler(
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
      // RETURNING FROM THE FUNCTION
      return;
    }
    // GETTING CODE AND NEW RECOVERY EMAIL FROM REQUEST BODY
    const { code, newRecoveryEmail } = req.body;
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
    // IF NEW RECOVERY EMAIL NOT PROVIDED, RETURN 400 ERROR
    if (!newRecoveryEmail) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "New recovery email address is required!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // NORMALIZING NEW RECOVERY EMAIL
    const normalizedNewRecoveryEmail = newRecoveryEmail.toLowerCase().trim();
    // FINDING VERIFICATION RECORD
    const verificationRecord = await RecoveryEmailVerification.findOne({
      userId,
      type: "update",
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
    if (new Date() > verificationRecord.expiresAt) {
      // DELETE EXPIRED RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Verification code has expired. Please request a new code.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // CHECK IF ALREADY VERIFIED
    if (verificationRecord.verified) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Current recovery email has already been verified.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // INCREMENTING VERIFICATION ATTEMPTS
    verificationRecord.verificationAttempts += 1;
    // SETTING LAST VERIFICATION ATTEMPT TIMESTAMP TO NOW
    verificationRecord.lastVerificationAttemptAt = new Date();
    // CHECKING IF MAX ATTEMPTS EXCEEDED (5 ATTEMPTS)
    if (verificationRecord.verificationAttempts > 5) {
      // DELETING VERIFICATION RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(429).json({
        message: "Too many verification attempts. Please request a new code.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
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
    // VALIDATE NEW RECOVERY EMAIL FORMAT
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
    if (!emailRegex.test(normalizedNewRecoveryEmail)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Please provide a valid email address!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // IF NEW RECOVERY EMAIL IS SAME AS PRIMARY EMAIL, RETURN 400 ERROR
    if (normalizedNewRecoveryEmail === user.email.toLowerCase()) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Recovery email cannot be the same as your primary email!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // CHECKING IF NEW RECOVERY EMAIL ALREADY EXISTS IN ANOTHER ACCOUNT
    const existingUser = await User.findOne({
      email: normalizedNewRecoveryEmail,
    })
      .lean()
      .exec();
    // IF EMAIL ALREADY EXISTS, RETURN 409 ERROR
    if (existingUser) {
      // DELETING VERIFICATION RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "This email address is already in use!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // SETTING VERIFICATION RECORD VERIFIED TO TRUE
    verificationRecord.verified = true;
    // SETTING RECOVERY EMAIL IN VERIFICATION RECORD TO THE NEW RECOVERY EMAIL
    verificationRecord.recoveryEmail = normalizedNewRecoveryEmail;
    // GENERATING NEW VERIFICATION CODE FOR NEW RECOVERY EMAIL
    const newVerificationCode = generateVerificationCode();
    // SETTING VERIFICATION RECORD VERIFICATION CODE TO THE NEW VERIFICATION CODE
    verificationRecord.verificationCode = newVerificationCode;
    // SETTING VERIFICATION RECORD VERIFICATION ATTEMPTS TO 0
    verificationRecord.verificationAttempts = 0;
    // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW IN THE FUTURE
    verificationRecord.expiresAt = new Date();
    // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW IN THE FUTURE
    verificationRecord.expiresAt.setMinutes(
      verificationRecord.expiresAt.getMinutes() + 10
    );
    // SAVE VERIFICATION RECORD
    await verificationRecord.save();
    // SEND VERIFICATION EMAIL TO NEW RECOVERY EMAIL
    try {
      // SENDING VERIFICATION EMAIL TO NEW RECOVERY EMAIL
      await sendRecoveryEmailVerificationCode(
        normalizedNewRecoveryEmail,
        user.name,
        newVerificationCode,
        "update"
      );
    } catch (error) {
      // SETTING VERIFICATION RECORD VERIFIED TO FALSE
      verificationRecord.verified = false;
      // SETTING RECOVERY EMAIL IN VERIFICATION RECORD TO THE OLD RECOVERY EMAIL
      verificationRecord.recoveryEmail = user.recoveryEmail!.toLowerCase();
      // SAVING VERIFICATION RECORD
      await verificationRecord.save();
      // RETURNING ERROR RESPONSE
      res.status(500).json({
        message:
          "Failed to send verification email to new recovery email. Please try again.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      message:
        "Current recovery email verified. Verification code sent to your new recovery email address.",
      data: {
        expiresIn: 600,
        newRecoveryEmail: normalizedNewRecoveryEmail,
      },
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
);

/**
 * VERIFY NEW RECOVERY EMAIL CODE AND UPDATE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyUpdateRecoveryEmailNew = expressAsyncHandler(
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
    const verificationRecord = await RecoveryEmailVerification.findOne({
      userId,
      type: "update",
      verified: true,
    }).exec();
    // IF VERIFICATION RECORD NOT FOUND, RETURN 404 ERROR
    if (!verificationRecord) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message:
          "Verification record not found. Please start the update process again.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // CHECK IF VERIFICATION RECORD IS EXPIRED
    if (new Date() > verificationRecord.expiresAt) {
      // DELETE EXPIRED RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Verification code has expired. Please start the process again.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // INCREMENTING VERIFICATION ATTEMPTS
    verificationRecord.verificationAttempts += 1;
    // SETTING LAST VERIFICATION ATTEMPT TIMESTAMP TO NOW
    verificationRecord.lastVerificationAttemptAt = new Date();
    // CHECKING IF MAX ATTEMPTS EXCEEDED (5 ATTEMPTS)
    if (verificationRecord.verificationAttempts > 5) {
      // DELETING VERIFICATION RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(429).json({
        message:
          "Too many verification attempts. Please start the process again.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
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
      // RETURNING FROM THE FUNCTION
      return;
    }
    // DOUBLE-CHECK IF NEW RECOVERY EMAIL ALREADY EXISTS IN ANOTHER ACCOUNT (RACE CONDITION CHECK)
    const existingUser = await User.findOne({
      email: verificationRecord.recoveryEmail,
    })
      .lean()
      .exec();
    // IF EMAIL ALREADY EXISTS, RETURN 409 ERROR
    if (existingUser) {
      // DELETING VERIFICATION RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "This email address is already in use!",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
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
      // RETURNING FROM THE FUNCTION
      return;
    }
    // GETTING OLD RECOVERY EMAIL
    const oldRecoveryEmail = user.recoveryEmail!;
    // SETTING USER RECOVERY EMAIL TO THE NEW RECOVERY EMAIL
    user.recoveryEmail = verificationRecord.recoveryEmail;
    // SETTING USER RECOVERY EMAIL VERIFIED TO TRUE
    user.recoveryEmailVerified = true;
    // SETTING USER RECOVERY EMAIL VERIFIED AT TO NOW
    user.recoveryEmailVerifiedAt = new Date();
    // SAVING USER
    await user.save();
    // DELETING VERIFICATION RECORD
    await RecoveryEmailVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // SENDING CONFIRMATION EMAIL TO PRIMARY EMAIL
    try {
      // SENDING CONFIRMATION EMAIL TO NEW RECOVERY EMAIL
      await sendRecoveryEmailUpdated(
        user.email,
        oldRecoveryEmail,
        verificationRecord.recoveryEmail,
        user.name,
        new Date()
      );
    } catch (error) {
      // LOGGING ERROR BUT DON'T FAIL THE REQUEST
      console.error(
        "Error sending recovery email updated confirmation:",
        error
      );
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      message: "Recovery email updated successfully!",
      data: {
        recoveryEmail: verificationRecord.recoveryEmail,
        verified: true,
      },
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
);

/**
 * REQUEST TO REMOVE RECOVERY EMAIL - SEND CODE TO PRIMARY EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const requestRemoveRecoveryEmail = expressAsyncHandler(
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
    // CHECKING IF USER HAS A RECOVERY EMAIL
    if (!user.recoveryEmail || !user.recoveryEmailVerified) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "You don't have a verified recovery email to remove.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // DELETE ANY EXISTING VERIFICATION RECORDS FOR THIS USER AND TYPE
    await RecoveryEmailVerification.deleteMany({
      userId,
      type: "remove",
    }).exec();
    // GENERATING VERIFICATION CODE
    const verificationCode = generateVerificationCode();
    // CREATING EXPIRATION DATE 10 MINUTES FROM NOW IN THE FUTURE
    const expiresAt = new Date();
    // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW IN THE FUTURE
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    // CREATING NEW VERIFICATION RECORD
    const verificationRecord = await RecoveryEmailVerification.create({
      userId,
      recoveryEmail: user.recoveryEmail.toLowerCase(),
      verificationCode,
      type: "remove",
      expiresAt,
    });
    // SEND VERIFICATION EMAIL TO PRIMARY EMAIL
    try {
      // SENDING VERIFICATION EMAIL TO PRIMARY EMAIL
      await sendRecoveryEmailVerificationCode(
        user.email,
        user.name,
        verificationCode,
        "remove"
      );
    } catch (error) {
      // DELETE VERIFICATION RECORD IF EMAIL SENDING FAILS
      await RecoveryEmailVerification.findByIdAndDelete(
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
      message: "Verification code sent to your primary email address.",
      data: {
        expiresIn: 600,
      },
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
);

/**
 * VERIFY CODE AND REMOVE RECOVERY EMAIL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const verifyRemoveRecoveryEmail = expressAsyncHandler(
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
    const verificationRecord = await RecoveryEmailVerification.findOne({
      userId,
      type: "remove",
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
    if (new Date() > verificationRecord.expiresAt) {
      // DELETE EXPIRED RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Verification code has expired. Please request a new code.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // INCREMENTING VERIFICATION ATTEMPTS
    verificationRecord.verificationAttempts += 1;
    // SETTING LAST VERIFICATION ATTEMPT TIMESTAMP TO NOW
    verificationRecord.lastVerificationAttemptAt = new Date();
    // CHECKING IF MAX ATTEMPTS EXCEEDED (5 ATTEMPTS)
    if (verificationRecord.verificationAttempts > 5) {
      // DELETING VERIFICATION RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(429).json({
        message: "Too many verification attempts. Please request a new code.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
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
      // RETURNING FROM THE FUNCTION
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
      // RETURNING FROM THE FUNCTION
      return;
    }
    // CHECKING IF USER HAS A RECOVERY EMAIL
    if (!user.recoveryEmail || !user.recoveryEmailVerified) {
      // DELETING VERIFICATION RECORD
      await RecoveryEmailVerification.findByIdAndDelete(
        verificationRecord._id
      ).exec();
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "You don't have a verified recovery email to remove.",
        success: false,
      });
      // RETURNING FROM THE FUNCTION
      return;
    }
    // SETTING USER RECOVERY EMAIL TO NULL
    user.recoveryEmail = null as any;
    // SETTING USER RECOVERY EMAIL VERIFIED TO FALSE
    user.recoveryEmailVerified = false;
    // SETTING USER RECOVERY EMAIL VERIFIED AT TO NULL
    user.recoveryEmailVerifiedAt = null as any;
    // SAVING USER
    await user.save();
    // DELETING VERIFICATION RECORD
    await RecoveryEmailVerification.findByIdAndDelete(
      verificationRecord._id
    ).exec();
    // SENDING CONFIRMATION EMAIL TO PRIMARY EMAIL
    try {
      // SENDING CONFIRMATION EMAIL TO PRIMARY EMAIL
      await sendRecoveryEmailRemoved(user.email, user.name, new Date());
    } catch (error) {
      // LOGGING ERROR BUT DON'T FAIL THE REQUEST
      console.error(
        "Error sending recovery email removed confirmation:",
        error
      );
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      message: "Recovery email removed successfully!",
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
);

/**
 * RESEND VERIFICATION CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const resendRecoveryEmailCode = expressAsyncHandler(async (req, res) => {
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
  if (!type || !["add", "update", "remove"].includes(type)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Type must be 'add', 'update', or 'remove'!",
      success: false,
    });
    // RETURNING FROM THE FUNCTION
    return;
  }
  // GETTING TYPE FROM REQUEST BODY
  const verificationRecord = await RecoveryEmailVerification.findOne({
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
  // GETTING USER BY ID
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
  const newCode = generateVerificationCode();
  // SETTING NEW VERIFICATION CODE
  verificationRecord.verificationCode = newCode;
  // SETTING VERIFICATION RECORD VERIFICATION ATTEMPTS TO 0
  verificationRecord.verificationAttempts = 0;
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW IN THE FUTURE
  verificationRecord.expiresAt = new Date();
  // SETTING EXPIRATION DATE TO 10 MINUTES FROM NOW IN THE FUTURE
  verificationRecord.expiresAt.setMinutes(
    verificationRecord.expiresAt.getMinutes() + 10
  );
  // SAVING VERIFICATION RECORD
  await verificationRecord.save();
  // DETERMINING EMAIL TO SEND TO
  let emailToSend: string;
  if (type === "remove") {
    // SETTING EMAIL TO SEND TO TO PRIMARY EMAIL FOR REMOVE
    emailToSend = user.email;
  } else if (type === "update" && verificationRecord.verified) {
    // SETTING EMAIL TO SEND TO TO NEW RECOVERY EMAIL IF CURRENT IS VERIFIED
    emailToSend = verificationRecord.recoveryEmail;
  } else if (type === "update") {
    // SETTING EMAIL TO SEND TO TO CURRENT RECOVERY EMAIL FOR UPDATE
    emailToSend = user.recoveryEmail!;
  } else {
    // SETTING EMAIL TO SEND TO TO NEW RECOVERY EMAIL FOR ADD
    emailToSend = verificationRecord.recoveryEmail;
  }
  // SENDING VERIFICATION EMAIL
  try {
    // SENDING VERIFICATION EMAIL
    await sendRecoveryEmailVerificationCode(
      emailToSend,
      user.name,
      newCode,
      type as "add" | "update" | "remove"
    );
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
    message: "Verification code sent successfully.",
    data: {
      expiresIn: 600,
    },
  });
  // RETURNING FROM THE FUNCTION
  return;
});

/**
 * CANCEL RECOVERY EMAIL PROCESS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
export const cancelRecoveryEmail = expressAsyncHandler(async (req, res) => {
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
  // IF TYPE PROVIDED, DELETING VERIFICATION RECORDS FOR THIS USER
  if (type && ["add", "update", "remove"].includes(type)) {
    // DELETING VERIFICATION RECORDS FOR THIS USER AND TYPE
    await RecoveryEmailVerification.deleteMany({
      userId,
      type,
    }).exec();
  } else {
    // DELETE ALL VERIFICATION RECORDS FOR THIS USER
    await RecoveryEmailVerification.deleteMany({ userId }).exec();
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Recovery email process cancelled successfully.",
  });
  // RETURNING FROM THE FUNCTION
  return;
});

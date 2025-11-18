// <== IMPORTS ==>
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GENERATE JWT TOKEN
 * @param userId - User ID
 * @returns JWT Token
 */
// <== GENERATE JWT TOKEN ==>
export const generateToken = (userId: string): string => {
  // GETTING ACCESS TOKEN SECRET FROM ENVIRONMENT VARIABLES
  const secret = process.env.AT_SECRET || process.env.JWT_SECRET;
  // IF ACCESS TOKEN SECRET IS NOT DEFINED, THROW AN ERROR
  if (!secret) {
    throw new Error("AT_SECRET or JWT_SECRET is not Defined");
  }
  // GENERATING JWT TOKEN WITH USER ID AND ACCESS TOKEN SECRET
  return jwt.sign({ userId }, secret, {
    // SETTING EXPIRATION TIME TO 24 HOURS
    expiresIn: process.env.AT_EXPIRES_IN || "24h",
  } as jwt.SignOptions);
};

/**
 * GENERATE REFRESH TOKEN
 * @param userId - User ID
 * @returns Refresh Token
 */
// <== GENERATE REFRESH TOKEN ==>
export const generateRefreshToken = (userId: string): string => {
  // GETTING REFRESH TOKEN SECRET FROM ENVIRONMENT VARIABLES
  const secret = process.env.RT_SECRET;
  // IF REFRESH TOKEN SECRET IS NOT DEFINED, THROW AN ERROR
  if (!secret) {
    throw new Error("RT_SECRET is not Defined");
  }
  // GENERATING JWT TOKEN WITH USER ID AND REFRESH TOKEN SECRET
  return jwt.sign({ userId }, secret, {
    // SETTING EXPIRATION TIME TO 30 DAYS
    expiresIn: process.env.RT_EXPIRES_IN || "30d",
  } as jwt.SignOptions);
};

/**
 * USER SIGNUP
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== USER SIGNUP ==>
export const signup = expressAsyncHandler(async (req, res) => {
  // GETTING USER DATA FROM REQUEST BODY
  const { name, email, password } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!name || !email || !password) {
    res.status(400).json({
      message: "Name, Email, and Password are Required!",
      success: false,
    });
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    return;
  }
  // VALIDATING PASSWORD LENGTH
  if (password.length < 6) {
    res.status(400).json({
      message: "Password must be at least 6 characters long!",
      success: false,
    });
    return;
  }
  // CHECKING IF USER ALREADY EXISTS
  const existingUser = await User.findOne({ email }).lean().exec();
  // IF USER ALREADY EXISTS, RETURN 409 ERROR
  if (existingUser) {
    res.status(409).json({
      message: "User with this email already exists!",
      success: false,
    });
    return;
  }
  // HASHING PASSWORD
  const hashedPassword = await bcrypt.hash(password, 10);
  // CREATING NEW USER
  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
  });
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Signup successful!",
    success: true,
    data: {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
    },
  });
  return;
});

/**
 * USER LOGIN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== USER LOGIN ==>
export const login = expressAsyncHandler(async (req, res) => {
  // GETTING USER DATA FROM REQUEST BODY
  const { email, password } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!email || !password) {
    res.status(400).json({
      message: "Email and Password are Required!",
      success: false,
    });
    return;
  }
  // FINDING USER BY EMAIL WITH PASSWORD FIELD
  const user = await User.findOne({ email }).select("+password").lean().exec();
  // IF USER NOT FOUND, RETURN 401 ERROR
  if (!user) {
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    return;
  }
  // COMPARING PASSWORD
  const isMatch = await bcrypt.compare(password, user.password);
  // IF PASSWORD DOES NOT MATCH, RETURN 401 ERROR
  if (!isMatch) {
    res.status(401).json({
      message: "Invalid email or password!",
      success: false,
    });
    return;
  }
  // GENERATING JWT TOKEN
  const token = generateToken(user._id.toString());
  // SETTING TOKEN IN HTTP-ONLY COOKIE
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Login successful!",
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      token,
    },
  });
  return;
});

/**
 * USER LOGOUT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== USER LOGOUT ==>
export const logout = expressAsyncHandler(async (req, res) => {
  // CLEARING TOKEN COOKIE
  res.clearCookie("token");
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Logout successful!",
    success: true,
  });
  return;
});

// <== IMPORTS ==>
import { Octokit } from "@octokit/rest";
import passport from "../config/passport.js";
import { User } from "../models/user.model.js";
import { decryptSecret } from "../utils/encryption.js";
import expressAsyncHandler from "express-async-handler";
import { Request, Response, NextFunction } from "express";
import { githubOAuthCallback, githubLinkCallback } from "./auth.controller.js";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest extends Express.Request {
  // <== ID FIELD ==>
  id?: string;
}

/**
 * INITIATE GITHUB LINK
 * @param req - Request Object
 * @param res - Response Object
 * @param next - Next Function
 * @returns Response Object
 */
// <== INITIATE GITHUB LINK ==>
export const initiateGitHubLink = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // INITIATE GITHUB OAUTH WITH STATE PARAMETER CONTAINING USER ID
  passport.authenticate("github", {
    scope: ["user:email", "read:user", "repo"],
    state: JSON.stringify({ linkUserId: userId }),
  })(req, res, next);
};

/**
 * HANDLE GITHUB CALLBACK
 * @param req - Request Object
 * @param res - Response Object
 * @param next - Next Function
 * @returns Response Object
 */
// <== HANDLE GITHUB CALLBACK ==>
export const handleGitHubCallback = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // CHECK IF THIS IS A LINK REQUEST BY CHECKING STATE
  const state = req.query.state;
  // IF STATE IS FOUND, CHECK IF IT IS A LINK REQUEST
  if (state && typeof state === "string") {
    try {
      // PARSING STATE
      const stateObj = JSON.parse(state);
      // IF LINK USER ID IS FOUND, USE LINK CALLBACK
      if (stateObj.linkUserId) {
        // THIS IS A LINK REQUEST - USE LINK CALLBACK
        githubLinkCallback(req, res, next);
        // RETURNING FROM FUNCTION
        return;
      }
    } catch (error) {
      // INVALID STATE - CONTINUE WITH NORMAL FLOW
    }
  }
  // NORMAL LOGIN/SIGNUP FLOW
  githubOAuthCallback(req, res, next);
};

/**
 * GET GITHUB CONNECTION STATUS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GITHUB CONNECTION STATUS ==>
export const getGitHubStatus = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND USER BY ID WITH GITHUB FIELDS
  const user = await User.findById(userId)
    .select("githubUsername githubConnectedAt githubScopes provider")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF GITHUB IS CONNECTED
  const isConnected = !!(user.githubUsername && user.githubConnectedAt);
  // CHECK IF USER SIGNED UP WITH GITHUB
  const isGitHubProvider = user.provider === "github";
  // RETURN STATUS
  res.status(200).json({
    message: "GitHub status retrieved successfully!",
    success: true,
    data: {
      isConnected,
      isGitHubProvider,
      githubUsername: user.githubUsername || null,
      connectedAt: user.githubConnectedAt || null,
      scopes: user.githubScopes || [],
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DISCONNECT GITHUB FROM ACCOUNT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DISCONNECT GITHUB ==>
export const disconnectGitHub = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND USER BY ID
  const user = await User.findById(userId)
    .select("provider githubUsername githubAccessToken")
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER SIGNED UP WITH GITHUB
  if (user.provider === "github") {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Cannot disconnect GitHub from an account that was created with GitHub. Please use a different authentication method first.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF GITHUB IS CONNECTED
  if (!user.githubUsername) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "GitHub is not connected to your account.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CLEAR GITHUB ACCESS TOKEN
  user.githubAccessToken = null as unknown as string;
  // CLEAR GITHUB USERNAME
  user.githubUsername = null as unknown as string;
  // CLEAR GITHUB CONNECTED AT
  user.githubConnectedAt = null as unknown as Date;
  // CLEAR GITHUB SCOPES
  user.githubScopes = [];
  // SAVING USER
  await user.save();
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message: "GitHub disconnected successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * VERIFY GITHUB TOKEN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== VERIFY GITHUB TOKEN ==>
export const verifyGitHubToken = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND USER BY ID WITH GITHUB TOKEN
  const user = await User.findById(userId)
    .select("+githubAccessToken githubUsername")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF GITHUB IS CONNECTED
  if (!user.githubAccessToken || !user.githubUsername) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "GitHub is not connected to your account.",
      success: false,
      data: {
        isValid: false,
        requiresReconnection: true,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DECRYPT ACCESS TOKEN
  let decryptedToken: string;
  try {
    // DECRYPTING ACCESS TOKEN
    decryptedToken = decryptSecret(user.githubAccessToken);
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error processing GitHub token. Please reconnect your account.",
      success: false,
      data: {
        isValid: false,
        requiresReconnection: true,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VERIFY TOKEN WITH GITHUB API
  try {
    // CREATING OCTOKIT INSTANCE
    const octokit = new Octokit({
      auth: decryptedToken,
    });
    // GET AUTHENTICATED USER
    const { data: githubUser } = await octokit.users.getAuthenticated();
    // TOKEN IS VALID
    res.status(200).json({
      message: "GitHub token is valid!",
      success: true,
      data: {
        isValid: true,
        requiresReconnection: false,
        githubUsername: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURNING ERROR RESPONSE
      res.status(200).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: true,
        data: {
          isValid: false,
          requiresReconnection: true,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error verifying GitHub token. Please try again later.",
      success: false,
      data: {
        isValid: false,
        requiresReconnection: true,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET GITHUB USER PROFILE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GITHUB USER PROFILE ==>
export const getGitHubProfile = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND USER BY ID WITH GITHUB TOKEN
  const user = await User.findById(userId)
    .select("+githubAccessToken githubUsername")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF GITHUB IS CONNECTED
  if (!user.githubAccessToken || !user.githubUsername) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "GitHub is not connected to your account.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DECRYPT ACCESS TOKEN
  let decryptedToken: string;
  try {
    // DECRYPTING ACCESS TOKEN
    decryptedToken = decryptSecret(user.githubAccessToken);
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error processing GitHub token. Please reconnect your account.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH GITHUB PROFILE
  try {
    // CREATING OCTOKIT INSTANCE
    const octokit = new Octokit({
      auth: decryptedToken,
    });
    // GET AUTHENTICATED USER
    const { data: githubUser } = await octokit.users.getAuthenticated();
    // RETURN GITHUB PROFILE
    res.status(200).json({
      message: "GitHub profile retrieved successfully!",
      success: true,
      data: {
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
        company: githubUser.company,
        location: githubUser.location,
        email: githubUser.email,
        publicRepos: githubUser.public_repos,
        followers: githubUser.followers,
        following: githubUser.following,
        createdAt: githubUser.created_at,
        htmlUrl: githubUser.html_url,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching GitHub profile. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

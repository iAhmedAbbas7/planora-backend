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

// <== GITHUB USER TYPE ==>
interface GitHubUserData {
  // <== GITHUB ACCESS TOKEN ==>
  githubAccessToken?: string;
  // <== GITHUB USERNAME ==>
  githubUsername?: string;
}

/**
 * GET OCTOKIT INSTANCE FOR USER
 * @param userId - User ID
 * @returns Object with octokit instance or error
 */
// <== GET OCTOKIT INSTANCE ==>
const getOctokitForUser = async (
  userId: string
): Promise<{
  octokit: Octokit | null;
  error: { status: number; message: string } | null;
}> => {
  // FIND USER BY ID WITH GITHUB TOKEN
  const user = await User.findById(userId)
    .select("+githubAccessToken githubUsername")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    return {
      octokit: null,
      error: { status: 404, message: "User not found!" },
    };
  }
  // CAST USER TO GITHUB USER DATA TYPE
  const githubUser = user as unknown as GitHubUserData;
  // CHECK IF GITHUB IS CONNECTED
  if (!githubUser.githubAccessToken || !githubUser.githubUsername) {
    return {
      octokit: null,
      error: {
        status: 400,
        message: "GitHub is not connected to your account.",
      },
    };
  }
  // DECRYPT ACCESS TOKEN
  let decryptedToken: string;
  try {
    // DECRYPTING ACCESS TOKEN
    decryptedToken = decryptSecret(githubUser.githubAccessToken);
  } catch (error) {
    return {
      octokit: null,
      error: {
        status: 500,
        message:
          "Error processing GitHub token. Please reconnect your account.",
      },
    };
  }
  // CREATE AND RETURN OCTOKIT INSTANCE
  const octokit = new Octokit({ auth: decryptedToken });
  return { octokit, error: null };
};

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

/**
 * GET USER REPOSITORIES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USER REPOSITORIES ==>
export const getRepositories = expressAsyncHandler(async (req, res) => {
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
  // SET PAGE QUERY PARAMETERS
  const page = parseInt(req.query.page as string) || 1;
  // SET PER PAGE QUERY PARAMETERS
  const perPage = parseInt(req.query.per_page as string) || 30;
  // SET SORT QUERY PARAMETERS
  const sort = (req.query.sort as string) || "updated";
  // SET DIRECTION QUERY PARAMETERS
  const direction = (req.query.direction as string) || "desc";
  // SET TYPE QUERY PARAMETERS
  const type = (req.query.type as string) || "all";
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH REPOSITORIES
  try {
    // GET AUTHENTICATED USER'S REPOSITORIES
    const { data: repositories } = await octokit.repos.listForAuthenticatedUser(
      {
        sort: sort as "created" | "updated" | "pushed" | "full_name",
        direction: direction as "asc" | "desc",
        per_page: perPage,
        page: page,
        type: type as "all" | "owner" | "public" | "private" | "member",
      }
    );
    // MAP REPOSITORIES TO SIMPLIFIED FORMAT
    const mappedRepos = repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      htmlUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      language: repo.language,
      stargazersCount: repo.stargazers_count,
      watchersCount: repo.watchers_count,
      forksCount: repo.forks_count,
      openIssuesCount: repo.open_issues_count,
      defaultBranch: repo.default_branch,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      owner: {
        login: repo.owner?.login,
        avatarUrl: repo.owner?.avatar_url,
      },
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repositories retrieved successfully!",
      success: true,
      data: {
        repositories: mappedRepos,
        pagination: {
          page,
          perPage,
          hasMore: repositories.length === perPage,
        },
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
      message: "Error fetching repositories. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY DETAILS ==>
export const getRepositoryDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH REPOSITORY DETAILS
  try {
    // GET REPOSITORY
    const { data: repository } = await octokit.repos.get({
      owner,
      repo,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository details retrieved successfully!",
      success: true,
      data: {
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        private: repository.private,
        htmlUrl: repository.html_url,
        cloneUrl: repository.clone_url,
        sshUrl: repository.ssh_url,
        homepage: repository.homepage,
        language: repository.language,
        stargazersCount: repository.stargazers_count,
        watchersCount: repository.watchers_count,
        forksCount: repository.forks_count,
        openIssuesCount: repository.open_issues_count,
        defaultBranch: repository.default_branch,
        topics: repository.topics,
        hasIssues: repository.has_issues,
        hasProjects: repository.has_projects,
        hasWiki: repository.has_wiki,
        hasPages: repository.has_pages,
        hasDownloads: repository.has_downloads,
        archived: repository.archived,
        disabled: repository.disabled,
        visibility: repository.visibility,
        license: repository.license
          ? {
              key: repository.license.key,
              name: repository.license.name,
              spdxId: repository.license.spdx_id,
            }
          : null,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
        pushedAt: repository.pushed_at,
        size: repository.size,
        owner: {
          login: repository.owner.login,
          avatarUrl: repository.owner.avatar_url,
          htmlUrl: repository.owner.html_url,
        },
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
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching repository details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY COMMITS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY COMMITS ==>
export const getRepositoryCommits = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // SET PAGE QUERY PARAMETERS
  const page = parseInt(req.query.page as string) || 1;
  // SET PER PAGE QUERY PARAMETERS
  const perPage = parseInt(req.query.per_page as string) || 30;
  // SET SHA QUERY PARAMETERS
  const sha = req.query.sha as string;
  // SET PATH QUERY PARAMETERS
  const path = req.query.path as string;
  // SET AUTHOR QUERY PARAMETERS
  const author = req.query.author as string;
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH COMMITS
  try {
    // GET REPOSITORY COMMITS
    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      per_page: perPage,
      page: page,
      ...(sha && { sha }),
      ...(path && { path }),
      ...(author && { author }),
    });
    // MAP COMMITS TO SIMPLIFIED FORMAT
    const mappedCommits = commits.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author?.name,
        email: commit.commit.author?.email,
        date: commit.commit.author?.date,
        login: commit.author?.login,
        avatarUrl: commit.author?.avatar_url,
      },
      committer: {
        name: commit.commit.committer?.name,
        email: commit.commit.committer?.email,
        date: commit.commit.committer?.date,
        login: commit.committer?.login,
        avatarUrl: commit.committer?.avatar_url,
      },
      htmlUrl: commit.html_url,
      stats: commit.stats,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commits retrieved successfully!",
      success: true,
      data: {
        commits: mappedCommits,
        pagination: {
          page,
          perPage,
          hasMore: commits.length === perPage,
        },
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
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching commits. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY ISSUES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY ISSUES ==>
export const getRepositoryIssues = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // SET PAGE QUERY PARAMETERS
  const page = parseInt(req.query.page as string) || 1;
  // SET PER PAGE QUERY PARAMETERS
  const perPage = parseInt(req.query.per_page as string) || 30;
  // SET STATE QUERY PARAMETERS
  const state = (req.query.state as string) || "open";
  // SET SORT QUERY PARAMETERS
  const sort = (req.query.sort as string) || "created";
  // SET DIRECTION QUERY PARAMETERS
  const direction = (req.query.direction as string) || "desc";
  // SET LABELS QUERY PARAMETERS
  const labels = req.query.labels as string;
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH ISSUES
  try {
    // GET REPOSITORY ISSUES
    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: state as "open" | "closed" | "all",
      sort: sort as "created" | "updated" | "comments",
      direction: direction as "asc" | "desc",
      per_page: perPage,
      page: page,
      ...(labels && { labels }),
    });
    // FILTER OUT PULL REQUESTS (GITHUB API RETURNS PRs IN ISSUES ENDPOINT)
    const filteredIssues = issues.filter((issue) => !issue.pull_request);
    // MAP ISSUES TO SIMPLIFIED FORMAT
    const mappedIssues = filteredIssues.map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      htmlUrl: issue.html_url,
      commentsCount: issue.comments,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      user: {
        login: issue.user?.login,
        avatarUrl: issue.user?.avatar_url,
      },
      labels: issue.labels.map((label) =>
        typeof label === "string"
          ? { name: label, color: null }
          : { name: label.name, color: label.color }
      ),
      assignees: issue.assignees?.map((assignee) => ({
        login: assignee.login,
        avatarUrl: assignee.avatar_url,
      })),
      milestone: issue.milestone
        ? {
            title: issue.milestone.title,
            state: issue.milestone.state,
            dueOn: issue.milestone.due_on,
          }
        : null,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Issues retrieved successfully!",
      success: true,
      data: {
        issues: mappedIssues,
        pagination: {
          page,
          perPage,
          hasMore: filteredIssues.length === perPage,
        },
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
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching issues. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY PULL REQUESTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY PULL REQUESTS ==>
export const getRepositoryPullRequests = expressAsyncHandler(
  async (req, res) => {
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
    // GET OWNER AND REPO FROM PARAMS
    const { owner, repo } = req.params;
    // VALIDATE OWNER AND REPO
    if (!owner || !repo) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Owner and repository name are required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // SET PAGE QUERY PARAMETERS
    const page = parseInt(req.query.page as string) || 1;
    // SET PER PAGE QUERY PARAMETERS
    const perPage = parseInt(req.query.per_page as string) || 30;
    // SET STATE QUERY PARAMETERS
    const state = (req.query.state as string) || "open";
    // SET SORT QUERY PARAMETERS
    const sort = (req.query.sort as string) || "created";
    // SET DIRECTION QUERY PARAMETERS
    const direction = (req.query.direction as string) || "desc";
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      // RETURNING ERROR RESPONSE
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FETCH PULL REQUESTS
    try {
      // GET REPOSITORY PULL REQUESTS
      const { data: pullRequests } = await octokit.pulls.list({
        owner,
        repo,
        state: state as "open" | "closed" | "all",
        sort: sort as "created" | "updated" | "popularity" | "long-running",
        direction: direction as "asc" | "desc",
        per_page: perPage,
        page: page,
      });
      // MAP PULL REQUESTS TO SIMPLIFIED FORMAT
      const mappedPullRequests = pullRequests.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        htmlUrl: pr.html_url,
        draft: pr.draft,
        merged: pr.merged_at !== null,
        mergedAt: pr.merged_at,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
          label: pr.head.label,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
          label: pr.base.label,
        },
        user: {
          login: pr.user?.login,
          avatarUrl: pr.user?.avatar_url,
        },
        labels: pr.labels.map((label) => ({
          name: label.name,
          color: label.color,
        })),
        assignees: pr.assignees?.map((assignee) => ({
          login: assignee.login,
          avatarUrl: assignee.avatar_url,
        })),
        requestedReviewers: pr.requested_reviewers?.map((reviewer) => ({
          login: reviewer.login,
          avatarUrl: reviewer.avatar_url,
        })),
      }));
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Pull requests retrieved successfully!",
        success: true,
        data: {
          pullRequests: mappedPullRequests,
          pagination: {
            page,
            perPage,
            hasMore: pullRequests.length === perPage,
          },
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
      // REPOSITORY NOT FOUND
      if (error.status === 404) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "Repository not found or you don't have access to it.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error fetching pull requests. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * GET REPOSITORY README
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY README ==>
export const getRepositoryReadme = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH README
  try {
    // GET REPOSITORY README
    const { data: readme } = await octokit.repos.getReadme({
      owner,
      repo,
      mediaType: {
        format: "raw",
      },
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "README retrieved successfully!",
      success: true,
      data: {
        content: readme as unknown as string,
        encoding: "utf-8",
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
    // README NOT FOUND
    if (error.status === 404) {
      // RETURNING SUCCESS RESPONSE WITH NULL CONTENT
      res.status(200).json({
        message: "Repository does not have a README file.",
        success: true,
        data: {
          content: null,
          encoding: null,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching README. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY BRANCHES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY BRANCHES ==>
export const getRepositoryBranches = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // SET PAGE QUERY PARAMETERS
  const page = parseInt(req.query.page as string) || 1;
  // SET PER PAGE QUERY PARAMETERS
  const perPage = parseInt(req.query.per_page as string) || 30;
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH BRANCHES
  try {
    // GET REPOSITORY BRANCHES
    const { data: branches } = await octokit.repos.listBranches({
      owner,
      repo,
      per_page: perPage,
      page: page,
    });
    // MAP BRANCHES TO SIMPLIFIED FORMAT
    const mappedBranches = branches.map((branch) => ({
      name: branch.name,
      protected: branch.protected,
      sha: branch.commit.sha,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Branches retrieved successfully!",
      success: true,
      data: {
        branches: mappedBranches,
        pagination: {
          page,
          perPage,
          hasMore: branches.length === perPage,
        },
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
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching branches. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY LANGUAGES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY LANGUAGES ==>
export const getRepositoryLanguages = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH LANGUAGES
  try {
    // GET REPOSITORY LANGUAGES
    const { data: languages } = await octokit.repos.listLanguages({
      owner,
      repo,
    });
    // CALCULATE TOTAL BYTES
    const totalBytes = Object.values(languages).reduce(
      (sum, bytes) => sum + bytes,
      0
    );
    // MAP LANGUAGES TO ARRAY WITH PERCENTAGES
    const languageArray = Object.entries(languages).map(([name, bytes]) => ({
      name,
      bytes,
      percentage:
        totalBytes > 0 ? ((bytes / totalBytes) * 100).toFixed(2) : "0",
    }));
    // SORT BY BYTES DESCENDING
    languageArray.sort((a, b) => b.bytes - a.bytes);
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Languages retrieved successfully!",
      success: true,
      data: {
        languages: languageArray,
        totalBytes,
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
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching languages. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY CONTRIBUTORS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY CONTRIBUTORS ==>
export const getRepositoryContributors = expressAsyncHandler(
  async (req, res) => {
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
    // GET OWNER AND REPO FROM PARAMS
    const { owner, repo } = req.params;
    // VALIDATE OWNER AND REPO
    if (!owner || !repo) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Owner and repository name are required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // SET PAGE QUERY PARAMETERS
    const page = parseInt(req.query.page as string) || 1;
    // SET PER PAGE QUERY PARAMETERS
    const perPage = parseInt(req.query.per_page as string) || 30;
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      // RETURNING ERROR RESPONSE
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FETCH CONTRIBUTORS
    try {
      // GET REPOSITORY CONTRIBUTORS
      const { data: contributors } = await octokit.repos.listContributors({
        owner,
        repo,
        per_page: perPage,
        page: page,
      });
      // MAP CONTRIBUTORS TO SIMPLIFIED FORMAT
      const mappedContributors = contributors.map((contributor) => ({
        login: contributor.login,
        avatarUrl: contributor.avatar_url,
        htmlUrl: contributor.html_url,
        contributions: contributor.contributions,
        type: contributor.type,
      }));
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Contributors retrieved successfully!",
        success: true,
        data: {
          contributors: mappedContributors,
          pagination: {
            page,
            perPage,
            hasMore: contributors.length === perPage,
          },
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
      // REPOSITORY NOT FOUND
      if (error.status === 404) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "Repository not found or you don't have access to it.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error fetching contributors. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

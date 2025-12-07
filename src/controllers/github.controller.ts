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
  // SET SEARCH QUERY PARAMETER
  const searchQuery = (req.query.q as string) || "";
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
    // IF SEARCH QUERY IS PROVIDED, USE SEARCH API
    if (searchQuery.trim()) {
      // GET AUTHENTICATED USER
      const { data: user } = await octokit.users.getAuthenticated();
      // SEARCH REPOSITORIES FOR THE USER
      const { data: searchResults } = await octokit.search.repos({
        q: `${searchQuery} user:${user.login}`,
        sort: "updated",
        order: "desc",
        per_page: perPage,
        page: page,
      });
      // MAP SEARCH RESULTS TO SIMPLIFIED FORMAT
      const mappedRepos = searchResults.items.map((repo) => ({
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
        message: "Repositories searched successfully!",
        success: true,
        data: {
          repositories: mappedRepos,
          pagination: {
            page,
            perPage,
            hasMore: searchResults.total_count > page * perPage,
            totalCount: searchResults.total_count,
          },
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET AUTHENTICATED USER'S REPOSITORIES (NO SEARCH)
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
 * GET ISSUE DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ISSUE DETAILS ==>
export const getIssueDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND ISSUE NUMBER FROM PARAMS
  const { owner, repo, issue_number } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !issue_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and issue number are required!",
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
  // FETCH ISSUE DETAILS
  try {
    // GET ISSUE DETAILS
    const { data: issue } = await octokit.issues.get({
      owner,
      repo,
      issue_number: parseInt(issue_number),
    });
    // MAP ISSUE TO SIMPLIFIED FORMAT
    const mappedIssue = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      bodyHtml: issue.body_html,
      state: issue.state,
      stateReason: issue.state_reason,
      htmlUrl: issue.html_url,
      commentsCount: issue.comments,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      user: {
        login: issue.user?.login,
        avatarUrl: issue.user?.avatar_url,
        htmlUrl: issue.user?.html_url,
      },
      labels: issue.labels.map((label) =>
        typeof label === "string"
          ? { id: null, name: label, color: null, description: null }
          : {
              id: label.id,
              name: label.name,
              color: label.color,
              description: label.description,
            }
      ),
      assignees: issue.assignees?.map((assignee) => ({
        login: assignee.login,
        avatarUrl: assignee.avatar_url,
        htmlUrl: assignee.html_url,
      })),
      milestone: issue.milestone
        ? {
            id: issue.milestone.id,
            number: issue.milestone.number,
            title: issue.milestone.title,
            description: issue.milestone.description,
            state: issue.milestone.state,
            dueOn: issue.milestone.due_on,
          }
        : null,
      closedBy: issue.closed_by
        ? {
            login: issue.closed_by.login,
            avatarUrl: issue.closed_by.avatar_url,
          }
        : null,
      reactions: {
        totalCount: issue.reactions?.total_count || 0,
        plusOne: issue.reactions?.["+1"] || 0,
        minusOne: issue.reactions?.["-1"] || 0,
        laugh: issue.reactions?.laugh || 0,
        hooray: issue.reactions?.hooray || 0,
        confused: issue.reactions?.confused || 0,
        heart: issue.reactions?.heart || 0,
        rocket: issue.reactions?.rocket || 0,
        eyes: issue.reactions?.eyes || 0,
      },
      locked: issue.locked,
      authorAssociation: issue.author_association,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Issue details retrieved successfully!",
      success: true,
      data: mappedIssue,
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
    // ISSUE NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Issue not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching issue details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE ISSUE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE ISSUE ==>
export const createIssue = expressAsyncHandler(async (req, res) => {
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
  // GET ISSUE DATA FROM BODY
  const { title, body, labels, assignees, milestone } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE TITLE
  if (!title || typeof title !== "string" || !title.trim()) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Issue title is required!",
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
  // CREATE ISSUE
  try {
    // CREATE ISSUE ON GITHUB
    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: title.trim(),
      body: body || undefined,
      labels: labels || undefined,
      assignees: assignees || undefined,
      milestone: milestone || undefined,
    });
    // MAP ISSUE TO SIMPLIFIED FORMAT
    const mappedIssue = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      htmlUrl: issue.html_url,
      commentsCount: issue.comments,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
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
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Issue created successfully!",
      success: true,
      data: mappedIssue,
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
    // REPOSITORY NOT FOUND OR NO PERMISSION
    if (error.status === 404 || error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(error.status).json({
        message:
          "Repository not found or you don't have permission to create issues.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATION ERROR
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: error.message || "Invalid issue data.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating issue. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UPDATE ISSUE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE ISSUE ==>
export const updateIssue = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND ISSUE NUMBER FROM PARAMS
  const { owner, repo, issue_number } = req.params;
  // GET UPDATE DATA FROM BODY
  const { title, body, state, stateReason, labels, assignees, milestone } =
    req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !issue_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and issue number are required!",
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
  // UPDATE ISSUE
  try {
    // BUILD UPDATE OBJECT
    const updateData: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      state_reason?: "completed" | "not_planned" | "reopened" | null;
      labels?: string[];
      assignees?: string[];
      milestone?: number | null;
    } = {};
    // ADD TITLE IF PROVIDED
    if (title !== undefined) updateData.title = title;
    // ADD BODY IF PROVIDED
    if (body !== undefined) updateData.body = body;
    // ADD STATE IF PROVIDED
    if (state !== undefined) updateData.state = state;
    // ADD STATE REASON IF PROVIDED
    if (stateReason !== undefined) updateData.state_reason = stateReason;
    // ADD LABELS IF PROVIDED
    if (labels !== undefined) updateData.labels = labels;
    // ADD ASSIGNEES IF PROVIDED
    if (assignees !== undefined) updateData.assignees = assignees;
    // ADD MILESTONE IF PROVIDED
    if (milestone !== undefined) updateData.milestone = milestone;
    // UPDATE ISSUE ON GITHUB
    const { data: issue } = await octokit.issues.update({
      owner,
      repo,
      issue_number: parseInt(issue_number),
      ...updateData,
    });
    // MAP ISSUE TO SIMPLIFIED FORMAT
    const mappedIssue = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      stateReason: issue.state_reason,
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
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Issue updated successfully!",
      success: true,
      data: mappedIssue,
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
    // ISSUE NOT FOUND OR NO PERMISSION
    if (error.status === 404 || error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(error.status).json({
        message: "Issue not found or you don't have permission to update it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error updating issue. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET ISSUE COMMENTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ISSUE COMMENTS ==>
export const getIssueComments = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND ISSUE NUMBER FROM PARAMS
  const { owner, repo, issue_number } = req.params;
  // SET PAGE QUERY PARAMETERS
  const page = parseInt(req.query.page as string) || 1;
  // SET PER PAGE QUERY PARAMETERS
  const perPage = parseInt(req.query.per_page as string) || 30;
  // VALIDATE PARAMS
  if (!owner || !repo || !issue_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and issue number are required!",
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
  // FETCH ISSUE COMMENTS
  try {
    // GET ISSUE COMMENTS
    const { data: comments } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: parseInt(issue_number),
      page,
      per_page: perPage,
    });
    // MAP COMMENTS TO SIMPLIFIED FORMAT
    const mappedComments = comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      bodyHtml: comment.body_html,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        login: comment.user?.login,
        avatarUrl: comment.user?.avatar_url,
        htmlUrl: comment.user?.html_url,
      },
      htmlUrl: comment.html_url,
      authorAssociation: comment.author_association,
      reactions: {
        totalCount: comment.reactions?.total_count || 0,
        plusOne: comment.reactions?.["+1"] || 0,
        minusOne: comment.reactions?.["-1"] || 0,
        laugh: comment.reactions?.laugh || 0,
        hooray: comment.reactions?.hooray || 0,
        confused: comment.reactions?.confused || 0,
        heart: comment.reactions?.heart || 0,
        rocket: comment.reactions?.rocket || 0,
        eyes: comment.reactions?.eyes || 0,
      },
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Issue comments retrieved successfully!",
      success: true,
      data: {
        comments: mappedComments,
        pagination: {
          page,
          perPage,
          hasMore: comments.length === perPage,
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
    // ISSUE NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Issue not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching issue comments. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * ADD ISSUE COMMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ADD ISSUE COMMENT ==>
export const addIssueComment = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND ISSUE NUMBER FROM PARAMS
  const { owner, repo, issue_number } = req.params;
  // GET COMMENT BODY FROM BODY
  const { body } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !issue_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and issue number are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE BODY
  if (!body || typeof body !== "string" || !body.trim()) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Comment body is required!",
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
  // ADD ISSUE COMMENT
  try {
    // CREATE COMMENT ON GITHUB
    const { data: comment } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(issue_number),
      body: body.trim(),
    });
    // MAP COMMENT TO SIMPLIFIED FORMAT
    const mappedComment = {
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        login: comment.user?.login,
        avatarUrl: comment.user?.avatar_url,
      },
      htmlUrl: comment.html_url,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Comment added successfully!",
      success: true,
      data: mappedComment,
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
    // ISSUE NOT FOUND OR NO PERMISSION
    if (error.status === 404 || error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(error.status).json({
        message: "Issue not found or you don't have permission to comment.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error adding comment. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY LABELS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY LABELS ==>
export const getRepositoryLabels = expressAsyncHandler(async (req, res) => {
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
  // SET PAGE QUERY PARAMETERS
  const page = parseInt(req.query.page as string) || 1;
  // SET PER PAGE QUERY PARAMETERS
  const perPage = parseInt(req.query.per_page as string) || 100;
  // VALIDATE PARAMS
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
  // FETCH REPOSITORY LABELS
  try {
    // GET REPOSITORY LABELS
    const { data: labels } = await octokit.issues.listLabelsForRepo({
      owner,
      repo,
      page,
      per_page: perPage,
    });
    // MAP LABELS TO SIMPLIFIED FORMAT
    const mappedLabels = labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
      default: label.default,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Labels retrieved successfully!",
      success: true,
      data: {
        labels: mappedLabels,
        pagination: {
          page,
          perPage,
          hasMore: labels.length === perPage,
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
        message: "Repository not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching labels. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * SEARCH ISSUES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SEARCH ISSUES ==>
export const searchIssues = expressAsyncHandler(async (req, res) => {
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
  // GET SEARCH QUERY FROM QUERY PARAMS
  const query = req.query.q as string;
  // SET PAGE QUERY PARAMETERS
  const page = parseInt(req.query.page as string) || 1;
  // SET PER PAGE QUERY PARAMETERS
  const perPage = parseInt(req.query.per_page as string) || 30;
  // SET STATE QUERY PARAMETERS
  const state = req.query.state as string;
  // VALIDATE PARAMS
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
  // SEARCH ISSUES
  try {
    // BUILD SEARCH QUERY
    let searchQuery = `repo:${owner}/${repo} is:issue`;
    if (query) searchQuery += ` ${query}`;
    if (state && state !== "all") searchQuery += ` is:${state}`;
    // SEARCH ISSUES ON GITHUB
    const { data } = await octokit.search.issuesAndPullRequests({
      q: searchQuery,
      page,
      per_page: perPage,
      sort: "updated",
      order: "desc",
    });
    // FILTER OUT PULL REQUESTS (SEARCH API MAY RETURN THEM)
    const issues = data.items.filter((item) => !item.pull_request);
    // MAP ISSUES TO SIMPLIFIED FORMAT
    const mappedIssues = issues.map((issue) => ({
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
      score: issue.score,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Issues search completed successfully!",
      success: true,
      data: {
        issues: mappedIssues,
        totalCount: data.total_count,
        pagination: {
          page,
          perPage,
          hasMore: page * perPage < data.total_count,
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
      message: "Error searching issues. Please try again later.",
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
 * GET BRANCH DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET BRANCH DETAILS ==>
export const getBranchDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND BRANCH FROM PARAMS
  const { owner, repo, branch } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !branch) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and branch name are required!",
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
  // FETCH BRANCH DETAILS
  try {
    // GET BRANCH
    const { data: branchData } = await octokit.repos.getBranch({
      owner,
      repo,
      branch,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Branch details retrieved successfully!",
      success: true,
      data: {
        name: branchData.name,
        protected: branchData.protected,
        commit: {
          sha: branchData.commit.sha,
          url: branchData.commit.url,
          author: branchData.commit.commit.author,
          committer: branchData.commit.commit.committer,
          message: branchData.commit.commit.message,
        },
        protection: branchData.protection,
        protectionUrl: branchData.protection_url,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching branch details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE BRANCH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE BRANCH ==>
export const createBranch = expressAsyncHandler(async (req, res) => {
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
  // GET BRANCH DATA FROM BODY
  const { branchName, sourceBranch, sourceSha } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE BRANCH NAME
  if (!branchName || typeof branchName !== "string") {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Branch name is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE SOURCE (EITHER SOURCE BRANCH OR SOURCE SHA)
  if (!sourceBranch && !sourceSha) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Either source branch or source SHA is required!",
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
  // CREATE BRANCH
  try {
    // GET SHA TO CREATE FROM
    let sha = sourceSha;
    // IF SOURCE BRANCH IS PROVIDED, GET ITS SHA
    if (!sha && sourceBranch) {
      // GET SOURCE BRANCH
      const { data: sourceRef } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${sourceBranch}`,
      });
      // GET SHA FROM SOURCE BRANCH
      sha = sourceRef.object.sha;
    }
    // CREATE BRANCH (REF)
    const { data: newRef } = await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: sha,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: `Branch '${branchName}' created successfully!`,
      success: true,
      data: {
        ref: newRef.ref,
        sha: newRef.object.sha,
        url: newRef.url,
        branchName: branchName,
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
    // BRANCH ALREADY EXISTS
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: `Branch '${branchName}' already exists.`,
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // SOURCE NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Source branch or repository not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to create branches in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating branch. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE BRANCH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE BRANCH ==>
export const deleteBranch = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND BRANCH FROM PARAMS
  const { owner, repo, branch } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !branch) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and branch name are required!",
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
  // DELETE BRANCH
  try {
    // CHECK IF IT'S THE DEFAULT BRANCH
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    // IF DEFAULT BRANCH, RETURN ERROR
    if (repoData.default_branch === branch) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Cannot delete the default branch. Change the default branch first.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // DELETE BRANCH (REF)
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: `Branch '${branch}' deleted successfully!`,
      success: true,
      data: {
        deletedBranch: branch,
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
    // BRANCH NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN (PROTECTED BRANCH)
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "Cannot delete this branch. It may be protected or you don't have permission.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // UNPROCESSABLE (BRANCH IS PROTECTED)
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: "Cannot delete a protected branch. Remove protection first.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error deleting branch. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * MERGE BRANCHES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MERGE BRANCHES ==>
export const mergeBranches = expressAsyncHandler(async (req, res) => {
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
  // GET MERGE DATA FROM BODY
  const { base, head, commitMessage } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE BASE AND HEAD
  if (!base || !head) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Base branch and head branch are required!",
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
  // MERGE BRANCHES
  try {
    // MERGE BRANCHES
    const { data: mergeResult } = await octokit.repos.merge({
      owner,
      repo,
      base,
      head,
      commit_message: commitMessage || `Merge ${head} into ${base}`,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: `Successfully merged '${head}' into '${base}'!`,
      success: true,
      data: {
        sha: mergeResult.sha,
        merged: true,
        message: mergeResult.commit.message,
        author: mergeResult.commit.author,
        committer: mergeResult.commit.committer,
        htmlUrl: mergeResult.html_url,
        parents: mergeResult.parents.map((p) => ({
          sha: p.sha,
          url: p.html_url,
        })),
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
    // CONFLICT
    if (error.status === 409) {
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "Merge conflict! The branches cannot be automatically merged.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to merge branches in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NO CHANGES
    if (error.status === 204) {
      // RETURNING SUCCESS RESPONSE (NOTHING TO MERGE)
      res.status(200).json({
        message: "Nothing to merge. Branches are already up to date.",
        success: true,
        data: {
          merged: false,
          alreadyUpToDate: true,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error merging branches. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET BRANCH PROTECTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET BRANCH PROTECTION ==>
export const getBranchProtection = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND BRANCH FROM PARAMS
  const { owner, repo, branch } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !branch) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and branch name are required!",
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
  // GET BRANCH PROTECTION
  try {
    // GET BRANCH PROTECTION RULES
    const { data: protection } = await octokit.repos.getBranchProtection({
      owner,
      repo,
      branch,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Branch protection retrieved successfully!",
      success: true,
      data: {
        url: protection.url,
        requiredStatusChecks: protection.required_status_checks
          ? {
              strict: protection.required_status_checks.strict,
              contexts: protection.required_status_checks.contexts,
            }
          : null,
        enforceAdmins: protection.enforce_admins?.enabled || false,
        requiredPullRequestReviews: protection.required_pull_request_reviews
          ? {
              dismissStaleReviews:
                protection.required_pull_request_reviews.dismiss_stale_reviews,
              requireCodeOwnerReviews:
                protection.required_pull_request_reviews
                  .require_code_owner_reviews,
              requiredApprovingReviewCount:
                protection.required_pull_request_reviews
                  .required_approving_review_count,
              requireLastPushApproval:
                protection.required_pull_request_reviews
                  .require_last_push_approval,
            }
          : null,
        restrictions: protection.restrictions
          ? {
              users: protection.restrictions.users?.map((u) => u.login) || [],
              teams: protection.restrictions.teams?.map((t) => t.slug) || [],
              apps: protection.restrictions.apps?.map((a) => a.slug) || [],
            }
          : null,
        requiredLinearHistory:
          protection.required_linear_history?.enabled || false,
        allowForcePushes: protection.allow_force_pushes?.enabled || false,
        allowDeletions: protection.allow_deletions?.enabled || false,
        blockCreations: protection.block_creations?.enabled || false,
        requiredConversationResolution:
          protection.required_conversation_resolution?.enabled || false,
        lockBranch: protection.lock_branch?.enabled || false,
        allowForkSyncing: protection.allow_fork_syncing?.enabled || false,
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
    // NOT FOUND (NO PROTECTION RULES)
    if (error.status === 404) {
      // RETURNING SUCCESS RESPONSE (NO PROTECTION)
      res.status(200).json({
        message: "Branch is not protected.",
        success: true,
        data: {
          isProtected: false,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching branch protection. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UPDATE BRANCH PROTECTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE BRANCH PROTECTION ==>
export const updateBranchProtection = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND BRANCH FROM PARAMS
  const { owner, repo, branch } = req.params;
  // GET PROTECTION DATA FROM BODY
  const {
    requiredStatusChecks,
    enforceAdmins,
    requiredPullRequestReviews,
    restrictions,
    requiredLinearHistory,
    allowForcePushes,
    allowDeletions,
    requiredConversationResolution,
  } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !branch) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and branch name are required!",
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
  // UPDATE BRANCH PROTECTION
  try {
    // UPDATE BRANCH PROTECTION RULES
    await octokit.repos.updateBranchProtection({
      owner,
      repo,
      branch,
      required_status_checks: requiredStatusChecks
        ? {
            strict: requiredStatusChecks.strict || false,
            contexts: requiredStatusChecks.contexts || [],
          }
        : null,
      enforce_admins: enforceAdmins || false,
      required_pull_request_reviews: requiredPullRequestReviews
        ? {
            dismiss_stale_reviews:
              requiredPullRequestReviews.dismissStaleReviews || false,
            require_code_owner_reviews:
              requiredPullRequestReviews.requireCodeOwnerReviews || false,
            required_approving_review_count:
              requiredPullRequestReviews.requiredApprovingReviewCount || 1,
            require_last_push_approval:
              requiredPullRequestReviews.requireLastPushApproval || false,
          }
        : null,
      restrictions: restrictions
        ? {
            users: restrictions.users || [],
            teams: restrictions.teams || [],
            apps: restrictions.apps || [],
          }
        : null,
      required_linear_history: requiredLinearHistory || false,
      allow_force_pushes: allowForcePushes || false,
      allow_deletions: allowDeletions || false,
      required_conversation_resolution: requiredConversationResolution || false,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Branch protection updated successfully!",
      success: true,
      data: {
        branch,
        protected: true,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to update branch protection. Admin access required.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATION ERROR
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: "Invalid protection rules. Please check your settings.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error updating branch protection. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE BRANCH PROTECTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE BRANCH PROTECTION ==>
export const deleteBranchProtection = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND BRANCH FROM PARAMS
  const { owner, repo, branch } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !branch) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and branch name are required!",
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
  // DELETE BRANCH PROTECTION
  try {
    // DELETE BRANCH PROTECTION RULES
    await octokit.repos.deleteBranchProtection({
      owner,
      repo,
      branch,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Branch protection removed successfully!",
      success: true,
      data: {
        branch,
        protected: false,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Branch or protection rules not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to remove branch protection. Admin access required.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error removing branch protection. Please try again later.",
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

/**
 * CREATE A NEW REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE REPOSITORY ==>
export const createRepository = expressAsyncHandler(async (req, res) => {
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
  // GET REPOSITORY DATA FROM BODY
  const {
    name,
    description,
    private: isPrivate,
    autoInit,
    gitignoreTemplate,
    licenseTemplate,
  } = req.body;
  // VALIDATE NAME
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Repository name is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE NAME FORMAT (ALPHANUMERIC, HYPHENS, UNDERSCORES)
  const nameRegex = /^[a-zA-Z0-9._-]+$/;
  // IF NAME DOES NOT MATCH REGEX, RETURN ERROR
  if (!nameRegex.test(name.trim())) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Repository name can only contain alphanumeric characters, hyphens, underscores, and periods.",
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
  // CREATE REPOSITORY
  try {
    // CREATE REPOSITORY ON GITHUB
    const { data: repository } = await octokit.repos.createForAuthenticatedUser(
      {
        name: name.trim(),
        description: description || undefined,
        private: isPrivate ?? false,
        auto_init: autoInit ?? true,
        gitignore_template: gitignoreTemplate || undefined,
        license_template: licenseTemplate || undefined,
      }
    );
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Repository created successfully!",
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
        defaultBranch: repository.default_branch,
        createdAt: repository.created_at,
        owner: {
          login: repository.owner.login,
          avatarUrl: repository.owner.avatar_url,
        },
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR FOR DEBUGGING
    console.error("Error creating repository:", error.message || error);
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
    // VALIDATION ERROR (422)
    if (error.status === 422) {
      // TRY TO GET SPECIFIC ERROR MESSAGE FROM GITHUB
      let errorMessage =
        "A repository with this name already exists. Please choose a different name.";
      // CHECK IF GITHUB PROVIDED SPECIFIC ERROR DETAILS
      if (
        error.response?.data?.errors &&
        error.response.data.errors.length > 0
      ) {
        // GET FIRST ERROR
        const githubError = error.response.data.errors[0];
        // CHECK IF ERROR IS FOR NAME
        if (githubError.field === "name" && githubError.code === "custom") {
          // SET ERROR MESSAGE
          errorMessage = githubError.message || errorMessage;
          // CHECK IF ERROR IS FOR GITIGNORE TEMPLATE
        } else if (githubError.field === "gitignore_template") {
          // SET ERROR MESSAGE
          errorMessage =
            "Invalid .gitignore template. Please select a different one.";
          // CHECK IF ERROR IS FOR LICENSE TEMPLATE
        } else if (githubError.field === "license_template") {
          // SET ERROR MESSAGE
          errorMessage =
            "Invalid license template. Please select a different one.";
          // OTHER ERROR
        } else {
          // SET ERROR MESSAGE
          errorMessage = githubError.message || errorMessage;
        }
      } else if (error.message) {
        // SET ERROR MESSAGE
        errorMessage = error.message;
      }
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: errorMessage,
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message:
        error.message || "Error creating repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * FORK A REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== FORK REPOSITORY ==>
export const forkRepository = expressAsyncHandler(async (req, res) => {
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
  // GET OPTIONAL NEW NAME FROM BODY
  const { name, defaultBranchOnly } = req.body;
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
  // FORK REPOSITORY
  try {
    // FORK REPOSITORY ON GITHUB
    const { data: forkedRepo } = await octokit.repos.createFork({
      owner,
      repo,
      name: name || undefined,
      default_branch_only: defaultBranchOnly ?? false,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(202).json({
      message:
        "Repository fork initiated! It may take a few moments to complete.",
      success: true,
      data: {
        id: forkedRepo.id,
        name: forkedRepo.name,
        fullName: forkedRepo.full_name,
        description: forkedRepo.description,
        private: forkedRepo.private,
        htmlUrl: forkedRepo.html_url,
        cloneUrl: forkedRepo.clone_url,
        sshUrl: forkedRepo.ssh_url,
        defaultBranch: forkedRepo.default_branch,
        createdAt: forkedRepo.created_at,
        fork: true,
        owner: {
          login: forkedRepo.owner.login,
          avatarUrl: forkedRepo.owner.avatar_url,
        },
        parent: forkedRepo.parent
          ? {
              fullName: forkedRepo.parent.full_name,
              htmlUrl: forkedRepo.parent.html_url,
            }
          : null,
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
    // ALREADY FORKED
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You may have already forked this repository or don't have permission to fork it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error forking repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE A REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE REPOSITORY ==>
export const deleteRepository = expressAsyncHandler(async (req, res) => {
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
  // DELETE REPOSITORY
  try {
    // VERIFY USER OWNS THE REPOSITORY
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    // CHECK IF USER HAS ADMIN PERMISSION
    if (!repoData.permissions?.admin) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to delete this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // DELETE REPOSITORY ON GITHUB
    await octokit.repos.delete({ owner, repo });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository deleted successfully!",
      success: true,
      data: {
        deletedRepository: `${owner}/${repo}`,
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
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to delete this repository. Admin access is required.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error deleting repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UPDATE REPOSITORY SETTINGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE REPOSITORY ==>
export const updateRepository = expressAsyncHandler(async (req, res) => {
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
  // GET UPDATE DATA FROM BODY
  const {
    name,
    description,
    homepage,
    private: isPrivate,
    hasIssues,
    hasProjects,
    hasWiki,
    archived,
    defaultBranch,
  } = req.body;
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
  // UPDATE REPOSITORY
  try {
    // BUILD UPDATE OBJECT WITH ONLY PROVIDED FIELDS
    const updateData: Record<string, any> = {};
    // ADD NAME IF PROVIDED
    if (name !== undefined) updateData.name = name;
    // ADD DESCRIPTION IF PROVIDED
    if (description !== undefined) updateData.description = description;
    // ADD HOMEPAGE IF PROVIDED
    if (homepage !== undefined) updateData.homepage = homepage;
    // ADD PRIVATE IF PROVIDED
    if (isPrivate !== undefined) updateData.private = isPrivate;
    // ADD HAS ISSUES IF PROVIDED
    if (hasIssues !== undefined) updateData.has_issues = hasIssues;
    // ADD HAS PROJECTS IF PROVIDED
    if (hasProjects !== undefined) updateData.has_projects = hasProjects;
    // ADD HAS WIKI IF PROVIDED
    if (hasWiki !== undefined) updateData.has_wiki = hasWiki;
    // ADD ARCHIVED IF PROVIDED
    if (archived !== undefined) updateData.archived = archived;
    // ADD DEFAULT BRANCH IF PROVIDED
    if (defaultBranch !== undefined) updateData.default_branch = defaultBranch;
    // CHECK IF THERE ARE ANY UPDATES
    if (Object.keys(updateData).length === 0) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "No update fields provided!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // UPDATE REPOSITORY ON GITHUB
    const { data: repository } = await octokit.repos.update({
      owner,
      repo,
      ...updateData,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository updated successfully!",
      success: true,
      data: {
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        private: repository.private,
        htmlUrl: repository.html_url,
        homepage: repository.homepage,
        hasIssues: repository.has_issues,
        hasProjects: repository.has_projects,
        hasWiki: repository.has_wiki,
        archived: repository.archived,
        defaultBranch: repository.default_branch,
        visibility: repository.visibility,
        updatedAt: repository.updated_at,
        owner: {
          login: repository.owner.login,
          avatarUrl: repository.owner.avatar_url,
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
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to update this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NAME CONFLICT
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: "Invalid update. The repository name may already be taken.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error updating repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET GIT COMMANDS FOR A REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GIT COMMANDS ==>
export const getGitCommands = expressAsyncHandler(async (req, res) => {
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
  // GET REPOSITORY DETAILS
  try {
    // FETCH REPOSITORY DETAILS
    const { data: repository } = await octokit.repos.get({ owner, repo });
    // BUILD GIT COMMANDS
    const commands = {
      // CLONE COMMANDS
      clone: {
        https: `git clone ${repository.clone_url}`,
        ssh: `git clone ${repository.ssh_url}`,
      },
      // ADD REMOTE COMMANDS
      addRemote: {
        https: `git remote add origin ${repository.clone_url}`,
        ssh: `git remote add origin ${repository.ssh_url}`,
      },
      // PUSH COMMANDS
      push: {
        firstPush: `git push -u origin ${repository.default_branch}`,
        regular: `git push origin ${repository.default_branch}`,
      },
      // PULL COMMANDS
      pull: `git pull origin ${repository.default_branch}`,
      // FETCH COMMANDS
      fetch: `git fetch origin`,
      // QUICKSTART FOR EMPTY REPO
      quickstart: {
        newRepo: [
          `echo "# ${repository.name}" >> README.md`,
          `git init`,
          `git add README.md`,
          `git commit -m "Initial commit"`,
          `git branch -M ${repository.default_branch}`,
          `git remote add origin ${repository.clone_url}`,
          `git push -u origin ${repository.default_branch}`,
        ],
        existingRepo: [
          `git remote add origin ${repository.clone_url}`,
          `git branch -M ${repository.default_branch}`,
          `git push -u origin ${repository.default_branch}`,
        ],
      },
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Git commands generated successfully!",
      success: true,
      data: {
        repository: {
          name: repository.name,
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          cloneUrl: repository.clone_url,
          sshUrl: repository.ssh_url,
        },
        commands,
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
      message: "Error generating git commands. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UPDATE REPOSITORY TOPICS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE REPOSITORY TOPICS ==>
export const updateRepositoryTopics = expressAsyncHandler(async (req, res) => {
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
  // GET TOPICS FROM BODY
  const { topics } = req.body;
  // VALIDATE TOPICS
  if (!Array.isArray(topics)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Topics must be an array of strings!",
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
  // UPDATE TOPICS
  try {
    // NORMALIZE TOPICS (LOWERCASE, NO SPACES)
    const normalizedTopics = topics.map((topic: string) =>
      topic.toLowerCase().trim().replace(/\s+/g, "-")
    );
    // UPDATE REPOSITORY TOPICS ON GITHUB
    const { data } = await octokit.repos.replaceAllTopics({
      owner,
      repo,
      names: normalizedTopics,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository topics updated successfully!",
      success: true,
      data: {
        topics: data.names,
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
    // VALIDATION ERROR
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message:
          "Invalid topic format. Topics must be lowercase and can contain hyphens.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error updating topics. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY COLLABORATORS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY COLLABORATORS ==>
export const getRepositoryCollaborators = expressAsyncHandler(
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
    // FETCH COLLABORATORS
    try {
      // GET REPOSITORY COLLABORATORS
      const { data: collaborators } = await octokit.repos.listCollaborators({
        owner,
        repo,
        per_page: 100,
      });
      // MAP COLLABORATORS TO SIMPLIFIED FORMAT
      const mappedCollaborators = collaborators.map((collaborator) => ({
        id: collaborator.id,
        login: collaborator.login,
        avatarUrl: collaborator.avatar_url,
        htmlUrl: collaborator.html_url,
        permissions: collaborator.permissions,
        roleName: collaborator.role_name,
      }));
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Collaborators retrieved successfully!",
        success: true,
        data: {
          collaborators: mappedCollaborators,
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
      // REPOSITORY NOT FOUND OR NO ACCESS
      if (error.status === 404 || error.status === 403) {
        // RETURNING ERROR RESPONSE
        res.status(error.status).json({
          message:
            "Repository not found or you don't have permission to view collaborators.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error fetching collaborators. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * ADD REPOSITORY COLLABORATOR
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ADD REPOSITORY COLLABORATOR ==>
export const addRepositoryCollaborator = expressAsyncHandler(
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
    // GET OWNER, REPO, AND USERNAME FROM PARAMS
    const { owner, repo, username } = req.params;
    // GET PERMISSION FROM BODY
    const { permission } = req.body;
    // VALIDATE PARAMS
    if (!owner || !repo || !username) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Owner, repository name, and username are required!",
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
    // ADD COLLABORATOR
    try {
      // ADD COLLABORATOR TO REPOSITORY
      await octokit.repos.addCollaborator({
        owner,
        repo,
        username,
        permission: permission || "push",
      });
      // RETURNING SUCCESS RESPONSE
      res.status(201).json({
        message: `Invitation sent to ${username}!`,
        success: true,
        data: {
          username,
          permission: permission || "push",
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
      // USER NOT FOUND
      if (error.status === 404) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "User not found or repository doesn't exist.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // NO PERMISSION
      if (error.status === 403) {
        // RETURNING ERROR RESPONSE
        res.status(403).json({
          message: "You don't have permission to add collaborators.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // VALIDATION ERROR
      if (error.status === 422) {
        // RETURNING ERROR RESPONSE
        res.status(422).json({
          message:
            "Invalid permission level or user is already a collaborator.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error adding collaborator. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * REMOVE REPOSITORY COLLABORATOR
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REMOVE REPOSITORY COLLABORATOR ==>
export const removeRepositoryCollaborator = expressAsyncHandler(
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
    // GET OWNER, REPO, AND USERNAME FROM PARAMS
    const { owner, repo, username } = req.params;
    // VALIDATE PARAMS
    if (!owner || !repo || !username) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Owner, repository name, and username are required!",
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
    // REMOVE COLLABORATOR
    try {
      // REMOVE COLLABORATOR FROM REPOSITORY
      await octokit.repos.removeCollaborator({
        owner,
        repo,
        username,
      });
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: `${username} has been removed from collaborators.`,
        success: true,
        data: {
          removedUser: username,
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
      // USER NOT FOUND
      if (error.status === 404) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "User or repository not found.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // NO PERMISSION
      if (error.status === 403) {
        // RETURNING ERROR RESPONSE
        res.status(403).json({
          message: "You don't have permission to remove collaborators.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error removing collaborator. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * TRANSFER REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== TRANSFER REPOSITORY ==>
export const transferRepository = expressAsyncHandler(async (req, res) => {
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
  // GET NEW OWNER FROM BODY
  const { newOwner, teamIds } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE NEW OWNER
  if (!newOwner) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "New owner username or organization is required!",
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
  // TRANSFER REPOSITORY
  try {
    // TRANSFER REPOSITORY ON GITHUB
    const { data: transferredRepo } = await octokit.repos.transfer({
      owner,
      repo,
      new_owner: newOwner,
      team_ids: teamIds || undefined,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(202).json({
      message: `Repository transfer to ${newOwner} initiated!`,
      success: true,
      data: {
        id: transferredRepo.id,
        name: transferredRepo.name,
        fullName: transferredRepo.full_name,
        newOwner: transferredRepo.owner.login,
        htmlUrl: transferredRepo.html_url,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or new owner not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NO PERMISSION
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to transfer this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error transferring repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY CONTENTS (FILE TREE)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY CONTENTS ==>
export const getRepositoryContents = expressAsyncHandler(async (req, res) => {
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
  // GET PATH FROM QUERY (OPTIONAL)
  const path = (req.query.path as string) || "";
  // GET REF FROM QUERY (OPTIONAL)
  const ref = (req.query.ref as string) || "";
  // VALIDATE PARAMS
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
  // GET REPOSITORY CONTENTS
  try {
    // GET CONTENTS FROM GITHUB
    const { data: contents } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    // FORMAT CONTENTS
    const formattedContents = Array.isArray(contents)
      ? contents.map((item) => ({
          name: item.name,
          path: item.path,
          sha: item.sha,
          size: item.size,
          type: item.type,
          downloadUrl: item.download_url,
          htmlUrl: item.html_url,
        }))
      : {
          name: contents.name,
          path: contents.path,
          sha: contents.sha,
          size: contents.size,
          type: contents.type,
          downloadUrl: contents.download_url,
          htmlUrl: contents.html_url,
          content:
            contents.type === "file" && "content" in contents
              ? Buffer.from(contents.content, "base64").toString("utf-8")
              : undefined,
          encoding: "encoding" in contents ? contents.encoding : undefined,
        };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository contents fetched successfully!",
      success: true,
      data: formattedContents,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or path not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching repository contents. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET FILE CONTENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET FILE CONTENT ==>
export const getFileContent = expressAsyncHandler(async (req, res) => {
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
  // GET PATH FROM QUERY
  const path = req.query.path as string;
  // GET REF FROM QUERY
  const ref = (req.query.ref as string) || "";
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE PATH
  if (!path) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "File path is required!",
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
  // GET FILE CONTENT
  try {
    // GET FILE FROM GITHUB
    const { data: file } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ...(ref && { ref }),
    });
    // CHECK IF FILE IS A DIRECTORY
    if (Array.isArray(file)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Path is a directory, not a file.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF FILE HAS CONTENT
    if (file.type !== "file" || !("content" in file)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Cannot read content of this file type.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // DECODE FILE CONTENT
    const content = Buffer.from(file.content, "base64").toString("utf-8");
    // GET FILE EXTENSION FOR LANGUAGE DETECTION
    const extension = path.split(".").pop()?.toLowerCase() || "";
    // LANGUAGE MAP
    const languageMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      rb: "ruby",
      java: "java",
      c: "c",
      cpp: "cpp",
      cs: "csharp",
      go: "go",
      rs: "rust",
      php: "php",
      swift: "swift",
      kt: "kotlin",
      scala: "scala",
      html: "html",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      json: "json",
      xml: "xml",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
      sql: "sql",
      sh: "shell",
      bash: "shell",
      zsh: "shell",
      dockerfile: "dockerfile",
      makefile: "makefile",
      toml: "toml",
      ini: "ini",
      cfg: "ini",
      env: "dotenv",
      gitignore: "plaintext",
      vue: "vue",
      svelte: "svelte",
    };
    // GET LANGUAGE
    const language = languageMap[extension] || "plaintext";
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "File content fetched successfully!",
      success: true,
      data: {
        name: file.name,
        path: file.path,
        sha: file.sha,
        size: file.size,
        content,
        encoding: file.encoding,
        htmlUrl: file.html_url,
        downloadUrl: file.download_url,
        language,
        extension,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "File not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FILE TOO LARGE
    if (error.status === 403 && error.message?.includes("too large")) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "File is too large to display. Please use the download URL.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching file content. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE FILE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE FILE ==>
export const createFile = expressAsyncHandler(async (req, res) => {
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
  // GET FILE DATA FROM BODY
  const { path, content, message, branch } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE REQUIRED FIELDS
  if (!path || content === undefined || !message) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Path, content, and commit message are required!",
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
  // CREATE FILE
  try {
    // ENCODE CONTENT TO BASE64
    const encodedContent = Buffer.from(content).toString("base64");
    // CREATE FILE ON GITHUB
    const { data: result } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: encodedContent,
      branch: branch || undefined,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "File created successfully!",
      success: true,
      data: {
        path: result.content?.path,
        sha: result.content?.sha,
        htmlUrl: result.content?.html_url,
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          htmlUrl: result.commit.html_url,
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
    // FILE ALREADY EXISTS
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: "File already exists. Use update endpoint instead.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NO PERMISSION
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to create files in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating file. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UPDATE FILE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE FILE ==>
export const updateFile = expressAsyncHandler(async (req, res) => {
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
  // GET FILE DATA FROM BODY
  const { path, content, message, sha, branch } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE REQUIRED FIELDS
  if (!path || content === undefined || !message || !sha) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Path, content, commit message, and file SHA are required!",
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
  // UPDATE FILE
  try {
    // ENCODE CONTENT TO BASE64
    const encodedContent = Buffer.from(content).toString("base64");
    // UPDATE FILE ON GITHUB
    const { data: result } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: encodedContent,
      sha,
      branch: branch || undefined,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "File updated successfully!",
      success: true,
      data: {
        path: result.content?.path,
        sha: result.content?.sha,
        htmlUrl: result.content?.html_url,
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          htmlUrl: result.commit.html_url,
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
    // CONFLICT - SHA MISMATCH
    if (error.status === 409) {
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "File has been modified. Please refresh and try again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NO PERMISSION
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to update files in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "File, repository, or branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error updating file. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE FILE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE FILE ==>
export const deleteFile = expressAsyncHandler(async (req, res) => {
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
  // GET FILE DATA FROM BODY
  const { path, message, sha, branch } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE REQUIRED FIELDS
  if (!path || !message || !sha) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Path, commit message, and file SHA are required!",
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
  // DELETE FILE
  try {
    // DELETE FILE ON GITHUB
    const { data: result } = await octokit.repos.deleteFile({
      owner,
      repo,
      path,
      message,
      sha,
      branch: branch || undefined,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "File deleted successfully!",
      success: true,
      data: {
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          htmlUrl: result.commit.html_url,
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
    // CONFLICT - SHA MISMATCH
    if (error.status === 409) {
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "File has been modified. Please refresh and try again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NO PERMISSION
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to delete files in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "File, repository, or branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error deleting file. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET FILE BLAME
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET FILE BLAME ==>
export const getFileBlame = expressAsyncHandler(async (req, res) => {
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
  // GET PATH FROM QUERY
  const path = req.query.path as string;
  const ref = (req.query.ref as string) || undefined;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE PATH
  if (!path) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "File path is required!",
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
  // GET FILE BLAME USING COMMITS
  try {
    // GET FILE COMMITS TO BUILD BLAME INFO
    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      path,
      ...(ref && { sha: ref }),
      per_page: 100,
    });
    // FORMAT BLAME DATA
    const blameData = commits.map((commit) => ({
      sha: commit.sha,
      shortSha: commit.sha.substring(0, 7),
      message: commit.commit.message.split("\n")[0],
      author: {
        name: commit.commit.author?.name || "Unknown",
        email: commit.commit.author?.email || "",
        date: commit.commit.author?.date || "",
        avatarUrl: commit.author?.avatar_url || "",
        login: commit.author?.login || "",
      },
      htmlUrl: commit.html_url,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "File blame fetched successfully!",
      success: true,
      data: {
        path,
        commits: blameData,
        totalCommits: commits.length,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "File or repository not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching file blame. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET REPOSITORY TREE (FULL TREE STRUCTURE)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY TREE ==>
export const getRepositoryTree = expressAsyncHandler(async (req, res) => {
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
  // GET REF FROM QUERY (OPTIONAL - DEFAULTS TO DEFAULT BRANCH)
  const ref = (req.query.ref as string) || undefined;
  // GET RECURSIVE FROM QUERY
  const recursive = req.query.recursive === "true";
  // VALIDATE PARAMS
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
  // GET REPOSITORY TREE
  try {
    // GET DEFAULT BRANCH IF REF NOT PROVIDED
    let treeSha = ref;
    if (!treeSha) {
      // GET REPO INFO FOR DEFAULT BRANCH
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      // GET DEFAULT BRANCH REF
      const { data: branchData } = await octokit.repos.getBranch({
        owner,
        repo,
        branch: repoData.default_branch,
      });
      treeSha = branchData.commit.sha;
    }
    // GET TREE FROM GITHUB
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      ...(recursive && { recursive: "1" }),
    });
    // FORMAT TREE DATA
    const formattedTree = tree.tree.map((item) => ({
      path: item.path,
      mode: item.mode,
      type: item.type,
      sha: item.sha,
      size: item.size,
      url: item.url,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository tree fetched successfully!",
      success: true,
      data: {
        sha: tree.sha,
        url: tree.url,
        truncated: tree.truncated,
        tree: formattedTree,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or branch not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching repository tree. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * SEARCH REPOSITORY COMMITS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SEARCH REPOSITORY COMMITS ==>
export const searchRepositoryCommits = expressAsyncHandler(async (req, res) => {
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
  // GET SEARCH QUERY FROM QUERY PARAMS
  const query = req.query.q as string;
  // GET PAGE FROM QUERY PARAMS
  const page = parseInt(req.query.page as string) || 1;
  // GET PER PAGE FROM QUERY PARAMS
  const perPage = parseInt(req.query.per_page as string) || 30;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE SEARCH QUERY
  if (!query || query.trim().length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Search query is required!",
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
  // SEARCH COMMITS
  try {
    // BUILD SEARCH QUERY (repo:owner/repo + search term)
    const searchQuery = `repo:${owner}/${repo} ${query}`;
    // SEARCH COMMITS
    const { data: searchResult } = await octokit.search.commits({
      q: searchQuery,
      per_page: perPage,
      page: page,
      sort: "committer-date",
      order: "desc",
    });
    // MAP COMMITS TO SIMPLIFIED FORMAT
    const mappedCommits = searchResult.items.map((item) => ({
      sha: item.sha,
      message: item.commit.message,
      author: {
        name: item.commit.author?.name,
        email: item.commit.author?.email,
        date: item.commit.author?.date,
        login: item.author?.login,
        avatarUrl: item.author?.avatar_url,
      },
      committer: {
        name: item.commit.committer?.name,
        email: item.commit.committer?.email,
        date: item.commit.committer?.date,
        login: (item.committer as { login?: string } | null)?.login,
        avatarUrl: (item.committer as { avatar_url?: string } | null)
          ?.avatar_url,
      },
      htmlUrl: item.html_url,
      score: item.score,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commits searched successfully!",
      success: true,
      data: {
        commits: mappedCommits,
        totalCount: searchResult.total_count,
        pagination: {
          page,
          perPage,
          hasMore: searchResult.items.length === perPage,
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
    // RATE LIMIT EXCEEDED
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "GitHub API rate limit exceeded. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error searching commits. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET COMMIT DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET COMMIT DETAILS ==>
export const getCommitDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND SHA FROM PARAMS
  const { owner, repo, sha } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !sha) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and commit SHA are required!",
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
  // FETCH COMMIT DETAILS
  try {
    // GET COMMIT DETAILS
    const { data: commit } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });
    // FORMAT COMMIT DETAILS
    const formattedCommit = {
      sha: commit.sha,
      nodeId: commit.node_id,
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
      tree: {
        sha: commit.commit.tree.sha,
        url: commit.commit.tree.url,
      },
      parents: commit.parents.map((parent) => ({
        sha: parent.sha,
        url: parent.html_url,
      })),
      htmlUrl: commit.html_url,
      stats: commit.stats,
      files: commit.files?.map((file) => ({
        sha: file.sha,
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        blobUrl: file.blob_url,
        rawUrl: file.raw_url,
        contentsUrl: file.contents_url,
        patch: file.patch,
        previousFilename: file.previous_filename,
      })),
      verified: commit.commit.verification?.verified,
      verificationReason: commit.commit.verification?.reason,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commit details retrieved successfully!",
      success: true,
      data: formattedCommit,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Commit not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching commit details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * COMPARE COMMITS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== COMPARE COMMITS ==>
export const compareCommits = expressAsyncHandler(async (req, res) => {
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
  // GET BASE FROM QUERY
  const base = req.query.base as string;
  // GET HEAD FROM QUERY
  const head = req.query.head as string;
  // VALIDATE PARAMS
  if (!owner || !repo || !base || !head) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, base, and head commits are required!",
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
  // COMPARE COMMITS
  try {
    // GET COMPARISON
    const { data: comparison } = await octokit.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });
    // FORMAT COMPARISON DATA
    const formattedComparison = {
      url: comparison.url,
      htmlUrl: comparison.html_url,
      permalinkUrl: comparison.permalink_url,
      diffUrl: comparison.diff_url,
      patchUrl: comparison.patch_url,
      status: comparison.status,
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      totalCommits: comparison.total_commits,
      baseCommit: {
        sha: comparison.base_commit.sha,
        message: comparison.base_commit.commit.message,
        author: {
          name: comparison.base_commit.commit.author?.name,
          email: comparison.base_commit.commit.author?.email,
          date: comparison.base_commit.commit.author?.date,
          login: comparison.base_commit.author?.login,
          avatarUrl: comparison.base_commit.author?.avatar_url,
        },
        htmlUrl: comparison.base_commit.html_url,
      },
      mergeBaseCommit: {
        sha: comparison.merge_base_commit.sha,
        message: comparison.merge_base_commit.commit.message,
        author: {
          name: comparison.merge_base_commit.commit.author?.name,
          email: comparison.merge_base_commit.commit.author?.email,
          date: comparison.merge_base_commit.commit.author?.date,
          login: comparison.merge_base_commit.author?.login,
          avatarUrl: comparison.merge_base_commit.author?.avatar_url,
        },
        htmlUrl: comparison.merge_base_commit.html_url,
      },
      commits: comparison.commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author?.name,
          email: commit.commit.author?.email,
          date: commit.commit.author?.date,
          login: commit.author?.login,
          avatarUrl: commit.author?.avatar_url,
        },
        htmlUrl: commit.html_url,
      })),
      files: comparison.files?.map((file) => ({
        sha: file.sha,
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        blobUrl: file.blob_url,
        rawUrl: file.raw_url,
        patch: file.patch,
        previousFilename: file.previous_filename,
      })),
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commits compared successfully!",
      success: true,
      data: formattedComparison,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or commits not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error comparing commits. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET COMMIT BRANCHES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET COMMIT BRANCHES ==>
export const getCommitBranches = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND SHA FROM PARAMS
  const { owner, repo, sha } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !sha) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and commit SHA are required!",
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
  // GET BRANCHES CONTAINING COMMIT
  try {
    // GET BRANCHES
    const { data: branches } = await octokit.repos.listBranchesForHeadCommit({
      owner,
      repo,
      commit_sha: sha,
    });
    // FORMAT BRANCHES
    const formattedBranches = branches.map((branch) => ({
      name: branch.name,
      protected: branch.protected,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commit branches retrieved successfully!",
      success: true,
      data: formattedBranches,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Commit not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching commit branches. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET COMMIT PULL REQUESTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET COMMIT PULL REQUESTS ==>
export const getCommitPullRequests = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND SHA FROM PARAMS
  const { owner, repo, sha } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !sha) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and commit SHA are required!",
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
  // GET PULL REQUESTS FOR COMMIT
  try {
    // GET PULL REQUESTS
    const { data: pullRequests } =
      await octokit.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: sha,
      });
    // FORMAT PULL REQUESTS
    const formattedPRs = pullRequests.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      htmlUrl: pr.html_url,
      user: {
        login: pr.user?.login,
        avatarUrl: pr.user?.avatar_url,
      },
      createdAt: pr.created_at,
      mergedAt: pr.merged_at,
      closedAt: pr.closed_at,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commit pull requests retrieved successfully!",
      success: true,
      data: formattedPRs,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Commit not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching commit pull requests. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET PULL REQUEST DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PULL REQUEST DETAILS ==>
export const getPullRequestDetails = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
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
  // FETCH PULL REQUEST DETAILS
  try {
    // GET PULL REQUEST
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: parseInt(pull_number),
    });
    // FORMAT PULL REQUEST
    const formattedPR = {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      htmlUrl: pr.html_url,
      diffUrl: pr.diff_url,
      patchUrl: pr.patch_url,
      draft: pr.draft,
      merged: pr.merged,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      mergedAt: pr.merged_at,
      mergedBy: pr.merged_by
        ? {
            login: pr.merged_by.login,
            avatarUrl: pr.merged_by.avatar_url,
          }
        : null,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      closedAt: pr.closed_at,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
        label: pr.head.label,
        repo: pr.head.repo
          ? {
              name: pr.head.repo.name,
              fullName: pr.head.repo.full_name,
            }
          : null,
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
        label: pr.base.label,
        repo: {
          name: pr.base.repo.name,
          fullName: pr.base.repo.full_name,
        },
      },
      user: {
        login: pr.user?.login,
        avatarUrl: pr.user?.avatar_url,
        htmlUrl: pr.user?.html_url,
      },
      labels: pr.labels.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description,
      })),
      requestedReviewers:
        pr.requested_reviewers?.map((reviewer) => ({
          login: (reviewer as { login?: string }).login,
          avatarUrl: (reviewer as { avatar_url?: string }).avatar_url,
        })) || [],
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      commits: pr.commits,
      comments: pr.comments,
      reviewComments: pr.review_comments,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Pull request details retrieved successfully!",
      success: true,
      data: formattedPR,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching pull request details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET PULL REQUEST COMMENTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PULL REQUEST COMMENTS ==>
export const getPullRequestComments = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
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
  // FETCH PULL REQUEST COMMENTS
  try {
    // GET ISSUE COMMENTS (GENERAL PR COMMENTS)
    const { data: issueComments } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: parseInt(pull_number),
      per_page: 100,
    });
    // GET REVIEW COMMENTS (INLINE CODE COMMENTS)
    const { data: reviewComments } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: parseInt(pull_number),
      per_page: 100,
    });
    // FORMAT ISSUE COMMENTS
    const formattedIssueComments = issueComments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      htmlUrl: comment.html_url,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        login: comment.user?.login,
        avatarUrl: comment.user?.avatar_url,
      },
      type: "issue" as const,
    }));
    // FORMAT REVIEW COMMENTS
    const formattedReviewComments = reviewComments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      htmlUrl: comment.html_url,
      path: comment.path,
      line: comment.line,
      side: comment.side,
      commitId: comment.commit_id,
      diffHunk: comment.diff_hunk,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        login: comment.user?.login,
        avatarUrl: comment.user?.avatar_url,
      },
      type: "review" as const,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Pull request comments retrieved successfully!",
      success: true,
      data: {
        issueComments: formattedIssueComments,
        reviewComments: formattedReviewComments,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching pull request comments. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * ADD PULL REQUEST COMMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ADD PULL REQUEST COMMENT ==>
export const addPullRequestComment = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // GET BODY
  const { body } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE BODY
  if (!body || typeof body !== "string" || body.trim() === "") {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Comment body is required!",
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
  // ADD COMMENT
  try {
    // CREATE COMMENT
    const { data: comment } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(pull_number),
      body: body.trim(),
    });
    // FORMAT COMMENT
    const formattedComment = {
      id: comment.id,
      body: comment.body,
      htmlUrl: comment.html_url,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        login: comment.user?.login,
        avatarUrl: comment.user?.avatar_url,
      },
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Comment added successfully!",
      success: true,
      data: formattedComment,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error adding comment. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE PULL REQUEST
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE PULL REQUEST ==>
export const createPullRequest = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo } = req.params;
  // GET BODY
  const { title, body, head, base, draft } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE BODY
  if (!title || !head || !base) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Title, head branch, and base branch are required!",
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
  // CREATE PULL REQUEST
  try {
    // CREATE PR
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title,
      body: body || "",
      head,
      base,
      draft: draft || false,
    });
    // FORMAT PULL REQUEST
    const formattedPR = {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      htmlUrl: pr.html_url,
      draft: pr.draft,
      createdAt: pr.created_at,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
      },
      user: {
        login: pr.user?.login,
        avatarUrl: pr.user?.avatar_url,
      },
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Pull request created successfully!",
      success: true,
      data: formattedPR,
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
    // VALIDATION ERROR
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message:
          error.response?.data?.errors?.[0]?.message ||
          "Invalid pull request. Please check your branches.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating pull request. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * MERGE PULL REQUEST
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MERGE PULL REQUEST ==>
export const mergePullRequest = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // GET BODY
  const { commit_title, commit_message, merge_method } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
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
  // MERGE PULL REQUEST
  try {
    // MERGE PR
    const { data: merge } = await octokit.pulls.merge({
      owner,
      repo,
      pull_number: parseInt(pull_number),
      commit_title: commit_title || undefined,
      commit_message: commit_message || undefined,
      merge_method: merge_method || "merge",
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Pull request merged successfully!",
      success: true,
      data: {
        sha: merge.sha,
        merged: merge.merged,
        message: merge.message,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NOT MERGEABLE
    if (error.status === 405) {
      // RETURNING ERROR RESPONSE
      res.status(405).json({
        message: "Pull request is not mergeable. There may be conflicts.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CONFLICT
    if (error.status === 409) {
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "Pull request has conflicts that must be resolved first.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error merging pull request. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UPDATE PULL REQUEST
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE PULL REQUEST ==>
export const updatePullRequest = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // GET BODY
  const { title, body, state, base } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
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
  // UPDATE PULL REQUEST
  try {
    // UPDATE PR
    const { data: pr } = await octokit.pulls.update({
      owner,
      repo,
      pull_number: parseInt(pull_number),
      title: title || undefined,
      body: body || undefined,
      state: state || undefined,
      base: base || undefined,
    });
    // FORMAT PULL REQUEST
    const formattedPR = {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      htmlUrl: pr.html_url,
      draft: pr.draft,
      updatedAt: pr.updated_at,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Pull request updated successfully!",
      success: true,
      data: formattedPR,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error updating pull request. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET PULL REQUEST REVIEWS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PULL REQUEST REVIEWS ==>
export const getPullRequestReviews = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
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
  // FETCH REVIEWS
  try {
    // GET REVIEWS
    const { data: reviews } = await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: parseInt(pull_number),
      per_page: 100,
    });
    // FORMAT REVIEWS
    const formattedReviews = reviews.map((review) => ({
      id: review.id,
      body: review.body,
      state: review.state,
      htmlUrl: review.html_url,
      commitId: review.commit_id,
      submittedAt: review.submitted_at,
      user: {
        login: review.user?.login,
        avatarUrl: review.user?.avatar_url,
      },
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Pull request reviews retrieved successfully!",
      success: true,
      data: formattedReviews,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching pull request reviews. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE PULL REQUEST REVIEW
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE PULL REQUEST REVIEW ==>
export const createPullRequestReview = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // GET BODY
  const { body, event, comments } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE EVENT
  const validEvents = ["APPROVE", "REQUEST_CHANGES", "COMMENT"];
  if (!event || !validEvents.includes(event)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Valid event (APPROVE, REQUEST_CHANGES, or COMMENT) is required!",
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
  // CREATE REVIEW
  try {
    // CREATE REVIEW
    const { data: review } = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: parseInt(pull_number),
      body: body || "",
      event: event as "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
      comments: comments || undefined,
    });
    // FORMAT REVIEW
    const formattedReview = {
      id: review.id,
      body: review.body,
      state: review.state,
      htmlUrl: review.html_url,
      commitId: review.commit_id,
      user: {
        login: review.user?.login,
        avatarUrl: review.user?.avatar_url,
      },
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Review created successfully!",
      success: true,
      data: formattedReview,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATION ERROR
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message:
          error.response?.data?.message ||
          "Invalid review. Please check your input.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating review. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET PULL REQUEST FILES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PULL REQUEST FILES ==>
export const getPullRequestFiles = expressAsyncHandler(async (req, res) => {
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
  // GET PARAMS
  const { owner, repo, pull_number } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !pull_number) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and pull request number are required!",
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
  // FETCH FILES
  try {
    // GET FILES
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: parseInt(pull_number),
      per_page: 100,
    });
    // FORMAT FILES
    const formattedFiles = files.map((file) => ({
      sha: file.sha,
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      blobUrl: file.blob_url,
      rawUrl: file.raw_url,
      contentsUrl: file.contents_url,
      patch: file.patch,
      previousFilename: file.previous_filename,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Pull request files retrieved successfully!",
      success: true,
      data: formattedFiles,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Pull request not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching pull request files. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * REQUEST PULL REQUEST REVIEWERS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REQUEST PULL REQUEST REVIEWERS ==>
export const requestPullRequestReviewers = expressAsyncHandler(
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
    // GET PARAMS
    const { owner, repo, pull_number } = req.params;
    // GET BODY
    const { reviewers, team_reviewers } = req.body;
    // VALIDATE PARAMS
    if (!owner || !repo || !pull_number) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Owner, repository name, and pull request number are required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATE REVIEWERS
    if (
      (!reviewers || reviewers.length === 0) &&
      (!team_reviewers || team_reviewers.length === 0)
    ) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "At least one reviewer or team reviewer is required!",
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
    // REQUEST REVIEWERS
    try {
      // REQUEST REVIEWERS
      const { data: pr } = await octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: parseInt(pull_number),
        reviewers: reviewers || [],
        team_reviewers: team_reviewers || [],
      });
      // FORMAT REQUESTED REVIEWERS
      const requestedReviewers =
        pr.requested_reviewers?.map((reviewer) => ({
          login: (reviewer as { login?: string }).login,
          avatarUrl: (reviewer as { avatar_url?: string }).avatar_url,
        })) || [];
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Reviewers requested successfully!",
        success: true,
        data: {
          requestedReviewers,
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
      // NOT FOUND
      if (error.status === 404) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "Pull request not found.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // VALIDATION ERROR
      if (error.status === 422) {
        // RETURNING ERROR RESPONSE
        res.status(422).json({
          message:
            error.response?.data?.message ||
            "Invalid reviewers. Please check the usernames.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error requesting reviewers. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

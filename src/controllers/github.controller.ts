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
        // USER'S PERMISSIONS ON THIS REPOSITORY
        permissions: repository.permissions
          ? {
              admin: repository.permissions.admin,
              maintain: repository.permissions.maintain,
              push: repository.permissions.push,
              triage: repository.permissions.triage,
              pull: repository.permissions.pull,
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
 * GET REPOSITORY INVITATIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY INVITATIONS ==>
export const getRepositoryInvitations = expressAsyncHandler(
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
    // FETCH INVITATIONS
    try {
      // GET REPOSITORY INVITATIONS
      const { data: invitations } = await octokit.repos.listInvitations({
        owner,
        repo,
        per_page: 100,
      });
      // MAP INVITATIONS TO SIMPLIFIED FORMAT
      const mappedInvitations = invitations.map((invitation) => ({
        id: invitation.id,
        invitee: invitation.invitee
          ? {
              login: invitation.invitee.login,
              avatarUrl: invitation.invitee.avatar_url,
              htmlUrl: invitation.invitee.html_url,
            }
          : null,
        inviter: invitation.inviter
          ? {
              login: invitation.inviter.login,
              avatarUrl: invitation.inviter.avatar_url,
            }
          : null,
        permissions: invitation.permissions,
        createdAt: invitation.created_at,
        htmlUrl: invitation.html_url,
        expired: invitation.expired,
      }));
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Invitations retrieved successfully!",
        success: true,
        data: {
          invitations: mappedInvitations,
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
      // REPOSITORY NOT FOUND OR NO PERMISSION
      if (error.status === 404 || error.status === 403) {
        // RETURNING ERROR RESPONSE
        res.status(error.status).json({
          message:
            "Repository not found or you don't have permission to view invitations.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error fetching invitations. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * DELETE REPOSITORY INVITATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE REPOSITORY INVITATION ==>
export const deleteRepositoryInvitation = expressAsyncHandler(
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
    // GET OWNER, REPO AND INVITATION ID FROM PARAMS
    const { owner, repo, invitation_id } = req.params;
    // VALIDATE PARAMS
    if (!owner || !repo || !invitation_id) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Owner, repository name, and invitation ID are required!",
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
    // DELETE INVITATION
    try {
      // DELETE REPOSITORY INVITATION
      await octokit.repos.deleteInvitation({
        owner,
        repo,
        invitation_id: parseInt(invitation_id),
      });
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Invitation deleted successfully!",
        success: true,
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
      // INVITATION NOT FOUND OR NO PERMISSION
      if (error.status === 404 || error.status === 403) {
        // RETURNING ERROR RESPONSE
        res.status(error.status).json({
          message:
            "Invitation not found or you don't have permission to delete it.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error deleting invitation. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * UPDATE REPOSITORY INVITATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE REPOSITORY INVITATION ==>
export const updateRepositoryInvitation = expressAsyncHandler(
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
    // GET OWNER, REPO AND INVITATION ID FROM PARAMS
    const { owner, repo, invitation_id } = req.params;
    // GET PERMISSIONS FROM BODY
    const { permissions } = req.body;
    // VALIDATE PARAMS
    if (!owner || !repo || !invitation_id) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Owner, repository name, and invitation ID are required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATE PERMISSIONS
    if (
      !permissions ||
      !["read", "triage", "write", "maintain", "admin"].includes(permissions)
    ) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Valid permission level is required (read, triage, write, maintain, admin)!",
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
    // UPDATE INVITATION
    try {
      // UPDATE REPOSITORY INVITATION
      const { data: invitation } = await octokit.repos.updateInvitation({
        owner,
        repo,
        invitation_id: parseInt(invitation_id),
        permissions,
      });
      // MAP INVITATION TO SIMPLIFIED FORMAT
      const mappedInvitation = {
        id: invitation.id,
        invitee: invitation.invitee
          ? {
              login: invitation.invitee.login,
              avatarUrl: invitation.invitee.avatar_url,
            }
          : null,
        permissions: invitation.permissions,
        createdAt: invitation.created_at,
      };
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Invitation updated successfully!",
        success: true,
        data: mappedInvitation,
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
      // INVITATION NOT FOUND OR NO PERMISSION
      if (error.status === 404 || error.status === 403) {
        // RETURNING ERROR RESPONSE
        res.status(error.status).json({
          message:
            "Invitation not found or you don't have permission to update it.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error updating invitation. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * CHECK IF USER IS COLLABORATOR
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CHECK COLLABORATOR ==>
export const checkCollaborator = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO AND USERNAME FROM PARAMS
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
  // CHECK COLLABORATOR
  try {
    // CHECK IF USER IS COLLABORATOR
    const { data } = await octokit.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Collaborator check successful!",
      success: true,
      data: {
        isCollaborator: true,
        permission: data.permission,
        roleName: data.role_name,
        user: data.user
          ? {
              login: data.user.login,
              avatarUrl: data.user.avatar_url,
              htmlUrl: data.user.html_url,
            }
          : null,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // USER IS NOT A COLLABORATOR
    if (error.status === 404) {
      // RETURNING SUCCESS RESPONSE (NOT A COLLABORATOR)
      res.status(200).json({
        message: "User is not a collaborator.",
        success: true,
        data: {
          isCollaborator: false,
          permission: "none",
          roleName: null,
          user: null,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
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
      message: "Error checking collaborator. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

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

/**
 * GET REPOSITORY WORKFLOWS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY WORKFLOWS ==>
export const getRepositoryWorkflows = expressAsyncHandler(async (req, res) => {
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
  // FETCH WORKFLOWS
  try {
    // GET REPOSITORY WORKFLOWS
    const { data } = await octokit.actions.listRepoWorkflows({
      owner,
      repo,
      per_page: 100,
    });
    // MAP WORKFLOWS TO SIMPLIFIED FORMAT
    const workflows = data.workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      path: workflow.path,
      state: workflow.state,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
      htmlUrl: workflow.html_url,
      badgeUrl: workflow.badge_url,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Workflows retrieved successfully!",
      success: true,
      data: {
        workflows,
        totalCount: data.total_count,
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
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository not found or Actions not enabled.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching workflows. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET WORKFLOW DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKFLOW DETAILS ==>
export const getWorkflowDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND WORKFLOW_ID FROM PARAMS
  const { owner, repo, workflow_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !workflow_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and workflow ID are required!",
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
  // FETCH WORKFLOW DETAILS
  try {
    // GET WORKFLOW
    const { data: workflow } = await octokit.actions.getWorkflow({
      owner,
      repo,
      workflow_id: parseInt(workflow_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Workflow details retrieved successfully!",
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
        htmlUrl: workflow.html_url,
        badgeUrl: workflow.badge_url,
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
    // WORKFLOW NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Workflow not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching workflow details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET WORKFLOW RUNS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKFLOW RUNS ==>
export const getWorkflowRuns = expressAsyncHandler(async (req, res) => {
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
  // GETTING WORKFLOW ID
  const workflowId = req.query.workflow_id as string;
  // GETTING BRANCH
  const branch = req.query.branch as string;
  // GETTING EVENT
  const event = req.query.event as string;
  // GETTING STATUS
  const status = req.query.status as string;
  // GETTING ACTOR
  const actor = req.query.actor as string;
  // GETTING PAGE
  const page = parseInt(req.query.page as string) || 1;
  // GETTING PER PAGE
  const perPage = parseInt(req.query.per_page as string) || 20;
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
  // FETCH WORKFLOW RUNS
  try {
    // BUILD QUERY PARAMS
    const queryParams: {
      owner: string;
      repo: string;
      workflow_id?: number;
      branch?: string;
      event?: string;
      status?:
        | "completed"
        | "action_required"
        | "cancelled"
        | "failure"
        | "neutral"
        | "skipped"
        | "stale"
        | "success"
        | "timed_out"
        | "in_progress"
        | "queued"
        | "requested"
        | "waiting"
        | "pending";
      actor?: string;
      per_page: number;
      page: number;
    } = {
      owner,
      repo,
      per_page: perPage,
      page,
    };
    // IF WORKFLOW ID IS PROVIDED, SET WORKFLOW ID
    if (workflowId) queryParams.workflow_id = parseInt(workflowId);
    // IF BRANCH IS PROVIDED, SET BRANCH
    if (branch) queryParams.branch = branch;
    // IF EVENT IS PROVIDED, SET EVENT
    if (event) queryParams.event = event;
    // IF STATUS IS PROVIDED, SET STATUS
    if (status)
      queryParams.status = status as
        | "completed"
        | "action_required"
        | "cancelled"
        | "failure"
        | "neutral"
        | "skipped"
        | "stale"
        | "success"
        | "timed_out"
        | "in_progress"
        | "queued"
        | "requested"
        | "waiting"
        | "pending";
    // IF ACTOR IS PROVIDED, SET ACTOR
    if (actor) queryParams.actor = actor;
    // IF WORKFLOW ID IS PROVIDED, GET WORKFLOW RUNS
    const { data } = workflowId
      ? // ELSE GET WORKFLOW RUNS FOR REPO
        await octokit.actions.listWorkflowRuns(queryParams as any)
      : // ELSE GET WORKFLOW RUNS FOR REPO
        await octokit.actions.listWorkflowRunsForRepo(queryParams);
    // MAP WORKFLOW RUNS TO SIMPLIFIED FORMAT
    const runs = data.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name,
      displayTitle: run.display_title,
      workflowId: run.workflow_id,
      headBranch: run.head_branch,
      headSha: run.head_sha,
      path: run.path,
      runNumber: run.run_number,
      runAttempt: run.run_attempt,
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      runStartedAt: run.run_started_at,
      htmlUrl: run.html_url,
      actor: run.actor
        ? {
            login: run.actor.login,
            avatarUrl: run.actor.avatar_url,
          }
        : null,
      triggeringActor: run.triggering_actor
        ? {
            login: run.triggering_actor.login,
            avatarUrl: run.triggering_actor.avatar_url,
          }
        : null,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Workflow runs retrieved successfully!",
      success: true,
      data: {
        runs,
        totalCount: data.total_count,
        pagination: {
          page,
          perPage,
          hasMore: data.total_count > page * perPage,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository or workflow not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching workflow runs. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET WORKFLOW RUN DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKFLOW RUN DETAILS ==>
export const getWorkflowRunDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RUN_ID FROM PARAMS
  const { owner, repo, run_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !run_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and run ID are required!",
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
  // FETCH WORKFLOW RUN DETAILS
  try {
    // GET WORKFLOW RUN
    const { data: run } = await octokit.actions.getWorkflowRun({
      owner,
      repo,
      run_id: parseInt(run_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Workflow run details retrieved successfully!",
      success: true,
      data: {
        id: run.id,
        name: run.name,
        displayTitle: run.display_title,
        workflowId: run.workflow_id,
        headBranch: run.head_branch,
        headSha: run.head_sha,
        path: run.path,
        runNumber: run.run_number,
        runAttempt: run.run_attempt,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        runStartedAt: run.run_started_at,
        htmlUrl: run.html_url,
        actor: run.actor
          ? {
              login: run.actor.login,
              avatarUrl: run.actor.avatar_url,
            }
          : null,
        triggeringActor: run.triggering_actor
          ? {
              login: run.triggering_actor.login,
              avatarUrl: run.triggering_actor.avatar_url,
            }
          : null,
        headCommit: run.head_commit
          ? {
              id: run.head_commit.id,
              message: run.head_commit.message,
              timestamp: run.head_commit.timestamp,
              author: {
                name: run.head_commit.author?.name,
                email: run.head_commit.author?.email,
              },
            }
          : null,
        repository: {
          id: run.repository.id,
          name: run.repository.name,
          fullName: run.repository.full_name,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Workflow run not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching workflow run details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET WORKFLOW RUN JOBS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKFLOW RUN JOBS ==>
export const getWorkflowRunJobs = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RUN_ID FROM PARAMS
  const { owner, repo, run_id } = req.params;
  // GET QUERY PARAMS
  const filter = (req.query.filter as string) || "latest";
  // VALIDATE PARAMS
  if (!owner || !repo || !run_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and run ID are required!",
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
  // FETCH WORKFLOW RUN JOBS
  try {
    // GET WORKFLOW RUN JOBS
    const { data } = await octokit.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: parseInt(run_id),
      filter: filter as "latest" | "all",
      per_page: 100,
    });
    // MAP JOBS TO SIMPLIFIED FORMAT
    const jobs = data.jobs.map((job) => ({
      id: job.id,
      runId: job.run_id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      htmlUrl: job.html_url,
      runnerName: job.runner_name,
      runnerGroupName: job.runner_group_name,
      steps: job.steps?.map((step) => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        number: step.number,
        startedAt: step.started_at,
        completedAt: step.completed_at,
      })),
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Workflow run jobs retrieved successfully!",
      success: true,
      data: {
        jobs,
        totalCount: data.total_count,
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
        message: "Workflow run not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching workflow run jobs. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET WORKFLOW RUN LOGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKFLOW RUN LOGS ==>
export const getWorkflowRunLogs = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RUN_ID FROM PARAMS
  const { owner, repo, run_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !run_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and run ID are required!",
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
  // FETCH WORKFLOW RUN LOGS
  try {
    // GET WORKFLOW RUN LOGS URL (RETURNS A REDIRECT URL TO DOWNLOAD)
    const { url } = await octokit.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: parseInt(run_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Workflow run logs URL retrieved successfully!",
      success: true,
      data: {
        logsUrl: url,
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
        message: "Workflow run logs not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching workflow run logs. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET JOB LOGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET JOB LOGS ==>
export const getJobLogs = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND JOB_ID FROM PARAMS
  const { owner, repo, job_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !job_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and job ID are required!",
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
  // FETCH JOB LOGS
  try {
    // GET JOB LOGS (RETURNS RAW TEXT)
    const { data } = await octokit.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: parseInt(job_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Job logs retrieved successfully!",
      success: true,
      data: {
        logs: data,
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
        message: "Job logs not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching job logs. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * TRIGGER WORKFLOW DISPATCH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== TRIGGER WORKFLOW DISPATCH ==>
export const triggerWorkflowDispatch = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND WORKFLOW_ID FROM PARAMS
  const { owner, repo, workflow_id } = req.params;
  // GET REF AND INPUTS FROM BODY
  const { ref, inputs } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !workflow_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and workflow ID are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE REF
  if (!ref) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Branch or tag ref is required!",
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
  // TRIGGER WORKFLOW
  try {
    // DISPATCH WORKFLOW
    await octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: parseInt(workflow_id),
      ref,
      inputs: inputs || {},
    });
    // RETURNING SUCCESS RESPONSE
    res.status(204).json({
      message: "Workflow triggered successfully!",
      success: true,
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
        message: "Workflow not found or workflow_dispatch not enabled.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to trigger this workflow.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error triggering workflow. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * RE-RUN WORKFLOW
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RE-RUN WORKFLOW ==>
export const rerunWorkflow = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RUN_ID FROM PARAMS
  const { owner, repo, run_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !run_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and run ID are required!",
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
  // RE-RUN WORKFLOW
  try {
    // RE-RUN WORKFLOW
    await octokit.actions.reRunWorkflow({
      owner,
      repo,
      run_id: parseInt(run_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Workflow re-run triggered successfully!",
      success: true,
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
        message: "Workflow run not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to re-run this workflow.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error re-running workflow. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * RE-RUN FAILED JOBS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RE-RUN FAILED JOBS ==>
export const rerunFailedJobs = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RUN_ID FROM PARAMS
  const { owner, repo, run_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !run_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and run ID are required!",
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
  // RE-RUN FAILED JOBS
  try {
    // RE-RUN FAILED JOBS
    await octokit.actions.reRunWorkflowFailedJobs({
      owner,
      repo,
      run_id: parseInt(run_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Failed jobs re-run triggered successfully!",
      success: true,
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
        message: "Workflow run not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to re-run failed jobs.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error re-running failed jobs. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CANCEL WORKFLOW RUN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CANCEL WORKFLOW RUN ==>
export const cancelWorkflowRun = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RUN_ID FROM PARAMS
  const { owner, repo, run_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !run_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and run ID are required!",
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
  // CANCEL WORKFLOW RUN
  try {
    // CANCEL WORKFLOW RUN
    await octokit.actions.cancelWorkflowRun({
      owner,
      repo,
      run_id: parseInt(run_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(202).json({
      message: "Workflow run cancelled successfully!",
      success: true,
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
        message: "Workflow run not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to cancel this workflow run.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CONFLICT - ALREADY COMPLETED
    if (error.status === 409) {
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: "Workflow run has already completed.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error cancelling workflow run. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE WORKFLOW RUN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE WORKFLOW RUN ==>
export const deleteWorkflowRun = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RUN_ID FROM PARAMS
  const { owner, repo, run_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !run_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and run ID are required!",
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
  // DELETE WORKFLOW RUN
  try {
    // DELETE WORKFLOW RUN
    await octokit.actions.deleteWorkflowRun({
      owner,
      repo,
      run_id: parseInt(run_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(204).json({
      message: "Workflow run deleted successfully!",
      success: true,
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
        message: "Workflow run not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to delete this workflow run.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error deleting workflow run. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * LIST RELEASES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LIST RELEASES ==>
export const listReleases = expressAsyncHandler(async (req, res) => {
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
  // GET PAGINATION FROM QUERY
  const page = parseInt(req.query.page as string) || 1;
  // GET PER PAGE FROM QUERY
  const perPage = parseInt(req.query.per_page as string) || 10;
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
  // FETCH RELEASES
  try {
    // FETCH RELEASES
    const response = await octokit.repos.listReleases({
      owner,
      repo,
      page,
      per_page: perPage,
    });
    // MAP RELEASES
    const releases = response.data.map((release) => ({
      id: release.id,
      tagName: release.tag_name,
      name: release.name || release.tag_name,
      body: release.body,
      draft: release.draft,
      prerelease: release.prerelease,
      createdAt: release.created_at,
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
      tarballUrl: release.tarball_url,
      zipballUrl: release.zipball_url,
      author: release.author
        ? {
            login: release.author.login,
            avatarUrl: release.author.avatar_url,
            htmlUrl: release.author.html_url,
          }
        : null,
      assets: release.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        size: asset.size,
        downloadCount: asset.download_count,
        browserDownloadUrl: asset.browser_download_url,
        contentType: asset.content_type,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
      })),
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Releases fetched successfully!",
      success: true,
      data: {
        releases,
        pagination: {
          page,
          perPage,
          hasMore: response.data.length === perPage,
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
    // NOT FOUND
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
      message: "Error fetching releases. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET RELEASE DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET RELEASE DETAILS ==>
export const getReleaseDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RELEASE_ID FROM PARAMS
  const { owner, repo, release_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !release_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and release ID are required!",
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
  // FETCH RELEASE DETAILS
  try {
    // FETCH RELEASE
    const response = await octokit.repos.getRelease({
      owner,
      repo,
      release_id: parseInt(release_id),
    });
    // MAP RELEASE
    const release = {
      id: response.data.id,
      tagName: response.data.tag_name,
      targetCommitish: response.data.target_commitish,
      name: response.data.name || response.data.tag_name,
      body: response.data.body,
      draft: response.data.draft,
      prerelease: response.data.prerelease,
      createdAt: response.data.created_at,
      publishedAt: response.data.published_at,
      htmlUrl: response.data.html_url,
      tarballUrl: response.data.tarball_url,
      zipballUrl: response.data.zipball_url,
      author: response.data.author
        ? {
            login: response.data.author.login,
            avatarUrl: response.data.author.avatar_url,
            htmlUrl: response.data.author.html_url,
          }
        : null,
      assets: response.data.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        label: asset.label,
        size: asset.size,
        downloadCount: asset.download_count,
        browserDownloadUrl: asset.browser_download_url,
        contentType: asset.content_type,
        state: asset.state,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
      })),
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Release details fetched successfully!",
      success: true,
      data: release,
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
        message: "Release not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching release details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET LATEST RELEASE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET LATEST RELEASE ==>
export const getLatestRelease = expressAsyncHandler(async (req, res) => {
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
  // FETCH LATEST RELEASE
  try {
    // FETCH LATEST RELEASE
    const response = await octokit.repos.getLatestRelease({
      owner,
      repo,
    });
    // MAP RELEASE
    const release = {
      id: response.data.id,
      tagName: response.data.tag_name,
      targetCommitish: response.data.target_commitish,
      name: response.data.name || response.data.tag_name,
      body: response.data.body,
      draft: response.data.draft,
      prerelease: response.data.prerelease,
      createdAt: response.data.created_at,
      publishedAt: response.data.published_at,
      htmlUrl: response.data.html_url,
      tarballUrl: response.data.tarball_url,
      zipballUrl: response.data.zipball_url,
      author: response.data.author
        ? {
            login: response.data.author.login,
            avatarUrl: response.data.author.avatar_url,
            htmlUrl: response.data.author.html_url,
          }
        : null,
      assets: response.data.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        label: asset.label,
        size: asset.size,
        downloadCount: asset.download_count,
        browserDownloadUrl: asset.browser_download_url,
        contentType: asset.content_type,
        state: asset.state,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
      })),
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Latest release fetched successfully!",
      success: true,
      data: release,
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
        message: "No releases found for this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching latest release. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE RELEASE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE RELEASE ==>
export const createRelease = expressAsyncHandler(async (req, res) => {
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
  // GET RELEASE DATA FROM BODY
  const {
    tagName,
    targetCommitish,
    name,
    body,
    draft,
    prerelease,
    generateReleaseNotes,
  } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !tagName) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and tag name are required!",
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
  // CREATE RELEASE
  try {
    // CREATE RELEASE
    const response = await octokit.repos.createRelease({
      owner,
      repo,
      tag_name: tagName,
      target_commitish: targetCommitish,
      name: name || tagName,
      body: body || "",
      draft: draft || false,
      prerelease: prerelease || false,
      generate_release_notes: generateReleaseNotes || false,
    });
    // MAP RELEASE
    const release = {
      id: response.data.id,
      tagName: response.data.tag_name,
      targetCommitish: response.data.target_commitish,
      name: response.data.name || response.data.tag_name,
      body: response.data.body,
      draft: response.data.draft,
      prerelease: response.data.prerelease,
      createdAt: response.data.created_at,
      publishedAt: response.data.published_at,
      htmlUrl: response.data.html_url,
      author: response.data.author
        ? {
            login: response.data.author.login,
            avatarUrl: response.data.author.avatar_url,
          }
        : null,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Release created successfully!",
      success: true,
      data: release,
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
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to create releases in this repository.",
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
          error.message || "Invalid release data. Tag may already exist.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating release. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UPDATE RELEASE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE RELEASE ==>
export const updateRelease = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RELEASE_ID FROM PARAMS
  const { owner, repo, release_id } = req.params;
  // GET RELEASE DATA FROM BODY
  const { tagName, targetCommitish, name, body, draft, prerelease } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !release_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and release ID are required!",
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
  // UPDATE RELEASE
  try {
    // BUILD UPDATE DATA
    const updateData: any = {};
    // ADD TAG NAME IF PROVIDED
    if (tagName !== undefined) updateData.tag_name = tagName;
    // ADD TARGET COMMITISH IF PROVIDED
    if (targetCommitish !== undefined)
      updateData.target_commitish = targetCommitish;
    // ADD NAME IF PROVIDED
    if (name !== undefined) updateData.name = name;
    // ADD BODY IF PROVIDED
    if (body !== undefined) updateData.body = body;
    // ADD DRAFT IF PROVIDED
    if (draft !== undefined) updateData.draft = draft;
    // ADD PRERELEASE IF PROVIDED
    if (prerelease !== undefined) updateData.prerelease = prerelease;
    // UPDATE RELEASE
    const response = await octokit.repos.updateRelease({
      owner,
      repo,
      release_id: parseInt(release_id),
      ...updateData,
    });
    // MAP RELEASE
    const release = {
      id: response.data.id,
      tagName: response.data.tag_name,
      targetCommitish: response.data.target_commitish,
      name: response.data.name || response.data.tag_name,
      body: response.data.body,
      draft: response.data.draft,
      prerelease: response.data.prerelease,
      createdAt: response.data.created_at,
      publishedAt: response.data.published_at,
      htmlUrl: response.data.html_url,
      author: response.data.author
        ? {
            login: response.data.author.login,
            avatarUrl: response.data.author.avatar_url,
          }
        : null,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Release updated successfully!",
      success: true,
      data: release,
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
        message: "Release not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to update this release.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error updating release. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE RELEASE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE RELEASE ==>
export const deleteRelease = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND RELEASE_ID FROM PARAMS
  const { owner, repo, release_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !release_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and release ID are required!",
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
  // DELETE RELEASE
  try {
    // DELETE RELEASE
    await octokit.repos.deleteRelease({
      owner,
      repo,
      release_id: parseInt(release_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Release deleted successfully!",
      success: true,
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
        message: "Release not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to delete this release.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error deleting release. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * LIST TAGS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LIST TAGS ==>
export const listTags = expressAsyncHandler(async (req, res) => {
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
  // GET PAGINATION FROM QUERY
  const page = parseInt(req.query.page as string) || 1;
  // GET PER PAGE FROM QUERY
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
  // FETCH TAGS
  try {
    // FETCH TAGS
    const response = await octokit.repos.listTags({
      owner,
      repo,
      page,
      per_page: perPage,
    });
    // MAP TAGS
    const tags = response.data.map((tag) => ({
      name: tag.name,
      sha: tag.commit.sha,
      zipballUrl: tag.zipball_url,
      tarballUrl: tag.tarball_url,
      nodeId: tag.node_id,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Tags fetched successfully!",
      success: true,
      data: {
        tags,
        pagination: {
          page,
          perPage,
          hasMore: response.data.length === perPage,
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
    // NOT FOUND
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
      message: "Error fetching tags. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET TAG DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TAG DETAILS ==>
export const getTagDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND TAG FROM PARAMS
  const { owner, repo, tag } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !tag) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and tag name are required!",
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
  // FETCH TAG DETAILS
  try {
    // FETCH GIT REF FOR TAG
    const refResponse = await octokit.git.getRef({
      owner,
      repo,
      ref: `tags/${tag}`,
    });
    // GET TAG OBJECT
    let tagData: any = {
      name: tag,
      sha: refResponse.data.object.sha,
      type: refResponse.data.object.type,
    };
    // IF TAG IS ANNOTATED, GET MORE DETAILS
    if (refResponse.data.object.type === "tag") {
      // FETCH TAG OBJECT
      const tagResponse = await octokit.git.getTag({
        owner,
        repo,
        tag_sha: refResponse.data.object.sha,
      });
      // UPDATE TAG DATA
      tagData = {
        ...tagData,
        message: tagResponse.data.message,
        tagger: tagResponse.data.tagger
          ? {
              name: tagResponse.data.tagger.name,
              email: tagResponse.data.tagger.email,
              date: tagResponse.data.tagger.date,
            }
          : null,
        objectSha: tagResponse.data.object.sha,
        objectType: tagResponse.data.object.type,
        verified: tagResponse.data.verification?.verified || false,
      };
    }
    // TRY TO GET ASSOCIATED RELEASE
    try {
      // FETCH RELEASE BY TAG
      const releaseResponse = await octokit.repos.getReleaseByTag({
        owner,
        repo,
        tag,
      });
      // ADD RELEASE INFO
      tagData.release = {
        id: releaseResponse.data.id,
        name: releaseResponse.data.name,
        htmlUrl: releaseResponse.data.html_url,
        draft: releaseResponse.data.draft,
        prerelease: releaseResponse.data.prerelease,
        publishedAt: releaseResponse.data.published_at,
      };
    } catch {
      // NO RELEASE FOR THIS TAG
      tagData.release = null;
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Tag details fetched successfully!",
      success: true,
      data: tagData,
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
        message: "Tag not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching tag details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE TAG
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE TAG ==>
export const createTag = expressAsyncHandler(async (req, res) => {
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
  // GET TAG DATA FROM BODY
  const { tagName, sha, message } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !tagName || !sha) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, tag name, and SHA are required!",
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
  // CREATE TAG
  try {
    let tagSha = sha;
    // IF MESSAGE IS PROVIDED, CREATE ANNOTATED TAG
    if (message) {
      // CREATE TAG OBJECT
      const tagResponse = await octokit.git.createTag({
        owner,
        repo,
        tag: tagName,
        message,
        object: sha,
        type: "commit",
      });
      // USE TAG SHA
      tagSha = tagResponse.data.sha;
    }
    // CREATE REF FOR TAG
    const refResponse = await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/tags/${tagName}`,
      sha: tagSha,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Tag created successfully!",
      success: true,
      data: {
        name: tagName,
        sha: tagSha,
        ref: refResponse.data.ref,
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
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to create tags in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATION ERROR (TAG EXISTS)
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: "Tag already exists or invalid data provided.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating tag. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE TAG
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE TAG ==>
export const deleteTag = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND TAG FROM PARAMS
  const { owner, repo, tag } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !tag) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and tag name are required!",
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
  // DELETE TAG
  try {
    // DELETE REF
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `tags/${tag}`,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Tag deleted successfully!",
      success: true,
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
        message: "Tag not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to delete this tag.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error deleting tag. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GENERATE RELEASE NOTES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GENERATE RELEASE NOTES ==>
export const generateReleaseNotes = expressAsyncHandler(async (req, res) => {
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
  // GET DATA FROM BODY
  const { tagName, targetCommitish, previousTagName } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !tagName) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and tag name are required!",
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
  // GENERATE RELEASE NOTES
  try {
    // GENERATE RELEASE NOTES
    const response = await octokit.repos.generateReleaseNotes({
      owner,
      repo,
      tag_name: tagName,
      target_commitish: targetCommitish,
      previous_tag_name: previousTagName,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Release notes generated successfully!",
      success: true,
      data: {
        name: response.data.name,
        body: response.data.body,
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
        message: "Repository or tag not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error generating release notes. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * LIST DEPLOYMENTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LIST DEPLOYMENTS ==>
export const listDeployments = expressAsyncHandler(async (req, res) => {
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
  // GET COMMIT SHA FROM QUERY
  const sha = req.query.sha as string;
  // GET REF FROM QUERY
  const ref = req.query.ref as string;
  // GET TASK FROM QUERY
  const task = req.query.task as string;
  // GET ENVIRONMENT FROM QUERY
  const environment = req.query.environment as string;
  // GET PAGE FROM QUERY
  const page = parseInt(req.query.page as string) || 1;
  // GET PER PAGE FROM QUERY
  const perPage = parseInt(req.query.per_page as string) || 20;
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
  // FETCH DEPLOYMENTS
  try {
    // BUILD REQUEST PARAMS
    const params: any = {
      owner,
      repo,
      page,
      per_page: perPage,
    };
    // ADD COMMIT SHA IF PROVIDED
    if (sha) params.sha = sha;
    // ADD REF IF PROVIDED
    if (ref) params.ref = ref;
    // ADD TASK IF PROVIDED
    if (task) params.task = task;
    // ADD ENVIRONMENT IF PROVIDED
    if (environment) params.environment = environment;
    // FETCH DEPLOYMENTS
    const response = await octokit.repos.listDeployments(params);
    // MAP DEPLOYMENTS
    const deployments = response.data.map((deployment) => ({
      id: deployment.id,
      sha: deployment.sha,
      ref: deployment.ref,
      task: deployment.task,
      environment: deployment.environment,
      description: deployment.description,
      creator: deployment.creator
        ? {
            login: deployment.creator.login,
            avatarUrl: deployment.creator.avatar_url,
            htmlUrl: deployment.creator.html_url,
          }
        : null,
      createdAt: deployment.created_at,
      updatedAt: deployment.updated_at,
      transientEnvironment: deployment.transient_environment,
      productionEnvironment: deployment.production_environment,
      nodeId: deployment.node_id,
      statusesUrl: deployment.statuses_url,
      repositoryUrl: deployment.repository_url,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Deployments fetched successfully!",
      success: true,
      data: {
        deployments,
        pagination: {
          page,
          perPage,
          hasMore: response.data.length === perPage,
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
    // NOT FOUND
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
      message: "Error fetching deployments. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET DEPLOYMENT DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DEPLOYMENT DETAILS ==>
export const getDeploymentDetails = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND DEPLOYMENT_ID FROM PARAMS
  const { owner, repo, deployment_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !deployment_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and deployment ID are required!",
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
  // FETCH DEPLOYMENT DETAILS
  try {
    // FETCH DEPLOYMENT
    const response = await octokit.repos.getDeployment({
      owner,
      repo,
      deployment_id: parseInt(deployment_id),
    });
    // FETCH LATEST STATUS
    const statusesResponse = await octokit.repos.listDeploymentStatuses({
      owner,
      repo,
      deployment_id: parseInt(deployment_id),
      per_page: 1,
    });
    // MAP DEPLOYMENT
    const deployment = {
      id: response.data.id,
      sha: response.data.sha,
      ref: response.data.ref,
      task: response.data.task,
      environment: response.data.environment,
      description: response.data.description,
      creator: response.data.creator
        ? {
            login: response.data.creator.login,
            avatarUrl: response.data.creator.avatar_url,
            htmlUrl: response.data.creator.html_url,
          }
        : null,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
      transientEnvironment: response.data.transient_environment,
      productionEnvironment: response.data.production_environment,
      nodeId: response.data.node_id,
      latestStatus: statusesResponse.data[0]
        ? {
            id: statusesResponse.data[0].id,
            state: statusesResponse.data[0].state,
            description: statusesResponse.data[0].description,
            environmentUrl: statusesResponse.data[0].environment_url,
            logUrl: statusesResponse.data[0].log_url,
            createdAt: statusesResponse.data[0].created_at,
            updatedAt: statusesResponse.data[0].updated_at,
          }
        : null,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Deployment details fetched successfully!",
      success: true,
      data: deployment,
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
        message: "Deployment not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching deployment details. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET DEPLOYMENT STATUSES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DEPLOYMENT STATUSES ==>
export const getDeploymentStatuses = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND DEPLOYMENT_ID FROM PARAMS
  const { owner, repo, deployment_id } = req.params;
  // GET PAGINATION FROM QUERY
  const page = parseInt(req.query.page as string) || 1;
  // GET PER PAGE FROM QUERY
  const perPage = parseInt(req.query.per_page as string) || 30;
  // VALIDATE PARAMS
  if (!owner || !repo || !deployment_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and deployment ID are required!",
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
  // FETCH DEPLOYMENT STATUSES
  try {
    // FETCH STATUSES
    const response = await octokit.repos.listDeploymentStatuses({
      owner,
      repo,
      deployment_id: parseInt(deployment_id),
      page,
      per_page: perPage,
    });
    // MAP STATUSES
    const statuses = response.data.map((status) => ({
      id: status.id,
      state: status.state,
      description: status.description,
      environmentUrl: status.environment_url,
      logUrl: status.log_url,
      creator: status.creator
        ? {
            login: status.creator.login,
            avatarUrl: status.creator.avatar_url,
            htmlUrl: status.creator.html_url,
          }
        : null,
      createdAt: status.created_at,
      updatedAt: status.updated_at,
      nodeId: status.node_id,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Deployment statuses fetched successfully!",
      success: true,
      data: {
        statuses,
        pagination: {
          page,
          perPage,
          hasMore: response.data.length === perPage,
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
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Deployment not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching deployment statuses. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE DEPLOYMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE DEPLOYMENT ==>
export const createDeployment = expressAsyncHandler(async (req, res) => {
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
  // GET DEPLOYMENT DATA FROM BODY
  const {
    ref,
    task,
    autoMerge,
    requiredContexts,
    payload,
    environment,
    description,
    transientEnvironment,
    productionEnvironment,
  } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !ref) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and ref are required!",
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
  // CREATE DEPLOYMENT
  try {
    // BUILD REQUEST DATA
    const requestData: any = {
      owner,
      repo,
      ref,
    };
    // ADD TASK IF PROVIDED
    if (task) requestData.task = task;
    // ADD AUTO MERGE IF PROVIDED
    if (autoMerge !== undefined) requestData.auto_merge = autoMerge;
    // ADD REQUIRED CONTEXTS IF PROVIDED
    if (requiredContexts) requestData.required_contexts = requiredContexts;
    // ADD PAYLOAD IF PROVIDED
    if (payload) requestData.payload = payload;
    // ADD ENVIRONMENT IF PROVIDED
    if (environment) requestData.environment = environment;
    // ADD DESCRIPTION IF PROVIDED
    if (description) requestData.description = description;
    // ADD TRANSIENT ENVIRONMENT IF PROVIDED
    if (transientEnvironment !== undefined)
      requestData.transient_environment = transientEnvironment;
    // ADD PRODUCTION ENVIRONMENT IF PROVIDED
    if (productionEnvironment !== undefined)
      requestData.production_environment = productionEnvironment;
    // CREATE DEPLOYMENT
    const response = await octokit.repos.createDeployment(requestData);
    // CHECK IF DEPLOYMENT WAS CREATED (STATUS 201) OR MERGED (STATUS 202)
    if (response.status === 202) {
      // RETURNING MERGE RESPONSE
      res.status(202).json({
        message: "Deployment is being auto-merged.",
        success: true,
        data: null,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // MAP DEPLOYMENT
    const deployment = {
      id: (response.data as any).id,
      sha: (response.data as any).sha,
      ref: (response.data as any).ref,
      task: (response.data as any).task,
      environment: (response.data as any).environment,
      description: (response.data as any).description,
      creator: (response.data as any).creator
        ? {
            login: (response.data as any).creator.login,
            avatarUrl: (response.data as any).creator.avatar_url,
          }
        : null,
      createdAt: (response.data as any).created_at,
      updatedAt: (response.data as any).updated_at,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Deployment created successfully!",
      success: true,
      data: deployment,
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
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message:
          "You don't have permission to create deployments in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CONFLICT (REQUIRED CONTEXTS NOT MET)
    if (error.status === 409) {
      // RETURNING ERROR RESPONSE
      res.status(409).json({
        message: error.message || "Required status checks have not passed.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATION ERROR
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message: error.message || "Invalid deployment data.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating deployment. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CREATE DEPLOYMENT STATUS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE DEPLOYMENT STATUS ==>
export const createDeploymentStatus = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND DEPLOYMENT_ID FROM PARAMS
  const { owner, repo, deployment_id } = req.params;
  // GET STATUS DATA FROM BODY
  const { state, logUrl, description, environmentUrl, autoInactive } = req.body;
  // VALIDATE PARAMS
  if (!owner || !repo || !deployment_id || !state) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, deployment ID, and state are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE STATE
  const validStates = [
    "error",
    "failure",
    "inactive",
    "in_progress",
    "queued",
    "pending",
    "success",
  ];
  if (!validStates.includes(state)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: `Invalid state. Must be one of: ${validStates.join(", ")}`,
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
  // CREATE DEPLOYMENT STATUS
  try {
    // BUILD REQUEST DATA
    const requestData: any = {
      owner,
      repo,
      deployment_id: parseInt(deployment_id),
      state,
    };
    // ADD LOG URL IF PROVIDED
    if (logUrl) requestData.log_url = logUrl;
    // ADD DESCRIPTION IF PROVIDED
    if (description) requestData.description = description;
    // ADD ENVIRONMENT URL IF PROVIDED
    if (environmentUrl) requestData.environment_url = environmentUrl;
    // ADD AUTO INACTIVE IF PROVIDED
    if (autoInactive !== undefined) requestData.auto_inactive = autoInactive;
    // CREATE DEPLOYMENT STATUS
    const response = await octokit.repos.createDeploymentStatus(requestData);
    // MAP STATUS
    const status = {
      id: response.data.id,
      state: response.data.state,
      description: response.data.description,
      environmentUrl: response.data.environment_url,
      logUrl: response.data.log_url,
      creator: response.data.creator
        ? {
            login: response.data.creator.login,
            avatarUrl: response.data.creator.avatar_url,
          }
        : null,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Deployment status created successfully!",
      success: true,
      data: status,
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
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to create deployment statuses.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Deployment not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating deployment status. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * DELETE DEPLOYMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE DEPLOYMENT ==>
export const deleteDeployment = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND DEPLOYMENT_ID FROM PARAMS
  const { owner, repo, deployment_id } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !deployment_id) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and deployment ID are required!",
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
  // DELETE DEPLOYMENT
  try {
    // DELETE DEPLOYMENT (MUST BE INACTIVE FIRST)
    await octokit.repos.deleteDeployment({
      owner,
      repo,
      deployment_id: parseInt(deployment_id),
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Deployment deleted successfully!",
      success: true,
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
        message: "Deployment not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORBIDDEN
    if (error.status === 403) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You don't have permission to delete this deployment.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CONFLICT (DEPLOYMENT IS NOT INACTIVE)
    if (error.status === 422) {
      // RETURNING ERROR RESPONSE
      res.status(422).json({
        message:
          "Deployment must be set to 'inactive' status before it can be deleted.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error deleting deployment. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

// <== LIST ENVIRONMENTS ==>
export const listEnvironments = expressAsyncHandler(async (req, res) => {
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
  // GET PAGINATION FROM QUERY
  const page = parseInt(req.query.page as string) || 1;
  // GET PER PAGE FROM QUERY
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
  // FETCH ENVIRONMENTS
  try {
    // FETCH ENVIRONMENTS
    const response = await octokit.repos.getAllEnvironments({
      owner,
      repo,
      page,
      per_page: perPage,
    });
    // MAP ENVIRONMENTS
    const environments = (response.data.environments || []).map((env) => ({
      id: env.id,
      name: env.name,
      htmlUrl: env.html_url,
      createdAt: env.created_at,
      updatedAt: env.updated_at,
      protectionRules: env.protection_rules?.map((rule) => ({
        id: rule.id,
        type: rule.type,
        waitTimer: (rule as any).wait_timer,
        reviewers: (rule as any).reviewers?.map((reviewer: any) => ({
          type: reviewer.type,
          login: reviewer.reviewer?.login,
          avatarUrl: reviewer.reviewer?.avatar_url,
        })),
      })),
      deploymentBranchPolicy: env.deployment_branch_policy
        ? {
            protectedBranches: env.deployment_branch_policy.protected_branches,
            customBranchPolicies:
              env.deployment_branch_policy.custom_branch_policies,
          }
        : null,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Environments fetched successfully!",
      success: true,
      data: {
        environments,
        totalCount: response.data.total_count,
        pagination: {
          page,
          perPage,
          hasMore: (response.data.environments || []).length === perPage,
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
    // NOT FOUND
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
      message: "Error fetching environments. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET ENVIRONMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ENVIRONMENT ==>
export const getEnvironment = expressAsyncHandler(async (req, res) => {
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
  // GET OWNER, REPO, AND ENVIRONMENT_NAME FROM PARAMS
  const { owner, repo, environment_name } = req.params;
  // VALIDATE PARAMS
  if (!owner || !repo || !environment_name) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner, repository name, and environment name are required!",
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
  // FETCH ENVIRONMENT
  try {
    // FETCH ENVIRONMENT
    const response = await octokit.repos.getEnvironment({
      owner,
      repo,
      environment_name: decodeURIComponent(environment_name),
    });
    // MAP ENVIRONMENT
    const environment = {
      id: response.data.id,
      name: response.data.name,
      htmlUrl: response.data.html_url,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
      protectionRules: response.data.protection_rules?.map((rule) => ({
        id: rule.id,
        type: rule.type,
        waitTimer: (rule as any).wait_timer,
        reviewers: (rule as any).reviewers?.map((reviewer: any) => ({
          type: reviewer.type,
          login: reviewer.reviewer?.login,
          avatarUrl: reviewer.reviewer?.avatar_url,
        })),
      })),
      deploymentBranchPolicy: response.data.deployment_branch_policy
        ? {
            protectedBranches:
              response.data.deployment_branch_policy.protected_branches,
            customBranchPolicies:
              response.data.deployment_branch_policy.custom_branch_policies,
          }
        : null,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Environment fetched successfully!",
      success: true,
      data: environment,
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
        message: "Environment not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching environment. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET DASHBOARD STATS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DASHBOARD STATS ==>
export const getDashboardStats = expressAsyncHandler(async (req, res) => {
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
  // FETCH DASHBOARD STATS
  try {
    // GET AUTHENTICATED USER
    const userResponse = await octokit.users.getAuthenticated();
    // GET USERNAME
    const username = userResponse.data.login;
    // FETCH USER'S REPOSITORIES (TOP 100 BY PUSHED)
    const reposResponse = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "pushed",
      direction: "desc",
    });
    // GET REPOSITORIES
    const repositories = reposResponse.data;
    // TOTAL REPOSITORIES
    const totalRepos = repositories.length;
    // PUBLIC REPOSITORIES
    const publicRepos = repositories.filter((r) => !r.private).length;
    // PRIVATE REPOSITORIES
    const privateRepos = repositories.filter((r) => r.private).length;
    // TOTAL STARS
    const totalStars = repositories.reduce(
      (sum, r) => sum + (r.stargazers_count || 0),
      0
    );
    // TOTAL FORKS
    const totalForks = repositories.reduce(
      (sum, r) => sum + (r.forks_count || 0),
      0
    );
    // TOP LANGUAGES
    const languageCounts: Record<string, number> = {};
    repositories.forEach((r) => {
      if (r.language) {
        languageCounts[r.language] = (languageCounts[r.language] || 0) + 1;
      }
    });
    // TOP 5 LANGUAGES
    const topLanguages = Object.entries(languageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([language, count]) => ({ language, count }));
    // OPEN PULL REQUESTS COUNT
    let openPRsCount = 0;
    // PENDING REVIEWS COUNT
    let pendingReviewsCount = 0;
    try {
      // OPEN PULL REQUESTS COUNT
      const prsResponse = await octokit.search.issuesAndPullRequests({
        q: `is:pr is:open author:${username}`,
        per_page: 1,
      });
      // OPEN PULL REQUESTS COUNT
      openPRsCount = prsResponse.data.total_count;
      // PENDING REVIEWS COUNT
      const reviewsResponse = await octokit.search.issuesAndPullRequests({
        q: `is:pr is:open review-requested:${username}`,
        per_page: 1,
      });
      // PENDING REVIEWS COUNT
      pendingReviewsCount = reviewsResponse.data.total_count;
    } catch (searchError) {
      // SEARCH API MIGHT HAVE RATE LIMITS, CONTINUE WITH 0
      console.error("Error fetching PR stats:", searchError);
    }
    // FETCH OPEN ISSUES CREATED BY USER
    let openIssuesCount = 0;
    // ASSIGNED ISSUES COUNT
    let assignedIssuesCount = 0;
    try {
      // SEARCH FOR OPEN ISSUES AUTHORED BY USER
      const issuesResponse = await octokit.search.issuesAndPullRequests({
        q: `is:issue is:open author:${username}`,
        per_page: 1,
      });
      // OPEN ISSUES COUNT
      openIssuesCount = issuesResponse.data.total_count;
      // ASSIGNED ISSUES COUNT
      const assignedResponse = await octokit.search.issuesAndPullRequests({
        q: `is:issue is:open assignee:${username}`,
        per_page: 1,
      });
      // ASSIGNED ISSUES COUNT
      assignedIssuesCount = assignedResponse.data.total_count;
    } catch (searchError) {
      // SEARCH API MIGHT HAVE RATE LIMITS, CONTINUE WITH 0
      console.error("Error fetching issue stats:", searchError);
    }
    // GET RECENT REPOSITORIES (TOP 5)
    const recentRepos = repositories.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      private: r.private,
      updatedAt: r.updated_at,
      pushedAt: r.pushed_at,
      htmlUrl: r.html_url,
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Dashboard stats fetched successfully!",
      success: true,
      data: {
        repositories: {
          total: totalRepos,
          public: publicRepos,
          private: privateRepos,
        },
        stars: totalStars,
        forks: totalForks,
        pullRequests: {
          open: openPRsCount,
          pendingReviews: pendingReviewsCount,
        },
        issues: {
          open: openIssuesCount,
          assigned: assignedIssuesCount,
        },
        topLanguages,
        recentRepos,
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
      message: "Error fetching dashboard stats. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET DASHBOARD ACTIVITY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DASHBOARD ACTIVITY ==>
export const getDashboardActivity = expressAsyncHandler(async (req, res) => {
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
  // GET LIMIT FROM QUERY
  const limit = parseInt(req.query.limit as string) || 20;
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
  // FETCH DASHBOARD ACTIVITY
  try {
    // GET AUTHENTICATED USER
    const userResponse = await octokit.users.getAuthenticated();
    // GET USERNAME
    const username = userResponse.data.login;
    // FETCH USER'S PUBLIC EVENTS
    const eventsResponse = await octokit.activity.listPublicEventsForUser({
      username,
      per_page: limit,
    });
    // ACTIVITY ARRAY
    const activity = eventsResponse.data.map((event) => {
      // BASE ACTIVITY OBJECT
      const baseActivity = {
        id: event.id,
        type: event.type,
        createdAt: event.created_at,
        repo: {
          id: event.repo.id,
          name: event.repo.name,
          url: `https://github.com/${event.repo.name}`,
        },
        actor: {
          id: event.actor.id,
          login: event.actor.login,
          avatarUrl: event.actor.avatar_url,
        },
      };
      // ADD TYPE-SPECIFIC DETAILS
      const payload = event.payload as any;
      // ADD TYPE-SPECIFIC DETAILS
      switch (event.type) {
        // PUSH EVENT
        case "PushEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              ref: payload.ref,
              head: payload.head,
              before: payload.before,
            },
          };
        // PULL REQUEST EVENT
        case "PullRequestEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              action: payload.action,
              number: payload.pull_request?.number,
              title: payload.pull_request?.title,
              state: payload.pull_request?.state,
              merged: payload.pull_request?.merged,
            },
          };
        // ISSUE EVENT
        case "IssuesEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              action: payload.action,
              number: payload.issue?.number,
              title: payload.issue?.title,
              state: payload.issue?.state,
            },
          };
        // ISSUE COMMENT EVENT
        case "IssueCommentEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              action: payload.action,
              issueNumber: payload.issue?.number,
              issueTitle: payload.issue?.title,
              body: payload.comment?.body?.substring(0, 100),
            },
          };
        // CREATE EVENT
        case "CreateEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              refType: payload.ref_type,
              ref: payload.ref,
              description: payload.description,
            },
          };
        // DELETE EVENT
        case "DeleteEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              refType: payload.ref_type,
              ref: payload.ref,
            },
          };
        // FORK EVENT
        case "ForkEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              forkee: {
                fullName: payload.forkee?.full_name,
                htmlUrl: payload.forkee?.html_url,
              },
            },
          };
        // WATCH EVENT
        case "WatchEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              action: payload.action,
            },
          };
        // RELEASE EVENT
        case "ReleaseEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              action: payload.action,
              tagName: payload.release?.tag_name,
              name: payload.release?.name,
            },
          };
        // PULL REQUEST REVIEW EVENT
        case "PullRequestReviewEvent":
          // RETURNING ACTIVITY OBJECT
          return {
            ...baseActivity,
            details: {
              action: payload.action,
              prNumber: payload.pull_request?.number,
              prTitle: payload.pull_request?.title,
              state: payload.review?.state,
            },
          };
        // DEFAULT
        default:
          // RETURNING ACTIVITY OBJECT
          return baseActivity;
      }
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Dashboard activity fetched successfully!",
      success: true,
      data: {
        activity,
        count: activity.length,
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
      message: "Error fetching dashboard activity. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET STARRED REPOSITORIES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET STARRED REPOSITORIES ==>
export const getStarredRepositories = expressAsyncHandler(async (req, res) => {
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
  // SETTING PAGE FOR QUERY
  const page = parseInt(req.query.page as string) || 1;
  // SETTING PER PAGE FOR QUERY
  const perPage = parseInt(req.query.per_page as string) || 30;
  // SETTING SORT FOR QUERY
  const sort = (req.query.sort as string) || "created";
  // SETTING DIRECTION FOR QUERY
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
  // FETCH STARRED REPOSITORIES
  try {
    // FETCH STARRED REPOS
    const response = await octokit.activity.listReposStarredByAuthenticatedUser(
      {
        per_page: perPage,
        page,
        sort: sort as "created" | "updated",
        direction: direction as "asc" | "desc",
      }
    );
    // MAP REPOSITORIES
    const repositories = response.data.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      private: repo.private,
      fork: repo.fork,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      defaultBranch: repo.default_branch,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
        htmlUrl: repo.owner.html_url,
      },
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Starred repositories fetched successfully!",
      success: true,
      data: {
        repositories,
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
      message: "Error fetching starred repositories. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * STAR REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== STAR REPOSITORY ==>
export const starRepository = expressAsyncHandler(async (req, res) => {
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
  // STAR REPOSITORY
  try {
    // STAR THE REPO
    await octokit.activity.starRepoForAuthenticatedUser({
      owner,
      repo,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository starred successfully!",
      success: true,
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
        message: "Repository not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error starring repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UNSTAR REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNSTAR REPOSITORY ==>
export const unstarRepository = expressAsyncHandler(async (req, res) => {
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
  // UNSTAR REPOSITORY
  try {
    // UNSTAR THE REPO
    await octokit.activity.unstarRepoForAuthenticatedUser({
      owner,
      repo,
    });
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository unstarred successfully!",
      success: true,
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
        message: "Repository not found.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error unstarring repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * CHECK IF REPOSITORY IS STARRED
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CHECK IF STARRED ==>
export const checkIfStarred = expressAsyncHandler(async (req, res) => {
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
  // CHECK IF STARRED
  try {
    // CHECK IF REPO IS STARRED
    await octokit.activity.checkRepoIsStarredByAuthenticatedUser({
      owner,
      repo,
    });
    // RETURNING SUCCESS RESPONSE (STARRED)
    res.status(200).json({
      message: "Repository is starred.",
      success: true,
      data: { isStarred: true },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // NOT STARRED (404)
    if (error.status === 404) {
      // RETURNING SUCCESS RESPONSE (NOT STARRED)
      res.status(200).json({
        message: "Repository is not starred.",
        success: true,
        data: { isStarred: false },
      });
      // RETURNING FROM FUNCTION
      return;
    }
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
      message: "Error checking starred status. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET PINNED REPOSITORIES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PINNED REPOSITORIES ==>
export const getPinnedRepositories = expressAsyncHandler(async (req, res) => {
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
  // FETCH PINNED REPOSITORIES USING GRAPHQL
  try {
    // GRAPHQL QUERY FOR PINNED REPOSITORIES
    const query = `
      query {
        viewer {
          pinnedItems(first: 6, types: REPOSITORY) {
            nodes {
              ... on Repository {
                id
                databaseId
                name
                nameWithOwner
                description
                url
                isPrivate
                isFork
                primaryLanguage {
                  name
                  color
                }
                stargazerCount
                forkCount
                defaultBranchRef {
                  name
                }
                createdAt
                updatedAt
                pushedAt
                owner {
                  login
                  avatarUrl
                }
              }
            }
          }
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const response: any = await octokit.graphql(query);
    // MAP PINNED REPOSITORIES
    const pinnedRepos = response.viewer.pinnedItems.nodes.map((repo: any) => ({
      id: repo.databaseId,
      name: repo.name,
      fullName: repo.nameWithOwner,
      description: repo.description,
      htmlUrl: repo.url,
      private: repo.isPrivate,
      fork: repo.isFork,
      language: repo.primaryLanguage?.name || null,
      languageColor: repo.primaryLanguage?.color || null,
      stars: repo.stargazerCount,
      forks: repo.forkCount,
      defaultBranch: repo.defaultBranchRef?.name || "main",
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      pushedAt: repo.pushedAt,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatarUrl,
      },
    }));
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Pinned repositories fetched successfully!",
      success: true,
      data: {
        repositories: pinnedRepos,
        count: pinnedRepos.length,
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
    // GRAPHQL ERRORS
    if (error.errors) {
      console.error("GraphQL errors:", error.errors);
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching pinned repositories. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GET GITHUB NOTIFICATIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GITHUB NOTIFICATIONS FUNCTION ==>
export const getGitHubNotifications = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    return;
  }
  // GET QUERY PARAMETERS
  const {
    all = "false",
    participating = "false",
    since,
    before,
    per_page = "50",
    page = "1",
  } = req.query;
  try {
    // FETCH NOTIFICATIONS FROM GITHUB
    const response =
      await octokit.rest.activity.listNotificationsForAuthenticatedUser({
        all: all === "true",
        participating: participating === "true",
        since: since as string | undefined,
        before: before as string | undefined,
        per_page: parseInt(per_page as string),
        page: parseInt(page as string),
      });
    // MAP NOTIFICATIONS TO CLEANER FORMAT
    const notifications = response.data.map((notification) => ({
      id: notification.id,
      unread: notification.unread,
      reason: notification.reason,
      updatedAt: notification.updated_at,
      lastReadAt: notification.last_read_at,
      subject: {
        title: notification.subject.title,
        url: notification.subject.url,
        latestCommentUrl: notification.subject.latest_comment_url,
        type: notification.subject.type,
      },
      repository: {
        id: notification.repository.id,
        name: notification.repository.name,
        fullName: notification.repository.full_name,
        owner: {
          login: notification.repository.owner.login,
          avatarUrl: notification.repository.owner.avatar_url,
        },
        private: notification.repository.private,
        htmlUrl: notification.repository.html_url,
      },
      url: notification.url,
      subscriptionUrl: notification.subscription_url,
    }));
    // GET PAGINATION INFO FROM HEADERS
    const linkHeader = response.headers.link || "";
    // CHECK IF HAS NEXT
    const hasNext = linkHeader.includes('rel="next"');
    // CHECK IF HAS PREV
    const hasPrev = linkHeader.includes('rel="prev"');
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "GitHub notifications fetched successfully!",
      success: true,
      data: {
        notifications,
        count: notifications.length,
        pagination: {
          page: parseInt(page as string),
          perPage: parseInt(per_page as string),
          hasNext,
          hasPrev,
        },
      },
    });
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching GitHub notifications. Please try again later.",
      success: false,
    });
    return;
  }
});

/**
 * MARK GITHUB NOTIFICATION AS READ
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MARK GITHUB NOTIFICATION AS READ FUNCTION ==>
export const markGitHubNotificationAsRead = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      return;
    }
    // GET NOTIFICATION ID FROM PARAMS
    const { thread_id } = req.params;
    // IF NO THREAD ID, RETURN ERROR
    if (!thread_id) {
      res.status(400).json({
        message: "Notification thread ID is required!",
        success: false,
      });
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      return;
    }
    try {
      // MARK NOTIFICATION AS READ
      await octokit.rest.activity.markThreadAsRead({
        thread_id: parseInt(thread_id),
      });
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Notification marked as read!",
        success: true,
      });
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        return;
      }
      // NOT FOUND
      if (error.status === 404) {
        res.status(404).json({
          message: "Notification not found.",
          success: false,
        });
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error marking notification as read. Please try again later.",
        success: false,
      });
      return;
    }
  }
);

/**
 * MARK ALL GITHUB NOTIFICATIONS AS READ
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MARK ALL GITHUB NOTIFICATIONS AS READ FUNCTION ==>
export const markAllGitHubNotificationsAsRead = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      return;
    }
    try {
      // MARK ALL NOTIFICATIONS AS READ
      await octokit.rest.activity.markNotificationsAsRead({
        last_read_at: new Date().toISOString(),
      });
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "All notifications marked as read!",
        success: true,
      });
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message:
          "Error marking all notifications as read. Please try again later.",
        success: false,
      });
      return;
    }
  }
);

/**
 * MARK REPOSITORY GITHUB NOTIFICATIONS AS READ
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MARK REPOSITORY GITHUB NOTIFICATIONS AS READ FUNCTION ==>
export const markRepoGitHubNotificationsAsRead = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      return;
    }
    // GET OWNER AND REPO FROM PARAMS
    const { owner, repo } = req.params;
    // IF NO OWNER OR REPO, RETURN ERROR
    if (!owner || !repo) {
      res.status(400).json({
        message: "Owner and repo are required!",
        success: false,
      });
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      return;
    }
    try {
      // MARK ALL REPO NOTIFICATIONS AS READ
      await octokit.rest.activity.markRepoNotificationsAsRead({
        owner,
        repo,
        last_read_at: new Date().toISOString(),
      });
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: `All notifications for ${owner}/${repo} marked as read!`,
        success: true,
      });
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        return;
      }
      // NOT FOUND
      if (error.status === 404) {
        res.status(404).json({
          message: "Repository not found.",
          success: false,
        });
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message:
          "Error marking repository notifications as read. Please try again later.",
        success: false,
      });
      return;
    }
  }
);

/**
 * GET GITHUB NOTIFICATION THREAD
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GITHUB NOTIFICATION THREAD FUNCTION ==>
export const getGitHubNotificationThread = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      return;
    }
    // GET THREAD ID FROM PARAMS
    const { thread_id } = req.params;
    // IF NO THREAD ID, RETURN ERROR
    if (!thread_id) {
      res.status(400).json({
        message: "Notification thread ID is required!",
        success: false,
      });
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      return;
    }
    try {
      // GET NOTIFICATION THREAD
      const response = await octokit.rest.activity.getThread({
        thread_id: parseInt(thread_id),
      });
      // MAP TO CLEANER FORMAT
      const notification = {
        id: response.data.id,
        unread: response.data.unread,
        reason: response.data.reason,
        updatedAt: response.data.updated_at,
        lastReadAt: response.data.last_read_at,
        subject: {
          title: response.data.subject.title,
          url: response.data.subject.url,
          latestCommentUrl: response.data.subject.latest_comment_url,
          type: response.data.subject.type,
        },
        repository: {
          id: response.data.repository.id,
          name: response.data.repository.name,
          fullName: response.data.repository.full_name,
          owner: {
            login: response.data.repository.owner.login,
            avatarUrl: response.data.repository.owner.avatar_url,
          },
          private: response.data.repository.private,
          htmlUrl: response.data.repository.html_url,
        },
        url: response.data.url,
        subscriptionUrl: response.data.subscription_url,
      };
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Notification thread fetched successfully!",
        success: true,
        data: notification,
      });
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        return;
      }
      // NOT FOUND
      if (error.status === 404) {
        res.status(404).json({
          message: "Notification thread not found.",
          success: false,
        });
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error fetching notification thread. Please try again later.",
        success: false,
      });
      return;
    }
  }
);

/**
 * DELETE GITHUB NOTIFICATION THREAD SUBSCRIPTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNSUBSCRIBE GITHUB NOTIFICATION FUNCTION ==>
export const unsubscribeGitHubNotification = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      return;
    }
    // GET THREAD ID FROM PARAMS
    const { thread_id } = req.params;
    // IF NO THREAD ID, RETURN ERROR
    if (!thread_id) {
      res.status(400).json({
        message: "Notification thread ID is required!",
        success: false,
      });
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      return;
    }
    try {
      // DELETE THREAD SUBSCRIPTION (MUTE)
      await octokit.rest.activity.deleteThreadSubscription({
        thread_id: parseInt(thread_id),
      });
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Unsubscribed from notification thread!",
        success: true,
      });
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        return;
      }
      // NOT FOUND
      if (error.status === 404) {
        res.status(404).json({
          message: "Notification thread not found.",
          success: false,
        });
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message:
          "Error unsubscribing from notification. Please try again later.",
        success: false,
      });
      return;
    }
  }
);

/**
 * GET REPOSITORY DISCUSSIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORY DISCUSSIONS FUNCTION ==>
export const getRepositoryDiscussions = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      return;
    }
    // GET OWNER AND REPO FROM PARAMS
    const { owner, repo } = req.params;
    // GET QUERY PARAMETERS
    const {
      first = "10",
      after,
      categoryId,
      orderBy = "UPDATED_AT",
      answered,
    } = req.query;
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      return;
    }
    try {
      // BUILD FILTER QUERY
      let filterBy = "";
      // CHECK IF CATEGORY ID IS PROVIDED
      if (categoryId) {
        // ADD CATEGORY ID TO FILTER
        filterBy = `categoryId: "${categoryId}"`;
      }
      // CHECK IF ANSWERED IS TRUE
      if (answered === "true") {
        // ADD ANSWERED TO FILTER
        filterBy += filterBy ? ", answered: true" : "answered: true";
      } else if (answered === "false") {
        // ADD ANSWERED TO FILTER
        filterBy += filterBy ? ", answered: false" : "answered: false";
      }
      // BUILD GRAPHQL QUERY
      const query = `
      query($owner: String!, $repo: String!, $first: Int!, $after: String, $orderBy: DiscussionOrderField!) {
        repository(owner: $owner, name: $repo) {
          discussions(first: $first, after: $after, orderBy: {field: $orderBy, direction: DESC}${
            filterBy ? `, filterBy: {${filterBy}}` : ""
          }) {
            totalCount
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            nodes {
              id
              number
              title
              body
              bodyHTML
              createdAt
              updatedAt
              url
              locked
              activeLockReason
              answerChosenAt
              answerChosenBy {
                login
                avatarUrl
              }
              author {
                login
                avatarUrl
                ... on User {
                  id
                }
              }
              category {
                id
                name
                emoji
                emojiHTML
                description
                isAnswerable
                slug
              }
              answer {
                id
                body
                createdAt
                author {
                  login
                  avatarUrl
                }
              }
              comments(first: 1) {
                totalCount
              }
              reactions {
                totalCount
              }
              upvoteCount
            }
          }
          discussionCategories(first: 20) {
            nodes {
              id
              name
              emoji
              emojiHTML
              description
              isAnswerable
              slug
            }
          }
        }
      }
    `;
      // EXECUTE GRAPHQL QUERY
      const response: any = await octokit.graphql(query, {
        owner,
        repo,
        first: parseInt(first as string),
        after: after as string | undefined,
        orderBy: orderBy as string,
      });
      // MAP DISCUSSIONS TO CLEANER FORMAT
      const discussions = response.repository.discussions.nodes.map(
        (d: any) => ({
          id: d.id,
          number: d.number,
          title: d.title,
          body: d.body,
          bodyHTML: d.bodyHTML,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          url: d.url,
          locked: d.locked,
          activeLockReason: d.activeLockReason,
          answerChosenAt: d.answerChosenAt,
          answerChosenBy: d.answerChosenBy
            ? {
                login: d.answerChosenBy.login,
                avatarUrl: d.answerChosenBy.avatarUrl,
              }
            : null,
          author: d.author
            ? {
                login: d.author.login,
                avatarUrl: d.author.avatarUrl,
              }
            : null,
          category: d.category
            ? {
                id: d.category.id,
                name: d.category.name,
                emoji: d.category.emoji,
                emojiHTML: d.category.emojiHTML,
                description: d.category.description,
                isAnswerable: d.category.isAnswerable,
                slug: d.category.slug,
              }
            : null,
          answer: d.answer
            ? {
                id: d.answer.id,
                body: d.answer.body,
                createdAt: d.answer.createdAt,
                author: d.answer.author
                  ? {
                      login: d.answer.author.login,
                      avatarUrl: d.answer.author.avatarUrl,
                    }
                  : null,
              }
            : null,
          commentsCount: d.comments.totalCount,
          reactionsCount: d.reactions.totalCount,
          upvoteCount: d.upvoteCount,
        })
      );
      // MAP CATEGORIES
      const categories = response.repository.discussionCategories.nodes.map(
        (c: any) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          emojiHTML: c.emojiHTML,
          description: c.description,
          isAnswerable: c.isAnswerable,
          slug: c.slug,
        })
      );
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Repository discussions fetched successfully!",
        success: true,
        data: {
          discussions,
          categories,
          totalCount: response.repository.discussions.totalCount,
          pageInfo: response.repository.discussions.pageInfo,
        },
      });
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        return;
      }
      // GRAPHQL ERRORS
      if (error.errors) {
        console.error("GraphQL errors:", error.errors);
        // CHECK IF DISCUSSIONS ARE DISABLED
        if (
          error.errors.some(
            (e: any) =>
              e.message?.includes("discussions") || e.type === "NOT_FOUND"
          )
        ) {
          // RETURN ERROR RESPONSE
          res.status(404).json({
            message: "Discussions are not enabled for this repository.",
            success: false,
          });
          return;
        }
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error fetching discussions. Please try again later.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * GET DISCUSSION DETAILS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DISCUSSION DETAILS FUNCTION ==>
export const getDiscussionDetails = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GET OWNER, REPO, AND DISCUSSION NUMBER FROM PARAMS
  const { owner, repo, discussion_number } = req.params;
  // GET QUERY PARAMETERS
  const { commentsFirst = "20", commentsAfter } = req.query;
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    return;
  }
  try {
    // GRAPHQL QUERY FOR DISCUSSION DETAILS
    const query = `
      query($owner: String!, $repo: String!, $number: Int!, $commentsFirst: Int!, $commentsAfter: String) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) {
            id
            number
            title
            body
            bodyHTML
            createdAt
            updatedAt
            url
            locked
            activeLockReason
            answerChosenAt
            answerChosenBy {
              login
              avatarUrl
            }
            author {
              login
              avatarUrl
              ... on User {
                id
              }
            }
            category {
              id
              name
              emoji
              emojiHTML
              description
              isAnswerable
              slug
            }
            answer {
              id
              body
              bodyHTML
              createdAt
              updatedAt
              isAnswer
              author {
                login
                avatarUrl
              }
              reactions {
                totalCount
              }
              replies(first: 10) {
                totalCount
                nodes {
                  id
                  body
                  bodyHTML
                  createdAt
                  author {
                    login
                    avatarUrl
                  }
                  reactions {
                    totalCount
                  }
                }
              }
            }
            comments(first: $commentsFirst, after: $commentsAfter) {
              totalCount
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
              nodes {
                id
                body
                bodyHTML
                createdAt
                updatedAt
                isAnswer
                author {
                  login
                  avatarUrl
                }
                reactions {
                  totalCount
                }
                replies(first: 10) {
                  totalCount
                  nodes {
                    id
                    body
                    bodyHTML
                    createdAt
                    author {
                      login
                      avatarUrl
                    }
                    reactions {
                      totalCount
                    }
                  }
                }
              }
            }
            reactions {
              totalCount
            }
            upvoteCount
          }
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const response: any = await octokit.graphql(query, {
      owner,
      repo,
      number: parseInt(discussion_number ?? "0"),
      commentsFirst: parseInt(commentsFirst as string),
      commentsAfter: commentsAfter as string | undefined,
    });
    // GET DISCUSSION
    const d = response.repository.discussion;
    // IF NO DISCUSSION, RETURN ERROR
    if (!d) {
      // RETURN ERROR RESPONSE
      res.status(404).json({
        message: "Discussion not found.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // MAP DISCUSSION TO CLEANER FORMAT
    const discussion = {
      id: d.id,
      number: d.number,
      title: d.title,
      body: d.body,
      bodyHTML: d.bodyHTML,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      url: d.url,
      locked: d.locked,
      activeLockReason: d.activeLockReason,
      answerChosenAt: d.answerChosenAt,
      answerChosenBy: d.answerChosenBy
        ? {
            login: d.answerChosenBy.login,
            avatarUrl: d.answerChosenBy.avatarUrl,
          }
        : null,
      author: d.author
        ? {
            login: d.author.login,
            avatarUrl: d.author.avatarUrl,
          }
        : null,
      category: d.category
        ? {
            id: d.category.id,
            name: d.category.name,
            emoji: d.category.emoji,
            emojiHTML: d.category.emojiHTML,
            description: d.category.description,
            isAnswerable: d.category.isAnswerable,
            slug: d.category.slug,
          }
        : null,
      answer: d.answer
        ? {
            id: d.answer.id,
            body: d.answer.body,
            bodyHTML: d.answer.bodyHTML,
            createdAt: d.answer.createdAt,
            updatedAt: d.answer.updatedAt,
            isAnswer: d.answer.isAnswer,
            author: d.answer.author
              ? {
                  login: d.answer.author.login,
                  avatarUrl: d.answer.author.avatarUrl,
                }
              : null,
            reactionsCount: d.answer.reactions.totalCount,
            repliesCount: d.answer.replies.totalCount,
            replies: d.answer.replies.nodes.map((r: any) => ({
              id: r.id,
              body: r.body,
              bodyHTML: r.bodyHTML,
              createdAt: r.createdAt,
              author: r.author
                ? {
                    login: r.author.login,
                    avatarUrl: r.author.avatarUrl,
                  }
                : null,
              reactionsCount: r.reactions.totalCount,
            })),
          }
        : null,
      comments: d.comments.nodes.map((c: any) => ({
        id: c.id,
        body: c.body,
        bodyHTML: c.bodyHTML,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        isAnswer: c.isAnswer,
        author: c.author
          ? {
              login: c.author.login,
              avatarUrl: c.author.avatarUrl,
            }
          : null,
        reactionsCount: c.reactions.totalCount,
        repliesCount: c.replies.totalCount,
        replies: c.replies.nodes.map((r: any) => ({
          id: r.id,
          body: r.body,
          bodyHTML: r.bodyHTML,
          createdAt: r.createdAt,
          author: r.author
            ? {
                login: r.author.login,
                avatarUrl: r.author.avatarUrl,
              }
            : null,
          reactionsCount: r.reactions.totalCount,
        })),
      })),
      commentsCount: d.comments.totalCount,
      commentsPageInfo: d.comments.pageInfo,
      reactionsCount: d.reactions.totalCount,
      upvoteCount: d.upvoteCount,
    };
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Discussion details fetched successfully!",
      success: true,
      data: discussion,
    });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GRAPHQL ERRORS
    if (error.errors) {
      console.error("GraphQL errors:", error.errors);
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching discussion details. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

/**
 * GET DISCUSSION CATEGORIES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DISCUSSION CATEGORIES FUNCTION ==>
export const getDiscussionCategories = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // GRAPHQL QUERY FOR DISCUSSION CATEGORIES
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          discussionCategories(first: 50) {
            nodes {
              id
              name
              emoji
              emojiHTML
              description
              isAnswerable
              slug
            }
          }
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const response: any = await octokit.graphql(query, {
      owner,
      repo,
    });
    // MAP CATEGORIES
    const categories = response.repository.discussionCategories.nodes.map(
      (c: any) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        emojiHTML: c.emojiHTML,
        description: c.description,
        isAnswerable: c.isAnswerable,
        slug: c.slug,
      })
    );
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Discussion categories fetched successfully!",
      success: true,
      data: {
        categories,
        count: categories.length,
      },
    });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GRAPHQL ERRORS
    if (error.errors) {
      console.error("GraphQL errors:", error.errors);
      // CHECK IF DISCUSSIONS ARE DISABLED
      if (
        error.errors.some(
          (e: any) =>
            e.message?.includes("discussions") || e.type === "NOT_FOUND"
        )
      ) {
        res.status(404).json({
          message: "Discussions are not enabled for this repository.",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching discussion categories. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

/**
 * CREATE DISCUSSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE DISCUSSION FUNCTION ==>
export const createDiscussion = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // GET BODY
  const { title, body, categoryId } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!title || !categoryId) {
    res.status(400).json({
      message: "Title and category are required!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // FIRST, GET REPOSITORY ID
    const repoQuery = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const repoResponse: any = await octokit.graphql(repoQuery, {
      owner,
      repo,
    });
    const repositoryId = repoResponse.repository.id;
    // GRAPHQL MUTATION TO CREATE DISCUSSION
    const mutation = `
      mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
          discussion {
            id
            number
            title
            body
            createdAt
            url
            author {
              login
              avatarUrl
            }
            category {
              id
              name
              emoji
            }
          }
        }
      }
    `;
    // EXECUTE GRAPHQL MUTATION
    const response: any = await octokit.graphql(mutation, {
      repositoryId,
      categoryId,
      title,
      body: body || "",
    });
    // GET DISCUSSION
    const d = response.createDiscussion.discussion;
    // MAP DISCUSSION TO CLEANER FORMAT
    const discussion = {
      id: d.id,
      number: d.number,
      title: d.title,
      body: d.body,
      createdAt: d.createdAt,
      url: d.url,
      author: d.author
        ? {
            login: d.author.login,
            avatarUrl: d.author.avatarUrl,
          }
        : null,
      category: d.category
        ? {
            id: d.category.id,
            name: d.category.name,
            emoji: d.category.emoji,
          }
        : null,
    };
    // RETURN SUCCESS RESPONSE
    res.status(201).json({
      message: "Discussion created successfully!",
      success: true,
      data: discussion,
    });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GRAPHQL ERRORS
    if (error.errors) {
      // LOG ERRORS
      console.error("GraphQL errors:", error.errors);
      // CHECK FOR SPECIFIC ERROR MESSAGES
      const errorMessage = error.errors[0]?.message || "";
      // CHECK IF ERROR MESSAGE INCLUDES CATEGORY
      if (errorMessage.includes("category")) {
        // RETURN ERROR RESPONSE
        res.status(400).json({
          message: "Invalid discussion category.",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error creating discussion. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

/**
 * ADD DISCUSSION COMMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ADD DISCUSSION COMMENT FUNCTION ==>
export const addDiscussionComment = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET OWNER, REPO, AND DISCUSSION NUMBER FROM PARAMS
  const { owner, repo, discussion_number } = req.params;
  // GET BODY
  const { body, replyToId } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!body) {
    res.status(400).json({
      message: "Comment body is required!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // FIRST, GET DISCUSSION ID
    const discussionQuery = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) {
            id
          }
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const discussionResponse: any = await octokit.graphql(discussionQuery, {
      owner,
      repo,
      number: parseInt(discussion_number ?? "0"),
    });
    // GET DISCUSSION ID
    const discussionId = discussionResponse.repository.discussion?.id;
    // IF NO DISCUSSION, RETURN ERROR
    if (!discussionId) {
      // RETURN ERROR RESPONSE
      res.status(404).json({
        message: "Discussion not found.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // BUILD GRAPHQL MUTATION
    let mutation = "";
    // VARIABLES
    let variables = {};
    // CHECK IF REPLY TO ID IS PROVIDED
    if (replyToId) {
      // BUILD GRAPHQL MUTATION FOR REPLY TO A COMMENT
      mutation = `
        mutation($discussionId: ID!, $replyToId: ID!, $body: String!) {
          addDiscussionComment(input: {discussionId: $discussionId, replyToId: $replyToId, body: $body}) {
            comment {
              id
              body
              bodyHTML
              createdAt
              author {
                login
                avatarUrl
              }
            }
          }
        }
      `;
      variables = {
        discussionId,
        replyToId,
        body,
      };
    } else {
      // TOP-LEVEL COMMENT
      mutation = `
        mutation($discussionId: ID!, $body: String!) {
          addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
            comment {
              id
              body
              bodyHTML
              createdAt
              author {
                login
                avatarUrl
              }
            }
          }
        }
      `;
      variables = {
        discussionId,
        body,
      };
    }
    // EXECUTE GRAPHQL MUTATION
    const response: any = await octokit.graphql(mutation, variables);
    // GET COMMENT
    const c = response.addDiscussionComment.comment;
    // MAP COMMENT TO CLEANER FORMAT
    const comment = {
      id: c.id,
      body: c.body,
      bodyHTML: c.bodyHTML,
      createdAt: c.createdAt,
      author: c.author
        ? {
            login: c.author.login,
            avatarUrl: c.author.avatarUrl,
          }
        : null,
    };
    // RETURN SUCCESS RESPONSE
    res.status(201).json({
      message: "Comment added successfully!",
      success: true,
      data: comment,
    });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GRAPHQL ERRORS
    if (error.errors) {
      // LOG ERRORS
      console.error("GraphQL errors:", error.errors);
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error adding comment. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

/**
 * MARK DISCUSSION COMMENT AS ANSWER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MARK DISCUSSION COMMENT AS ANSWER FUNCTION ==>
export const markDiscussionCommentAsAnswer = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET COMMENT ID FROM PARAMS
    const { commentId } = req.params;
    // VALIDATE REQUIRED FIELDS
    if (!commentId) {
      res.status(400).json({
        message: "Comment ID is required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    try {
      // GRAPHQL MUTATION TO MARK AS ANSWER
      const mutation = `
      mutation($commentId: ID!) {
        markDiscussionCommentAsAnswer(input: {id: $commentId}) {
          discussion {
            id
            number
            answerChosenAt
          }
        }
      }
    `;
      // EXECUTE GRAPHQL MUTATION
      const response: any = await octokit.graphql(mutation, {
        commentId,
      });
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Comment marked as answer!",
        success: true,
        data: {
          discussionId: response.markDiscussionCommentAsAnswer.discussion.id,
          discussionNumber:
            response.markDiscussionCommentAsAnswer.discussion.number,
          answerChosenAt:
            response.markDiscussionCommentAsAnswer.discussion.answerChosenAt,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        // RETURN ERROR RESPONSE
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // GRAPHQL ERRORS
      if (error.errors) {
        // LOG ERRORS
        console.error("GraphQL errors:", error.errors);
        // CHECK FOR PERMISSION ERROR
        const errorMessage = error.errors[0]?.message || "";
        // CHECK IF ERROR MESSAGE INCLUDES PERMISSION OR AUTHORIZED
        if (
          errorMessage.includes("permission") ||
          errorMessage.includes("authorized")
        ) {
          // RETURN ERROR RESPONSE
          res.status(403).json({
            message:
              "You don't have permission to mark this comment as answer.",
            success: false,
          });
          // RETURN FROM FUNCTION
          return;
        }
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error marking comment as answer. Please try again later.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * UNMARK DISCUSSION COMMENT AS ANSWER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNMARK DISCUSSION COMMENT AS ANSWER FUNCTION ==>
export const unmarkDiscussionCommentAsAnswer = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
    const userId = (req as AuthenticatedRequest).id;
    // IF USER ID NOT FOUND, RETURN ERROR
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET COMMENT ID FROM PARAMS
    const { commentId } = req.params;
    // VALIDATE REQUIRED FIELDS
    if (!commentId) {
      res.status(400).json({
        message: "Comment ID is required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    try {
      // GRAPHQL MUTATION TO UNMARK AS ANSWER
      const mutation = `
      mutation($commentId: ID!) {
        unmarkDiscussionCommentAsAnswer(input: {id: $commentId}) {
          discussion {
            id
            number
          }
        }
      }
    `;
      // EXECUTE GRAPHQL MUTATION
      const response: any = await octokit.graphql(mutation, {
        commentId,
      });
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Answer status removed from comment!",
        success: true,
        data: {
          discussionId: response.unmarkDiscussionCommentAsAnswer.discussion.id,
          discussionNumber:
            response.unmarkDiscussionCommentAsAnswer.discussion.number,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // TOKEN IS INVALID OR EXPIRED
      if (error.status === 401) {
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // GRAPHQL ERRORS
      if (error.errors) {
        // LOG ERRORS
        console.error("GraphQL errors:", error.errors);
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error removing answer status. Please try again later.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * GET EXTENDED PROFILE WITH CONTRIBUTIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET EXTENDED PROFILE ==>
export const getExtendedProfile = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // GRAPHQL QUERY FOR EXTENDED PROFILE
    const query = `
      query {
        viewer {
          id
          login
          name
          email
          bio
          company
          location
          websiteUrl
          twitterUsername
          avatarUrl
          url
          createdAt
          updatedAt
          isHireable
          pronouns
          followers {
            totalCount
          }
          following {
            totalCount
          }
          repositories(first: 1, privacy: PUBLIC) {
            totalCount
          }
          privateRepositories: repositories(first: 1, privacy: PRIVATE) {
            totalCount
          }
          starredRepositories {
            totalCount
          }
          watching {
            totalCount
          }
          gists {
            totalCount
          }
          publicGists: gists(first: 1, privacy: PUBLIC) {
            totalCount
          }
          sponsoring {
            totalCount
          }
          sponsors {
            totalCount
          }
          status {
            emoji
            message
            indicatesLimitedAvailability
          }
          socialAccounts(first: 10) {
            nodes {
              provider
              url
              displayName
            }
          }
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const response: any = await octokit.graphql(query);
    // MAP PROFILE DATA
    const viewer = response.viewer;
    // BUILD PROFILE DATA
    const profile = {
      id: viewer.id,
      login: viewer.login,
      name: viewer.name,
      email: viewer.email,
      bio: viewer.bio,
      company: viewer.company,
      location: viewer.location,
      websiteUrl: viewer.websiteUrl,
      twitterUsername: viewer.twitterUsername,
      avatarUrl: viewer.avatarUrl,
      profileUrl: viewer.url,
      createdAt: viewer.createdAt,
      updatedAt: viewer.updatedAt,
      isHireable: viewer.isHireable,
      pronouns: viewer.pronouns,
      followers: viewer.followers.totalCount,
      following: viewer.following.totalCount,
      publicRepos: viewer.repositories.totalCount,
      privateRepos: viewer.privateRepositories.totalCount,
      totalRepos:
        viewer.repositories.totalCount + viewer.privateRepositories.totalCount,
      starredRepos: viewer.starredRepositories.totalCount,
      watching: viewer.watching.totalCount,
      gists: viewer.gists.totalCount,
      publicGists: viewer.publicGists.totalCount,
      sponsoring: viewer.sponsoring.totalCount,
      sponsors: viewer.sponsors.totalCount,
      status: viewer.status
        ? {
            emoji: viewer.status.emoji,
            message: viewer.status.message,
            busy: viewer.status.indicatesLimitedAvailability,
          }
        : null,
      socialAccounts: viewer.socialAccounts.nodes.map((s: any) => ({
        provider: s.provider,
        url: s.url,
        displayName: s.displayName,
      })),
    };
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Extended profile fetched successfully!",
      success: true,
      data: profile,
    });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GRAPHQL ERRORS
    if (error.errors) {
      // LOG ERRORS
      console.error("GraphQL errors:", error.errors);
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching extended profile. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

/**
 * GET CONTRIBUTION STATS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET CONTRIBUTION STATS ==>
export const getContributionStats = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GET YEAR FROM QUERY (OPTIONAL)
  const { year } = req.query;
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // SET FROM DATE
    let fromDate: string;
    // SET TO DATE
    let toDate: string;
    // IF YEAR IS PROVIDED
    if (year) {
      // SET FROM DATE TO START OF YEAR
      fromDate = `${year}-01-01T00:00:00Z`;
      // SET TO DATE TO END OF YEAR
      toDate = `${year}-12-31T23:59:59Z`;
    } else {
      // SET TO DATE TO CURRENT DATE
      const now = new Date();
      // SET TO DATE TO CURRENT DATE
      toDate = now.toISOString();
      // SET FROM DATE TO ONE YEAR AGO
      const oneYearAgo = new Date(now);
      // SET ONE YEAR AGO
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      // SET FROM DATE TO ONE YEAR AGO
      fromDate = oneYearAgo.toISOString();
    }
    // BUILD GRAPHQL QUERY FOR CONTRIBUTION STATS
    const query = `
      query($from: DateTime!, $to: DateTime!) {
        viewer {
          login
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            totalIssueContributions
            totalPullRequestContributions
            totalPullRequestReviewContributions
            totalRepositoriesWithContributedCommits
            totalRepositoriesWithContributedIssues
            totalRepositoriesWithContributedPullRequests
            totalRepositoriesWithContributedPullRequestReviews
            restrictedContributionsCount
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  contributionLevel
                  date
                  weekday
                }
                firstDay
              }
              months {
                name
                year
                firstDay
                totalWeeks
              }
            }
            commitContributionsByRepository(maxRepositories: 10) {
              repository {
                name
                nameWithOwner
                url
                isPrivate
                primaryLanguage {
                  name
                  color
                }
              }
              contributions {
                totalCount
              }
            }
          }
          contributionYears: contributionsCollection {
            contributionYears
          }
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const response: any = await octokit.graphql(query, {
      from: fromDate,
      to: toDate,
    });
    // MAP CONTRIBUTION DATA
    const contrib = response.viewer.contributionsCollection;
    // MAP CALENDAR DATA
    const calendar = contrib.contributionCalendar;
    // GET ALL DAYS IN CALENDAR
    const allDays = calendar.weeks.flatMap((w: any) => w.contributionDays);
    // CALCULATE STREAKS
    let currentStreak = 0;
    // SET LONGEST STREAK
    let longestStreak = 0;
    // SET TEMP STREAK
    let tempStreak = 0;
    // SET CURRENT STREAK START
    let currentStreakStart: string | null = null;
    // SET CURRENT STREAK END
    let currentStreakEnd: string | null = null;
    // SET LONGEST STREAK START
    let longestStreakStart: string | null = null;
    // SET LONGEST STREAK END
    let longestStreakEnd: string | null = null;
    // CALCULATE STREAKS FROM MOST RECENT DATE
    const sortedDays = [...allDays].sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    // CURRENT STREAK (FROM TODAY BACKWARDS)
    const today = new Date().toISOString().split("T")[0];
    // SET FOUND TODAY
    let foundToday = false;
    // ITERATE DAYS FROM MOST RECENT TO OLDEST
    for (const day of sortedDays) {
      // IF DAY IS TODAY OR FOUND TODAY IS FALSE AND DAY HAS CONTRIBUTIONS
      if (day.date === today || (!foundToday && day.contributionCount > 0)) {
        // SET FOUND TODAY TO TRUE
        foundToday = true;
      }
      // IF FOUND TODAY IS TRUE
      if (foundToday) {
        // IF DAY HAS CONTRIBUTIONS
        if (day.contributionCount > 0) {
          // INCREMENT CURRENT STREAK
          currentStreak++;
          // IF CURRENT STREAK END IS NOT SET, SET IT TO DAY DATE
          if (!currentStreakEnd) currentStreakEnd = day.date;
          // SET CURRENT STREAK START TO DAY DATE
          currentStreakStart = day.date;
        } else {
          // BREAK OUT OF LOOP
          break;
        }
      }
    }
    // LONGEST STREAK (ITERATE ALL DAYS IN ORDER)
    const orderedDays = [...allDays].sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    // SET TEMP STREAK START
    let tempStreakStart: string | null = null;
    // ITERATE DAYS FROM OLDEST TO MOST RECENT
    for (const day of orderedDays) {
      // IF DAY HAS CONTRIBUTIONS
      if (day.contributionCount > 0) {
        // IF TEMP STREAK IS 0, SET TEMP STREAK START TO DAY DATE
        if (tempStreak === 0) tempStreakStart = day.date;
        // INCREMENT TEMP STREAK
        tempStreak++;
        // IF TEMP STREAK IS LONGER THAN LONGEST STREAK
        if (tempStreak > longestStreak) {
          // SET LONGEST STREAK TO TEMP STREAK
          longestStreak = tempStreak;
          // SET LONGEST STREAK START TO TEMP STREAK START
          longestStreakStart = tempStreakStart;
          // SET LONGEST STREAK END TO DAY DATE
          longestStreakEnd = day.date;
        }
      } else {
        // SET TEMP STREAK TO 0
        tempStreak = 0;
        // SET TEMP STREAK START TO NULL
        tempStreakStart = null;
      }
    }
    // BUILD RESPONSE
    const contributionStats = {
      totalContributions: calendar.totalContributions,
      commits: contrib.totalCommitContributions,
      issues: contrib.totalIssueContributions,
      pullRequests: contrib.totalPullRequestContributions,
      pullRequestReviews: contrib.totalPullRequestReviewContributions,
      repositoriesContributedTo: {
        commits: contrib.totalRepositoriesWithContributedCommits,
        issues: contrib.totalRepositoriesWithContributedIssues,
        pullRequests: contrib.totalRepositoriesWithContributedPullRequests,
        reviews: contrib.totalRepositoriesWithContributedPullRequestReviews,
      },
      privateContributions: contrib.restrictedContributionsCount,
      streaks: {
        current: {
          count: currentStreak,
          start: currentStreakStart,
          end: currentStreakEnd,
        },
        longest: {
          count: longestStreak,
          start: longestStreakStart,
          end: longestStreakEnd,
        },
      },
      calendar: {
        totalContributions: calendar.totalContributions,
        weeks: calendar.weeks.map((w: any) => ({
          firstDay: w.firstDay,
          days: w.contributionDays.map((d: any) => ({
            count: d.contributionCount,
            level: d.contributionLevel,
            date: d.date,
            weekday: d.weekday,
          })),
        })),
        months: calendar.months.map((m: any) => ({
          name: m.name,
          year: m.year,
          firstDay: m.firstDay,
          totalWeeks: m.totalWeeks,
        })),
      },
      topRepositories: contrib.commitContributionsByRepository.map(
        (r: any) => ({
          name: r.repository.name,
          fullName: r.repository.nameWithOwner,
          url: r.repository.url,
          isPrivate: r.repository.isPrivate,
          language: r.repository.primaryLanguage
            ? {
                name: r.repository.primaryLanguage.name,
                color: r.repository.primaryLanguage.color,
              }
            : null,
          commits: r.contributions.totalCount,
        })
      ),
      availableYears: response.viewer.contributionYears.contributionYears,
      dateRange: {
        from: fromDate,
        to: toDate,
      },
    };
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Contribution stats fetched successfully!",
      success: true,
      data: contributionStats,
    });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GRAPHQL ERRORS
    if (error.errors) {
      // LOG ERRORS
      console.error("GraphQL errors:", error.errors);
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching contribution stats. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

/**
 * GET PROFILE README
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PROFILE README ==>
export const getProfileReadme = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // GET AUTHENTICATED USER'S LOGIN
    const { data: user } = await octokit.rest.users.getAuthenticated();
    // GET USERNAME
    const username = user.login;
    // TRY TO GET README FROM USERNAME/USERNAME REPO
    try {
      // GET README FROM USERNAME/USERNAME REPO
      const { data: readme } = await octokit.rest.repos.getReadme({
        owner: username,
        repo: username,
      });
      // DECODE CONTENT
      const content = Buffer.from(readme.content, "base64").toString("utf-8");
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Profile README fetched successfully!",
        success: true,
        data: {
          content,
          htmlUrl: readme.html_url,
          path: readme.path,
          sha: readme.sha,
          size: readme.size,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (readmeError: any) {
      // README NOT FOUND
      if (readmeError.status === 404) {
        // RETURN SUCCESS RESPONSE
        res.status(200).json({
          message: "No profile README found.",
          success: true,
          data: null,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // THROW ERROR
      throw readmeError;
    }
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching profile README. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

/**
 * GET CONTRIBUTION ACTIVITY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET CONTRIBUTION ACTIVITY ==>
export const getContributionActivity = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as AuthenticatedRequest).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // GET QUERY PARAMS
  const { year, month } = req.query;
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  try {
    // SET FROM DATE
    let fromDate: string;
    // SET TO DATE
    let toDate: string;
    // IF YEAR AND MONTH ARE PROVIDED
    if (year && month) {
      // SET FROM DATE TO START OF MONTH
      const y = parseInt(year as string);
      // SET MONTH
      const m = parseInt(month as string);
      // SET FROM DATE TO START OF MONTH
      fromDate = new Date(y, m - 1, 1).toISOString();
      // SET TO DATE TO END OF MONTH
      toDate = new Date(y, m, 0, 23, 59, 59).toISOString();
    } else if (year) {
      // SET FROM DATE TO START OF YEAR
      fromDate = `${year}-01-01T00:00:00Z`;
      // SET TO DATE TO END OF YEAR
      toDate = `${year}-12-31T23:59:59Z`;
    } else {
      // SET FROM DATE TO START OF CURRENT MONTH
      const now = new Date();
      // SET FROM DATE TO START OF CURRENT MONTH
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      // SET TO DATE TO CURRENT DATE
      toDate = now.toISOString();
    }
    // BUILD GRAPHQL QUERY FOR CONTRIBUTION ACTIVITY
    const query = `
      query($from: DateTime!, $to: DateTime!) {
        viewer {
          login
          contributionsCollection(from: $from, to: $to) {
            commitContributionsByRepository(maxRepositories: 20) {
              repository {
                name
                nameWithOwner
                url
                isPrivate
                owner {
                  login
                  avatarUrl
                }
              }
              contributions {
                totalCount
              }
            }
            issueContributionsByRepository(maxRepositories: 10) {
              repository {
                name
                nameWithOwner
                url
                isPrivate
              }
              contributions {
                totalCount
              }
            }
            pullRequestContributionsByRepository(maxRepositories: 10) {
              repository {
                name
                nameWithOwner
                url
                isPrivate
              }
              contributions {
                totalCount
              }
            }
            pullRequestReviewContributionsByRepository(maxRepositories: 10) {
              repository {
                name
                nameWithOwner
                url
                isPrivate
              }
              contributions {
                totalCount
              }
            }
            repositoryContributions(first: 10) {
              nodes {
                repository {
                  name
                  nameWithOwner
                  url
                  isPrivate
                  createdAt
                  primaryLanguage {
                    name
                    color
                  }
                }
                occurredAt
              }
            }
            firstIssueContribution {
              ... on CreatedIssueContribution {
                issue {
                  title
                  number
                  url
                  repository {
                    nameWithOwner
                  }
                }
                occurredAt
              }
            }
            firstPullRequestContribution {
              ... on CreatedPullRequestContribution {
                pullRequest {
                  title
                  number
                  url
                  repository {
                    nameWithOwner
                  }
                }
                occurredAt
              }
            }
          }
        }
      }
    `;
    // EXECUTE GRAPHQL QUERY
    const response: any = await octokit.graphql(query, {
      from: fromDate,
      to: toDate,
    });
    // MAP ACTIVITY DATA
    const contrib = response.viewer.contributionsCollection;
    // BUILD ACTIVITY DATA
    const activity = {
      commits: {
        total: contrib.commitContributionsByRepository.reduce(
          (acc: number, r: any) => acc + r.contributions.totalCount,
          0
        ),
        repositories: contrib.commitContributionsByRepository.map((r: any) => ({
          name: r.repository.name,
          fullName: r.repository.nameWithOwner,
          url: r.repository.url,
          isPrivate: r.repository.isPrivate,
          owner: {
            login: r.repository.owner.login,
            avatarUrl: r.repository.owner.avatarUrl,
          },
          count: r.contributions.totalCount,
        })),
      },
      issues: {
        total: contrib.issueContributionsByRepository.reduce(
          (acc: number, r: any) => acc + r.contributions.totalCount,
          0
        ),
        repositories: contrib.issueContributionsByRepository.map((r: any) => ({
          name: r.repository.name,
          fullName: r.repository.nameWithOwner,
          url: r.repository.url,
          isPrivate: r.repository.isPrivate,
          count: r.contributions.totalCount,
        })),
      },
      pullRequests: {
        total: contrib.pullRequestContributionsByRepository.reduce(
          (acc: number, r: any) => acc + r.contributions.totalCount,
          0
        ),
        repositories: contrib.pullRequestContributionsByRepository.map(
          (r: any) => ({
            name: r.repository.name,
            fullName: r.repository.nameWithOwner,
            url: r.repository.url,
            isPrivate: r.repository.isPrivate,
            count: r.contributions.totalCount,
          })
        ),
      },
      reviews: {
        total: contrib.pullRequestReviewContributionsByRepository.reduce(
          (acc: number, r: any) => acc + r.contributions.totalCount,
          0
        ),
        repositories: contrib.pullRequestReviewContributionsByRepository.map(
          (r: any) => ({
            name: r.repository.name,
            fullName: r.repository.nameWithOwner,
            url: r.repository.url,
            isPrivate: r.repository.isPrivate,
            count: r.contributions.totalCount,
          })
        ),
      },
      repositoriesCreated: contrib.repositoryContributions.nodes.map(
        (r: any) => ({
          name: r.repository.name,
          fullName: r.repository.nameWithOwner,
          url: r.repository.url,
          isPrivate: r.repository.isPrivate,
          createdAt: r.occurredAt,
          language: r.repository.primaryLanguage
            ? {
                name: r.repository.primaryLanguage.name,
                color: r.repository.primaryLanguage.color,
              }
            : null,
        })
      ),
      milestones: {
        firstIssue: contrib.firstIssueContribution
          ? {
              title: contrib.firstIssueContribution.issue.title,
              number: contrib.firstIssueContribution.issue.number,
              url: contrib.firstIssueContribution.issue.url,
              repository:
                contrib.firstIssueContribution.issue.repository.nameWithOwner,
              occurredAt: contrib.firstIssueContribution.occurredAt,
            }
          : null,
        firstPullRequest: contrib.firstPullRequestContribution
          ? {
              title: contrib.firstPullRequestContribution.pullRequest.title,
              number: contrib.firstPullRequestContribution.pullRequest.number,
              url: contrib.firstPullRequestContribution.pullRequest.url,
              repository:
                contrib.firstPullRequestContribution.pullRequest.repository
                  .nameWithOwner,
              occurredAt: contrib.firstPullRequestContribution.occurredAt,
            }
          : null,
      },
      dateRange: {
        from: fromDate,
        to: toDate,
      },
    };
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Contribution activity fetched successfully!",
      success: true,
      data: activity,
    });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GRAPHQL ERRORS
    if (error.errors) {
      // LOG ERRORS
      console.error("GraphQL errors:", error.errors);
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching contribution activity. Please try again later.",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
});

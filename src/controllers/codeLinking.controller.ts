// <== IMPORTS ==>
import mongoose from "mongoose";
import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";
import { Task } from "../models/task.model.js";
import { User } from "../models/user.model.js";
import { decryptSecret } from "../utils/encryption.js";
import expressAsyncHandler from "express-async-handler";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { WorkspaceMember } from "../models/workspaceMember.model.js";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest extends Express.Request {
  // <== ID FIELD ==>
  id?: string;
}
// <== GITHUB USER DATA TYPE ==>
interface GitHubUserData {
  // <== GITHUB ACCESS TOKEN ==>
  githubAccessToken?: string;
  // <== GITHUB USERNAME ==>
  githubUsername?: string;
}
// <== LINKED COMMIT TYPE ==>
interface LinkedCommit {
  // <== SHA ==>
  sha: string;
  // <== MESSAGE ==>
  message: string;
  // <== URL ==>
  url: string;
  // <== AUTHOR ==>
  author: {
    // <== NAME ==>
    name?: string | undefined;
    // <== EMAIL ==>
    email?: string | undefined;
    // <== USERNAME ==>
    username?: string | undefined;
    // <== AVATAR URL ==>
    avatarUrl?: string | undefined;
  };
  // <== REPOSITORY ==>
  repository: {
    // <== OWNER ==>
    owner: string;
    // <== NAME ==>
    name: string;
    // <== FULL NAME ==>
    fullName: string;
  };
  // <== COMMITTED AT ==>
  committedAt: Date;
  // <== LINKED AT ==>
  linkedAt: Date;
}
// <== LINKED PULL REQUEST TYPE ==>
interface LinkedPullRequest {
  // <== NUMBER ==>
  number: number;
  // <== TITLE ==>
  title: string;
  // <== URL ==>
  url: string;
  // <== STATE ==>
  state: "open" | "closed" | "merged";
  // <== AUTHOR ==>
  author: {
    // <== USERNAME ==>
    username?: string | undefined;
    // <== AVATAR URL ==>
    avatarUrl?: string | undefined;
  };
  // <== REPOSITORY ==>
  repository: {
    // <== OWNER ==>
    owner: string;
    // <== NAME ==>
    name: string;
    // <== FULL NAME ==>
    fullName: string;
  };
  // <== CREATED AT ==>
  createdAt: Date;
  // <== MERGED AT ==>
  mergedAt: Date | null;
  // <== LINKED AT ==>
  linkedAt: Date;
}
// <== LINKED FILE TYPE ==>
interface LinkedFile {
  // <== PATH ==>
  path: string;
  // <== REPOSITORY ==>
  repository: {
    // <== OWNER ==>
    owner: string;
    // <== NAME ==>
    name: string;
    // <== FULL NAME ==>
    fullName: string;
  };
  // <== URL ==>
  url?: string | undefined;
  // <== LINKED AT ==>
  linkedAt: Date;
}
// <== LINKED BRANCH TYPE ==>
interface LinkedBranch {
  // <== NAME ==>
  name: string;
  // <== REPOSITORY ==>
  repository: {
    // <== OWNER ==>
    owner: string;
    // <== NAME ==>
    name: string;
    // <== FULL NAME ==>
    fullName: string;
  };
  // <== URL ==>
  url?: string | undefined;
  // <== LINKED AT ==>
  linkedAt: Date;
}

// <== GET GEMINI CLIENT ==>
const getGeminiClient = (): GoogleGenerativeAI | null => {
  // CHECK IF GEMINI API KEY IS SET
  if (!process.env.GEMINI_API_KEY) {
    // RETURN NULL IF GEMINI API KEY IS NOT SET
    return null;
  }
  // CREATE AND RETURN GEMINI CLIENT
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

// <== GET GEMINI MODEL ==>
const getGeminiModel = () => {
  // GET GEMINI CLIENT
  const genAI = getGeminiClient();
  // RETURN NULL IF GEMINI CLIENT IS NOT SET
  if (!genAI) return null;
  // GET GEMINI MODEL
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
};

/**
 * GET OCTOKIT INSTANCE FOR USER
 * @param userId - User ID
 * @returns Object With Octokit Instance or Error
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
    // RETURN ERROR RESPONSE
    return {
      octokit: null,
      error: { status: 404, message: "User not found!" },
    };
  }
  // CAST USER TO GITHUB USER DATA TYPE
  const githubUser = user as unknown as GitHubUserData;
  // CHECK IF GITHUB IS CONNECTED
  if (!githubUser.githubAccessToken || !githubUser.githubUsername) {
    // RETURN ERROR RESPONSE
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
  // TRY TO DECRYPT ACCESS TOKEN
  try {
    // DECRYPT ACCESS TOKEN
    decryptedToken = decryptSecret(githubUser.githubAccessToken);
  } catch {
    // RETURN ERROR RESPONSE
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
  // RETURN SUCCESS RESPONSE
  return { octokit, error: null };
};

// <== TASK REFERENCE PATTERNS ==>
const TASK_PATTERNS = [
  // TASK-123 FORMAT
  /\b(TASK-\d+)\b/gi,
  // FIXES #123, CLOSES #123, RESOLVES #123
  /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s*#(\d+)\b/gi,
  // #TASK-123
  /#(TASK-\d+)/gi,
  // [TASK-123]
  /\[(TASK-\d+)\]/gi,
];

/**
 * PARSE COMMIT MESSAGE FOR TASK REFERENCES
 * @param message - Commit message to parse
 * @returns Array of task keys found
 */
// <== PARSE TASK REFERENCES ==>
const parseTaskReferences = (message: string): string[] => {
  // CREATE SET OF TASK KEYS
  const taskKeys = new Set<string>();
  // CHECK EACH PATTERN
  for (const pattern of TASK_PATTERNS) {
    // RESET PATTERN INDEX
    pattern.lastIndex = 0;
    // FIND ALL MATCHES
    let match: RegExpExecArray | null;
    // WHILE MATCH IS NOT NULL
    while ((match = pattern.exec(message)) !== null) {
      // GET TASK KEY
      const taskKey = match[1];
      // IF TASK KEY IS NOT SET, CONTINUE
      if (!taskKey) continue;
      // CONVERT TASK KEY TO UPPERCASE
      const upperTaskKey = taskKey.toUpperCase();
      // ADD TO SET IF VALID
      if (upperTaskKey.startsWith("TASK-")) {
        // ADD TO SET IF VALID
        taskKeys.add(upperTaskKey);
      } else if (/^\d+$/.test(upperTaskKey)) {
        // ADD TO SET IF VALID
        taskKeys.add(`TASK-${upperTaskKey}`);
      }
    }
  }
  // RETURN SET OF TASK KEYS AS ARRAY
  return Array.from(taskKeys);
};

/**
 * SCAN COMMITS FOR TASK REFERENCES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SCAN COMMITS ==>
export const scanCommitsForTasks = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET REQUEST BODY
    const { owner, repo, branch = "main", since } = req.body;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE REQUIRED FIELDS
    if (!owner || !repo) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "Repository owner and name are required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET WORKSPACE AND VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET OCTOKIT
    const { octokit, error } = await getOctokitForUser(userId);
    if (error) {
      // RETURN ERROR RESPONSE
      res.status(error.status).json({ message: error.message, success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // FETCH COMMITS
    try {
      // FETCH COMMITS
      const commitsResponse = await octokit!.repos.listCommits({
        owner,
        repo,
        sha: branch,
        since:
          since ||
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        per_page: 100,
      });
      // CREATE ARRAY OF LINKED COMMITS
      const linkedCommits: Array<{
        taskKey: string;
        commit: LinkedCommit;
      }> = [];
      // PROCESS EACH COMMIT
      for (const commitData of commitsResponse.data) {
        // GET TASK REFERENCES
        const taskKeys = parseTaskReferences(commitData.commit.message);
        // IF TASK REFERENCES FOUND
        if (taskKeys.length > 0) {
          // CREATE LINKED COMMIT OBJECT
          const linkedCommit: LinkedCommit = {
            sha: commitData.sha,
            message: commitData.commit.message,
            url: commitData.html_url,
            author: {
              name: commitData.commit.author?.name ?? undefined,
              email: commitData.commit.author?.email ?? undefined,
              username: commitData.author?.login ?? undefined,
              avatarUrl: commitData.author?.avatar_url ?? undefined,
            },
            repository: {
              owner,
              name: repo,
              fullName: `${owner}/${repo}`,
            },
            committedAt: new Date(commitData.commit.author?.date || Date.now()),
            linkedAt: new Date(),
          };
          // ADD TO LINKED COMMITS
          for (const taskKey of taskKeys) {
            // ADD TO LINKED COMMITS
            linkedCommits.push({ taskKey, commit: linkedCommit });
          }
        }
      }
      // PROCESS EACH LINKED COMMIT
      let linkedCount = 0;
      // PROCESS EACH LINKED COMMIT
      for (const { taskKey, commit } of linkedCommits) {
        // FIND TASK BY KEY
        const task = await Task.findOne({
          taskKey,
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
        }).exec();
        // IF TASK FOUND
        if (task) {
          // CHECK IF COMMIT ALREADY LINKED
          const commits = task.linkedCode?.commits as
            | Array<{ sha: string }>
            | undefined;
          // FIND EXISTING COMMIT
          const existingCommit = commits?.find((c) => c.sha === commit.sha);
          // IF COMMIT NOT FOUND, ADD TO TASK
          if (!existingCommit) {
            // ADD COMMIT TO TASK
            await Task.updateOne(
              { _id: task._id },
              { $push: { "linkedCode.commits": commit } }
            ).exec();
            // INCREMENT LINKED COUNT
            linkedCount++;
          }
        }
      }
      // RETURN RESPONSE
      res.status(200).json({
        success: true,
        message: `Scanned ${commitsResponse.data.length} commits. Linked ${linkedCount} new commits to tasks.`,
        data: {
          scannedCount: commitsResponse.data.length,
          linkedCount,
          foundReferences: linkedCommits.length,
        },
      });
    } catch (err) {
      // HANDLE ERROR
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({
        message: `Failed to scan commits: ${errorMessage}`,
        success: false,
      });
    }
  }
);

/**
 * LINK COMMIT TO TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK COMMIT ==>
export const linkCommitToTask = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET TASK ID FROM PARAMS
    const { taskId } = req.params;
    // GET REQUEST BODY
    const { owner, repo, sha } = req.body;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE REQUIRED FIELDS
    if (!owner || !repo || !sha) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "Repository owner, name, and commit SHA are required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND TASK
    const task = await Task.findById(taskId).exec();
    // IF TASK NOT FOUND, RETURN ERROR
    if (!task) {
      // RETURN NOT FOUND RESPONSE
      res.status(404).json({ message: "Task not found!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK IF USER HAS ACCESS
    if (task.workspaceId) {
      // FIND WORKSPACE MEMBERSHIP
      const membership = await WorkspaceMember.findOne({
        workspaceId: task.workspaceId,
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
      })
        .lean()
        .exec();
      // IF NOT A MEMBER, RETURN ERROR
      if (!membership) {
        // RETURN FORBIDDEN RESPONSE
        res.status(403).json({
          message: "You do not have access to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    } else if (task.userId.toString() !== userId) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You do not have access to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET OCTOKIT
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR
    if (error) {
      // RETURN ERROR RESPONSE
      res.status(error.status).json({ message: error.message, success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // FETCH COMMIT
    try {
      // FETCH COMMIT
      const commitResponse = await octokit!.repos.getCommit({
        owner,
        repo,
        ref: sha,
      });
      // GET COMMIT DATA
      const commitData = commitResponse.data;
      // CREATE LINKED COMMIT OBJECT
      const linkedCommit: LinkedCommit = {
        sha: commitData.sha,
        message: commitData.commit.message,
        url: commitData.html_url,
        author: {
          name: commitData.commit.author?.name ?? undefined,
          email: commitData.commit.author?.email ?? undefined,
          username: commitData.author?.login ?? undefined,
          avatarUrl: commitData.author?.avatar_url ?? undefined,
        },
        repository: {
          owner,
          name: repo,
          fullName: `${owner}/${repo}`,
        },
        committedAt: new Date(commitData.commit.author?.date || Date.now()),
        linkedAt: new Date(),
      };
      // CHECK IF COMMIT ALREADY LINKED
      const commits = task.linkedCode?.commits as
        | Array<{ sha: string }>
        | undefined;
      // FIND EXISTING COMMIT
      const existingCommit = commits?.find((c) => c.sha === sha);
      // IF COMMIT ALREADY LINKED, RETURN ERROR
      if (existingCommit) {
        // RETURN BAD REQUEST RESPONSE
        res.status(400).json({
          message: "Commit is already linked to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // ADD COMMIT TO TASK
      await Task.updateOne(
        { _id: task._id },
        { $push: { "linkedCode.commits": linkedCommit } }
      ).exec();
      // RETURN RESPONSE
      res.status(200).json({
        success: true,
        message: "Commit linked to task successfully!",
        data: linkedCommit,
      });
    } catch (err) {
      // HANDLE ERROR
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: `Failed to link commit: ${errorMessage}`,
        success: false,
      });
    }
  }
);

/**
 * LINK PULL REQUEST TO TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK PULL REQUEST ==>
export const linkPullRequestToTask = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET TASK ID FROM PARAMS
    const { taskId } = req.params;
    // GET REQUEST BODY
    const { owner, repo, number } = req.body;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE REQUIRED FIELDS
    if (!owner || !repo || !number) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "Repository owner, name, and PR number are required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND TASK
    const task = await Task.findById(taskId).exec();
    // IF TASK NOT FOUND, RETURN ERROR
    if (!task) {
      // RETURN NOT FOUND RESPONSE
      res.status(404).json({ message: "Task not found!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK IF USER HAS ACCESS
    if (task.workspaceId) {
      // FIND WORKSPACE MEMBERSHIP
      const membership = await WorkspaceMember.findOne({
        workspaceId: task.workspaceId,
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
      })
        .lean()
        .exec();
      // IF NOT A MEMBER, RETURN ERROR
      if (!membership) {
        // RETURN FORBIDDEN RESPONSE
        res.status(403).json({
          message: "You do not have access to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    } else if (task.userId.toString() !== userId) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You do not have access to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET OCTOKIT
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR
    if (error) {
      // RETURN ERROR RESPONSE
      res.status(error.status).json({ message: error.message, success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // FETCH PR
    try {
      // FETCH PR
      const prResponse = await octokit!.pulls.get({
        owner,
        repo,
        pull_number: number,
      });
      // GET PR DATA
      const prData = prResponse.data;
      // DETERMINE PR STATE
      let state: "open" | "closed" | "merged" = "open";
      // DETERMINE PR STATE
      if (prData.merged) {
        // SET STATE TO MERGED
        state = "merged";
      } else if (prData.state === "closed") {
        // SET STATE TO CLOSED
        state = "closed";
      }
      // CREATE LINKED PULL REQUEST OBJECT
      const linkedPR: LinkedPullRequest = {
        number: prData.number,
        title: prData.title,
        url: prData.html_url,
        state,
        author: {
          username: prData.user?.login ?? undefined,
          avatarUrl: prData.user?.avatar_url ?? undefined,
        },
        repository: {
          owner,
          name: repo,
          fullName: `${owner}/${repo}`,
        },
        createdAt: new Date(prData.created_at),
        mergedAt: prData.merged_at ? new Date(prData.merged_at) : null,
        linkedAt: new Date(),
      };
      // CHECK IF PR ALREADY LINKED
      const pullRequests = task.linkedCode?.pullRequests as
        | Array<{ number: number }>
        | undefined;
      const existingPR = pullRequests?.find((pr) => pr.number === number);
      // IF PR ALREADY LINKED, RETURN ERROR
      if (existingPR) {
        // RETURN BAD REQUEST RESPONSE
        res.status(400).json({
          message: "Pull request is already linked to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // ADD PR TO TASK
      await Task.updateOne(
        { _id: task._id },
        { $push: { "linkedCode.pullRequests": linkedPR } }
      ).exec();
      // RETURN RESPONSE
      res.status(200).json({
        success: true,
        message: "Pull request linked to task successfully!",
        data: linkedPR,
      });
    } catch (err) {
      // HANDLE ERROR
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: `Failed to link pull request: ${errorMessage}`,
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * LINK FILE TO TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK FILE ==>
export const linkFileToTask = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET TASK ID FROM PARAMS
    const { taskId } = req.params;
    // GET REQUEST BODY
    const { owner, repo, path, branch = "main" } = req.body;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE REQUIRED FIELDS
    if (!owner || !repo || !path) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "Repository owner, name, and file path are required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND TASK
    const task = await Task.findById(taskId).exec();
    // IF TASK NOT FOUND, RETURN ERROR
    if (!task) {
      // RETURN NOT FOUND RESPONSE
      res.status(404).json({ message: "Task not found!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK IF USER HAS ACCESS
    if (task.workspaceId) {
      // FIND WORKSPACE MEMBERSHIP
      const membership = await WorkspaceMember.findOne({
        workspaceId: task.workspaceId,
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
      })
        .lean()
        .exec();
      // IF NOT A MEMBER, RETURN ERROR
      if (!membership) {
        // RETURN FORBIDDEN RESPONSE
        res.status(403).json({
          message: "You do not have access to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    } else if (task.userId.toString() !== userId) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You do not have access to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CREATE FILE URL
    const fileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;
    // CREATE LINKED FILE OBJECT
    const linkedFile: LinkedFile = {
      path,
      repository: {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
      },
      url: fileUrl,
      linkedAt: new Date(),
    };
    // CHECK IF FILE ALREADY LINKED
    const files = task.linkedCode?.files as
      | Array<{ path: string; repository?: { fullName?: string } }>
      | undefined;
    // FIND EXISTING FILE
    const existingFile = files?.find(
      (f) => f.path === path && f.repository?.fullName === `${owner}/${repo}`
    );
    // IF FILE ALREADY LINKED, RETURN ERROR
    if (existingFile) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "File is already linked to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // ADD FILE TO TASK
    await Task.updateOne(
      { _id: task._id },
      { $push: { "linkedCode.files": linkedFile } }
    ).exec();
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      message: "File linked to task successfully!",
      data: linkedFile,
    });
  }
);

/**
 * LINK BRANCH TO TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK BRANCH ==>
export const linkBranchToTask = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET TASK ID FROM PARAMS
    const { taskId } = req.params;
    // GET REQUEST BODY
    const { owner, repo, name } = req.body;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE REQUIRED FIELDS
    if (!owner || !repo || !name) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "Repository owner, name, and branch name are required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND TASK
    const task = await Task.findById(taskId).exec();
    // IF TASK NOT FOUND, RETURN ERROR
    if (!task) {
      // RETURN NOT FOUND RESPONSE
      res.status(404).json({ message: "Task not found!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK IF USER HAS ACCESS
    if (task.workspaceId) {
      // FIND WORKSPACE MEMBERSHIP
      const membership = await WorkspaceMember.findOne({
        workspaceId: task.workspaceId,
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
      })
        .lean()
        .exec();
      // IF NOT A MEMBER, RETURN ERROR
      if (!membership) {
        // RETURN FORBIDDEN RESPONSE
        res.status(403).json({
          message: "You do not have access to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    } else if (task.userId.toString() !== userId) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You do not have access to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CREATE BRANCH URL
    const branchUrl = `https://github.com/${owner}/${repo}/tree/${name}`;
    // CREATE LINKED BRANCH OBJECT
    const linkedBranch: LinkedBranch = {
      name,
      repository: {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
      },
      url: branchUrl,
      linkedAt: new Date(),
    };
    // CHECK IF BRANCH ALREADY LINKED
    const branches = task.linkedCode?.branches as
      | Array<{ name: string; repository?: { fullName?: string } }>
      | undefined;
    // FIND EXISTING BRANCH
    const existingBranch = branches?.find(
      (b) => b.name === name && b.repository?.fullName === `${owner}/${repo}`
    );
    // IF BRANCH ALREADY LINKED, RETURN ERROR
    if (existingBranch) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "Branch is already linked to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // ADD BRANCH TO TASK
    await Task.updateOne(
      { _id: task._id },
      { $push: { "linkedCode.branches": linkedBranch } }
    ).exec();
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      message: "Branch linked to task successfully!",
      data: linkedBranch,
    });
  }
);

/**
 * GET LINKED CODE FOR TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET LINKED CODE ==>
export const getLinkedCode = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET TASK ID FROM PARAMS
    const { taskId } = req.params;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND TASK
    const task = await Task.findById(taskId)
      .select("linkedCode taskKey workspaceId userId")
      .lean()
      .exec();
    // IF TASK NOT FOUND, RETURN ERROR
    if (!task) {
      // RETURN NOT FOUND RESPONSE
      res.status(404).json({ message: "Task not found!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // TYPE CAST TASK
    const taskDoc = task as unknown as {
      linkedCode?: {
        commits?: LinkedCommit[];
        pullRequests?: LinkedPullRequest[];
        files?: LinkedFile[];
        branches?: LinkedBranch[];
      };
      taskKey?: string;
      workspaceId?: mongoose.Types.ObjectId;
      userId: mongoose.Types.ObjectId;
    };
    // CHECK IF USER HAS ACCESS
    if (taskDoc.workspaceId) {
      // FIND WORKSPACE MEMBERSHIP
      const membership = await WorkspaceMember.findOne({
        workspaceId: taskDoc.workspaceId,
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
      })
        .lean()
        .exec();
      // IF NOT A MEMBER, RETURN ERROR
      if (!membership) {
        // RETURN FORBIDDEN RESPONSE
        res.status(403).json({
          message: "You do not have access to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    } else if (taskDoc.userId.toString() !== userId) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You do not have access to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      data: {
        taskKey: taskDoc.taskKey,
        linkedCode: taskDoc.linkedCode || {
          commits: [],
          pullRequests: [],
          files: [],
          branches: [],
        },
      },
    });
  }
);

/**
 * UNLINK CODE FROM TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNLINK CODE ==>
export const unlinkCode = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET TASK ID FROM PARAMS
    const { taskId, type, identifier } = req.params;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE PARAMS
    if (!type || !identifier) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message: "Type and identifier are required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE TYPE
    const validTypes = ["commits", "pullRequests", "files", "branches"];
    // IF TYPE IS NOT VALID, RETURN ERROR
    if (!validTypes.includes(type)) {
      // RETURN BAD REQUEST RESPONSE
      res.status(400).json({
        message:
          "Invalid code type. Must be commits, pullRequests, files, or branches.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND TASK
    const task = await Task.findById(taskId).exec();
    // IF TASK NOT FOUND, RETURN ERROR
    if (!task) {
      // RETURN NOT FOUND RESPONSE
      res.status(404).json({ message: "Task not found!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK IF USER HAS ACCESS
    if (task.workspaceId) {
      // FIND WORKSPACE MEMBERSHIP
      const membership = await WorkspaceMember.findOne({
        workspaceId: task.workspaceId,
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
      })
        .lean()
        .exec();
      // IF NOT A MEMBER, RETURN ERROR
      if (!membership) {
        // RETURN FORBIDDEN RESPONSE
        res.status(403).json({
          message: "You do not have access to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    } else if (task.userId.toString() !== userId) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You do not have access to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // BUILD PULL CONDITION
    let pullCondition: Record<string, unknown>;
    // BUILD PULL CONDITION
    switch (type) {
      // CASE FOR COMMITS
      case "commits":
        pullCondition = { "linkedCode.commits": { sha: identifier } };
        break;
      // CASE FOR PULL REQUESTS
      case "pullRequests":
        pullCondition = {
          "linkedCode.pullRequests": { number: parseInt(identifier, 10) },
        };
        break;
      // CASE FOR FILES
      case "files":
        pullCondition = { "linkedCode.files": { path: identifier } };
        break;
      // CASE FOR BRANCHES
      case "branches":
        pullCondition = { "linkedCode.branches": { name: identifier } };
        break;
      // DEFAULT CASE
      default:
        // RETURN BAD REQUEST RESPONSE
        res.status(400).json({ message: "Invalid type!", success: false });
        // RETURN FROM FUNCTION
        return;
    }
    // REMOVE CODE FROM TASK
    await Task.updateOne({ _id: task._id }, { $pull: pullCondition }).exec();
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      message: `${type.slice(0, -1)} unlinked from task successfully!`,
    });
  }
);

/**
 * ANALYZE TASK IMPACT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ANALYZE TASK IMPACT ==>
export const analyzeTaskImpact = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET TASK ID FROM PARAMS
    const { taskId } = req.params;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND TASK
    const task = await Task.findById(taskId)
      .populate("projectId", "title githubRepo")
      .lean()
      .exec();
    // IF TASK NOT FOUND, RETURN ERROR
    if (!task) {
      // RETURN NOT FOUND RESPONSE
      res.status(404).json({ message: "Task not found!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // TYPE CAST TASK
    const taskDoc = task as unknown as {
      title: string;
      description: string;
      taskKey?: string;
      linkedCode?: {
        commits?: LinkedCommit[];
        pullRequests?: LinkedPullRequest[];
        files?: LinkedFile[];
        branches?: LinkedBranch[];
      };
      workspaceId?: mongoose.Types.ObjectId;
      userId: mongoose.Types.ObjectId;
      projectId?: {
        title: string;
        githubRepo?: {
          owner?: string;
          name?: string;
          fullName?: string;
        };
      };
    };
    // CHECK IF USER HAS ACCESS
    if (taskDoc.workspaceId) {
      // FIND WORKSPACE MEMBERSHIP
      const membership = await WorkspaceMember.findOne({
        workspaceId: taskDoc.workspaceId,
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
      })
        .lean()
        .exec();
      // IF NOT A MEMBER, RETURN ERROR
      if (!membership) {
        // RETURN FORBIDDEN RESPONSE
        res.status(403).json({
          message: "You do not have access to this task!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
    } else if (taskDoc.userId.toString() !== userId) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You do not have access to this task!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET GEMINI MODEL
    const model = getGeminiModel();
    // IF GEMINI NOT CONFIGURED, RETURN ERROR
    if (!model) {
      // RETURN INTERNAL SERVER ERROR RESPONSE
      res.status(500).json({
        message: "AI service is not configured.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET OCTOKIT IF GITHUB REPO IS LINKED
    let repoStructure = "";
    // IF GITHUB REPO IS LINKED, GET REPO STRUCTURE
    if (
      taskDoc.projectId?.githubRepo?.owner &&
      taskDoc.projectId?.githubRepo?.name
    ) {
      // GET OCTOKIT INSTANCE
      const { octokit } = await getOctokitForUser(userId);
      // IF OCTOKIT INSTANCE IS VALID, GET REPO STRUCTURE
      if (octokit) {
        try {
          // GET REPO TREE
          const treeResponse = await octokit.git.getTree({
            owner: taskDoc.projectId.githubRepo.owner,
            repo: taskDoc.projectId.githubRepo.name,
            tree_sha: "HEAD",
            recursive: "1",
          });
          // FILTER TO RELEVANT FILES
          const relevantFiles = treeResponse.data.tree
            .filter((item) => item.type === "blob")
            .map((item) => item.path)
            .slice(0, 100);
          repoStructure = relevantFiles.join("\n");
        } catch {
          // IGNORE ERROR
        }
      }
    }
    // BUILD PROMPT
    const linkedFilesInfo =
      taskDoc.linkedCode?.files?.map((f) => f.path).join(", ") || "None";
    // GET LINKED COMMITS INFO
    const linkedCommitsInfo =
      taskDoc.linkedCode?.commits
        ?.slice(0, 5)
        .map((c) => c.message.split("\n")[0])
        .join("; ") || "None";
    // BUILD PROMPT
    const prompt = `Analyze the potential code impact of this task and provide insights:
    Task: ${taskDoc.title}
    Description: ${taskDoc.description || "No description"}
    Task Key: ${taskDoc.taskKey || "N/A"}
    Project: ${taskDoc.projectId?.title || "Unknown"}
    Already Linked Files: ${linkedFilesInfo}
    Recent Commits: ${linkedCommitsInfo}
    ${repoStructure ? `Repository Structure (partial):\n${repoStructure}` : ""}
    Please analyze and provide:
    1. **Risk Level** (low/medium/high): Based on the task complexity and potential impact
    2. **Estimated Files Affected**: List specific files that might need to be modified
    3. **Potential Dependencies**: Any modules or components that might be affected
    4. **Testing Recommendations**: Suggested test coverage for this change
    5. **Implementation Tips**: Brief suggestions for implementing this task
    Format your response as JSON with these exact keys: riskLevel, estimatedFiles (array), dependencies (array), testingRecommendations (array), implementationTips (array)`;
    // GENERATE ANALYSIS
    try {
      // GENERATE ANALYSIS
      const result = await model.generateContent(prompt);
      // GET RESPONSE TEXT
      const responseText = result.response.text();
      // PARSE JSON FROM RESPONSE
      const jsonMatch = responseText.match(/\{[\sS]*\}/);
      // IF JSON MATCH IS FOUND, PARSE JSON
      let analysis;
      // IF JSON MATCH IS FOUND, PARSE JSON
      if (jsonMatch) {
        try {
          // PARSE JSON
          analysis = JSON.parse(jsonMatch[0]);
        } catch {
          // IF JSON IS NOT VALID, RETURN DEFAULT
          analysis = {
            riskLevel: "medium",
            estimatedFiles: [],
            dependencies: [],
            testingRecommendations: ["Manual testing recommended"],
            implementationTips: [responseText],
          };
        }
      } else {
        // IF JSON MATCH IS NOT FOUND, RETURN DEFAULT
        analysis = {
          riskLevel: "medium",
          estimatedFiles: [],
          dependencies: [],
          testingRecommendations: ["Manual testing recommended"],
          implementationTips: [responseText],
        };
      }
      // RETURN RESPONSE
      res.status(200).json({
        success: true,
        data: {
          taskKey: taskDoc.taskKey,
          analysis,
        },
      });
    } catch (err) {
      // GET ERROR MESSAGE
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // RETURN INTERNAL SERVER ERROR RESPONSE
      res.status(500).json({
        message: `Failed to analyze task impact: ${errorMessage}`,
        success: false,
      });
    }
  }
);

/**
 * GET WORKSPACE TASKS WITH LINKED CODE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKSPACE TASKS WITH LINKED CODE ==>
export const getWorkspaceTasksWithLinkedCode = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET HAS CODE FROM QUERY
    const { hasCode, page = "1", limit = "20" } = req.query;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN UNAUTHORIZED RESPONSE
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // GET WORKSPACE AND VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN FORBIDDEN RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // BUILD QUERY
    const query: Record<string, unknown> = {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      isTrashed: false,
    };
    // FILTER BY HAS CODE
    if (hasCode === "true") {
      // FILTER BY HAS CODE
      query.$or = [
        { "linkedCode.commits.0": { $exists: true } },
        { "linkedCode.pullRequests.0": { $exists: true } },
        { "linkedCode.files.0": { $exists: true } },
        { "linkedCode.branches.0": { $exists: true } },
      ];
    }
    // GET PAGE NUMBER
    const pageNum = parseInt(page as string, 10);
    // GET LIMIT NUMBER
    const limitNum = parseInt(limit as string, 10);
    // GET SKIP NUMBER
    const skip = (pageNum - 1) * limitNum;
    // GET TASKS AND TOTAL COUNT
    const [tasks, total] = await Promise.all([
      Task.find(query)
        .select("title taskKey status priority linkedCode assigneeId createdAt")
        .populate("assigneeId", "name profilePic")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec() as Promise<Array<Record<string, unknown>>>,
      Task.countDocuments(query).exec(),
    ]);
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      data: {
        tasks,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  }
);

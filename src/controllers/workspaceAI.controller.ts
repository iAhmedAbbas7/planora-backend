// <== IMPORTS ==>
import mongoose from "mongoose";
import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";
import { Task } from "../models/task.model.js";
import { User } from "../models/user.model.js";
import { Project } from "../models/project.model.js";
import { decryptSecret } from "../utils/encryption.js";
import expressAsyncHandler from "express-async-handler";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import { Workspace, ILinkedRepository } from "../models/workspace.model.js";

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

// <== GET GEMINI CLIENT ==>
const getGeminiClient = (): GoogleGenerativeAI | null => {
  // CHECK IF GEMINI API KEY IS SET
  if (!process.env.GEMINI_API_KEY) {
    // RETURNING NULL
    return null;
  }
  // CREATE AND RETURN GEMINI CLIENT
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

// <== GET GEMINI MODEL ==>
const getGeminiModel = () => {
  // GET GEMINI CLIENT
  const genAI = getGeminiClient();
  // IF NOT CONFIGURED, RETURN NULL
  if (!genAI) return null;
  // RETURN GEMINI 2.0 FLASH MODEL (FREE TIER)
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
    // RETURNING ERROR RESPONSE
    return {
      octokit: null,
      error: { status: 404, message: "User not found!" },
    };
  }
  // CAST USER TO GITHUB USER DATA TYPE
  const githubUser = user as unknown as GitHubUserData;
  // CHECK IF GITHUB IS CONNECTED
  if (!githubUser.githubAccessToken || !githubUser.githubUsername) {
    // RETURNING ERROR RESPONSE
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
    // DECRYPTING ACCESS TOKEN
    decryptedToken = decryptSecret(githubUser.githubAccessToken);
  } catch (error) {
    // RETURNING ERROR RESPONSE
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
  // RETURNING SUCCESS RESPONSE
  return { octokit, error: null };
};

// <== STANDUP ITEM TYPE ==>
interface StandupItem {
  // <== TYPE ==>
  type: "commit" | "pr" | "issue" | "review";
  // <== TITLE ==>
  title: string;
  // <== DESCRIPTION ==>
  description: string;
  // <== REPOSITORY ==>
  repository: string;
  // <== URL ==>
  url: string;
  // <== TIMESTAMP ==>
  timestamp: string;
}

// <== STANDUP SUMMARY TYPE ==>
interface StandupSummary {
  // <== SUMMARY TEXT ==>
  summary: string;
  // <== YESTERDAY'S WORK ==>
  yesterday: string[];
  // <== TODAY'S PLAN ==>
  today: string[];
  // <== BLOCKERS ==>
  blockers: string[];
  // <== ACTIVITY ITEMS ==>
  activityItems: StandupItem[];
  // <== STATS ==>
  stats: {
    commits: number;
    prsOpened: number;
    prsMerged: number;
    issuesClosed: number;
    reviewsCompleted: number;
  };
}

// <== GENERATED TASK TYPE ==>
interface GeneratedTask {
  // <== TITLE ==>
  title: string;
  // <== DESCRIPTION ==>
  description: string;
  // <== PRIORITY ==>
  priority: "low" | "medium" | "high";
  // <== STATUS ==>
  status: "to do" | "in progress" | "completed";
  // <== DUE DATE ==>
  dueDate?: string;
  // <== ESTIMATED HOURS ==>
  estimatedHours?: number;
}

// <== SPRINT PREDICTION TYPE ==>
interface SprintPrediction {
  // <== PREDICTED COMPLETION DATE ==>
  predictedCompletionDate: string;
  // <== CONFIDENCE ==>
  confidence: "high" | "medium" | "low";
  // <== VELOCITY ==>
  velocity: {
    // <== TASKS PER DAY ==>
    tasksPerDay: number;
    // <== POINTS PER DAY ==>
    pointsPerDay: number;
  };
  // <== REMAINING WORK ==>
  remainingWork: {
    // <== TOTAL TASKS ==>
    totalTasks: number;
    // <== TODO TASKS ==>
    todoTasks: number;
    // <== IN PROGRESS TASKS ==>
    inProgressTasks: number;
  };
  // <== RISK FACTORS ==>
  riskFactors: string[];
  // <== RECOMMENDATIONS ==>
  recommendations: string[];
  // <== ESTIMATED DAYS ==>
  estimatedDays: number;
}

// <== CODE REVIEW INSIGHTS TYPE ==>
interface CodeReviewInsights {
  // <== OVERALL HEALTH ==>
  overallHealth: "excellent" | "good" | "needs_improvement" | "critical";
  // <== AVERAGE PR SIZE ==>
  averagePRSize: {
    // <== ADDITIONS ==>
    additions: number;
    // <== DELETIONS ==>
    deletions: number;
    // <== RATING ==>
    rating: "small" | "medium" | "large" | "too_large";
  };
  // <== AVERAGE REVIEW TIME ==>
  averageReviewTime: {
    // <== HOURS ==>
    hours: number;
    // <== RATING ==>
    rating: "fast" | "acceptable" | "slow" | "too_slow";
  };
  // <== MERGE RATE ==>
  mergeRate: number;
  // <== BOTTLENECKS ==>
  bottlenecks: {
    // <== TYPE ==>
    type: "reviewer" | "author" | "process";
    // <== DESCRIPTION ==>
    description: string;
    // <== SUGGESTION ==>
    suggestion: string;
  }[];
  // <== SUGGESTIONS ==>
  suggestions: string[];
  // <== PR STATS ==>
  prStats: {
    // <== TOTAL ==>
    total: number;
    // <== OPEN ==>
    open: number;
    // <== MERGED ==>
    merged: number;
    // <== CLOSED ==>
    closed: number;
  };
}

/**
 * GENERATE STANDUP SUMMARY FOR WORKSPACE MEMBER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GENERATE STANDUP ==>
export const generateStandup = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET TARGET USER ID FROM QUERY (OPTIONAL - DEFAULT TO SELF)
    const targetUserId = (req.query.targetUserId as string) || userId;
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
    // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Valid Workspace ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF USER IS A MEMBER OF THE WORKSPACE
    const userMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER, RETURN 403 ERROR
    if (!userMembership) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET OCTOKIT INSTANCE FOR TARGET USER
    const { octokit, error } = await getOctokitForUser(targetUserId as string);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      // RETURNING ERROR RESPONSE
      res.status(error?.status || 500).json({
        message: error?.message || "Failed to get GitHub client",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET WORKSPACE WITH LINKED REPOSITORIES
    const workspace = (await Workspace.findById(workspaceId)
      .select("linkedRepositories")
      .lean()
      .exec()) as { linkedRepositories?: ILinkedRepository[] } | null;
    // IF WORKSPACE NOT FOUND OR NO REPOS, RETURN EMPTY
    if (
      !workspace ||
      !workspace.linkedRepositories ||
      workspace.linkedRepositories.length === 0
    ) {
      // RETURNING SUCCESS RESPONSE WITH EMPTY DATA
      res.status(200).json({
        success: true,
        data: {
          summary: "No repositories linked to this workspace yet.",
          yesterday: [],
          today: [],
          blockers: [],
          activityItems: [],
          stats: {
            commits: 0,
            prsOpened: 0,
            prsMerged: 0,
            issuesClosed: 0,
            reviewsCompleted: 0,
          },
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET TARGET USER'S GITHUB USERNAME
    const targetUser = await User.findById(targetUserId)
      .select("githubUsername fullname")
      .lean()
      .exec();
    // IF TARGET USER NOT FOUND, RETURN 404 ERROR
    if (!targetUser) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Target user not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET GITHUB USERNAME
    const githubUsername = (targetUser as unknown as GitHubUserData)
      .githubUsername;
    // IF GITHUB USERNAME NOT FOUND, RETURN ERROR
    if (!githubUsername) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Target user has not connected GitHub!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CALCULATE DATE RANGE (LAST 24 HOURS)
    const since = new Date();
    since.setHours(since.getHours() - 24);
    // COLLECT ACTIVITY ITEMS
    const activityItems: StandupItem[] = [];
    // STATS COUNTERS
    let commits = 0;
    // PRS OPENED COUNTER
    let prsOpened = 0;
    // PRS MERGED COUNTER
    let prsMerged = 0;
    // ISSUES CLOSED COUNTER
    let issuesClosed = 0;
    // REVIEWS COMPLETED COUNTER
    let reviewsCompleted = 0;
    // ITERATE THROUGH LINKED REPOSITORIES
    for (const repo of workspace.linkedRepositories) {
      // TRY TO GET COMMITS BY USER
      try {
        // GET COMMITS FOR REPOSITORY
        const { data: repoCommits } = await octokit.repos.listCommits({
          owner: repo.owner,
          repo: repo.name,
          author: githubUsername,
          since: since.toISOString(),
          per_page: 20,
        });
        // ADD COMMITS TO ACTIVITY ITEMS
        for (const commit of repoCommits) {
          // INCREMENT COMMITS COUNTER
          commits++;
          // ADD COMMIT TO ACTIVITY ITEMS
          activityItems.push({
            type: "commit",
            title: commit.commit.message.split("\n")[0] || "No message",
            description: commit.commit.message,
            repository: repo.fullName,
            url: commit.html_url,
            timestamp: commit.commit.author?.date || new Date().toISOString(),
          });
        }
      } catch {
        // IGNORE ERRORS FOR INDIVIDUAL REPOS
      }
      // TRY TO GET PULL REQUESTS BY USER
      try {
        // GET PULL REQUESTS FOR REPOSITORY
        const { data: pullRequests } = await octokit.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state: "all",
          per_page: 20,
        });
        // FILTER PRS BY USER AND DATE
        const userPRs = pullRequests.filter(
          (pr) =>
            pr.user?.login === githubUsername &&
            new Date(pr.created_at) >= since
        );
        // ADD PRS TO ACTIVITY ITEMS
        for (const pr of userPRs) {
          // INCREMENT PRS COUNTER
          if (pr.merged_at) {
            // INCREMENT PRS MERGED COUNTER
            prsMerged++;
            // IF PR IS OPEN, INCREMENT PRS OPENED COUNTER
          } else if (pr.state === "open") {
            // INCREMENT PRS OPENED COUNTER
            prsOpened++;
          }
          // ADD PR TO ACTIVITY ITEMS
          activityItems.push({
            type: "pr",
            title: pr.title,
            description: pr.body || "No description",
            repository: repo.fullName,
            url: pr.html_url,
            timestamp: pr.created_at,
          });
        }
      } catch {
        // IGNORE ERRORS FOR INDIVIDUAL REPOS
      }
      // TRY TO GET ISSUES CLOSED BY USER
      try {
        // GET ISSUES FOR REPOSITORY
        const { data: issues } = await octokit.issues.listForRepo({
          owner: repo.owner,
          repo: repo.name,
          state: "closed",
          assignee: githubUsername,
          since: since.toISOString(),
          per_page: 20,
        });
        // FILTER OUT PULL REQUESTS (ISSUES API INCLUDES PRs)
        const userIssues = issues.filter((issue) => !issue.pull_request);
        // ADD ISSUES TO ACTIVITY ITEMS
        for (const issue of userIssues) {
          // INCREMENT ISSUES COUNTER
          issuesClosed++;
          // ADD ISSUE TO ACTIVITY ITEMS
          activityItems.push({
            type: "issue",
            title: issue.title,
            description: issue.body || "No description",
            repository: repo.fullName,
            url: issue.html_url,
            timestamp: issue.closed_at || issue.updated_at,
          });
        }
      } catch {
        // IGNORE ERRORS FOR INDIVIDUAL REPOS
      }
      // TRY TO GET REVIEWS BY USER
      try {
        // GET PULL REQUESTS FOR REPOSITORY
        const { data: pullRequests } = await octokit.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state: "all",
          per_page: 10,
        });
        // CHECK REVIEWS FOR EACH PR
        for (const pr of pullRequests.slice(0, 5)) {
          // TRY TO GET REVIEWS FOR PR
          try {
            // GET REVIEWS FOR PR
            const { data: reviews } = await octokit.pulls.listReviews({
              owner: repo.owner,
              repo: repo.name,
              pull_number: pr.number,
            });
            // FILTER REVIEWS BY USER AND DATE
            const userReviews = reviews.filter(
              (review) =>
                review.user?.login === githubUsername &&
                review.submitted_at &&
                new Date(review.submitted_at) >= since
            );
            // ADD REVIEWS TO ACTIVITY ITEMS
            for (const review of userReviews) {
              // INCREMENT REVIEWS COUNTER
              reviewsCompleted++;
              // ADD REVIEW TO ACTIVITY ITEMS
              activityItems.push({
                type: "review",
                title: `Review on: ${pr.title}`,
                description: review.body || `${review.state} review`,
                repository: repo.fullName,
                url: review.html_url,
                timestamp: review.submitted_at || new Date().toISOString(),
              });
            }
          } catch {
            // IGNORE ERRORS FOR INDIVIDUAL REVIEWS
          }
        }
      } catch {
        // IGNORE ERRORS FOR INDIVIDUAL REPOS
      }
    }
    // CHECK IF GEMINI IS CONFIGURED
    const model = getGeminiModel();
    // DEFAULT SUMMARY IF AI NOT AVAILABLE
    let standupSummary: StandupSummary = {
      summary: `Activity summary for the last 24 hours: ${commits} commits, ${prsOpened} PRs opened, ${prsMerged} PRs merged, ${issuesClosed} issues closed, ${reviewsCompleted} reviews completed.`,
      yesterday: activityItems
        .slice(0, 5)
        .map((item) => `${item.type}: ${item.title}`),
      today: ["Continue work on pending tasks", "Review open pull requests"],
      blockers: [],
      activityItems: activityItems.slice(0, 20),
      stats: {
        commits,
        prsOpened,
        prsMerged,
        issuesClosed,
        reviewsCompleted,
      },
    };
    // IF MODEL AVAILABLE, GENERATE AI SUMMARY
    if (model && activityItems.length > 0) {
      // TRY TO GENERATE AI SUMMARY
      try {
        // BUILD PROMPT FOR GEMINI
        const prompt = `You are a standup meeting assistant. Based on the following GitHub activity from the last 24 hours, generate a concise standup summary.
        Activity:
        ${activityItems
          .slice(0, 15)
          .map(
            (item) =>
              `- [${item.type.toUpperCase()}] ${item.title} in ${
                item.repository
              }`
          )
          .join("\n")}
          Stats:
          - Commits: ${commits}
          - PRs Opened: ${prsOpened}
          - PRs Merged: ${prsMerged}
          - Issues Closed: ${issuesClosed}
          - Reviews Completed: ${reviewsCompleted}

          Generate a JSON response with this exact structure (no markdown, just JSON):
          {
            "summary": "A brief 2-3 sentence summary of what the developer accomplished",
            "yesterday": ["List of 3-5 key accomplishments from yesterday"],
            "today": ["List of 3-5 suggested tasks for today based on the activity patterns"],
            "blockers": ["Any potential blockers or areas needing attention, or empty array if none"]
          }`;
        // GENERATE CONTENT
        const result = await model.generateContent(prompt);
        // GET RESPONSE TEXT
        const responseText = result.response.text();
        // TRY TO PARSE JSON FROM RESPONSE
        try {
          // FIND JSON IN RESPONSE
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          // IF JSON FOUND, PARSE IT
          if (jsonMatch) {
            // PARSE JSON
            const aiResponse = JSON.parse(jsonMatch[0]);
            // UPDATE STANDUP SUMMARY
            standupSummary = {
              ...standupSummary,
              summary: aiResponse.summary || standupSummary.summary,
              yesterday: aiResponse.yesterday || standupSummary.yesterday,
              today: aiResponse.today || standupSummary.today,
              blockers: aiResponse.blockers || standupSummary.blockers,
            };
          }
        } catch {
          // IGNORE JSON PARSE ERRORS
        }
      } catch {
        // IGNORE AI GENERATION ERRORS
      }
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      data: standupSummary,
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * CONVERT NATURAL LANGUAGE TO TASKS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== NATURAL LANGUAGE TO TASKS ==>
export const naturalLanguageToTasks = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET INPUT TEXT FROM BODY
    const { input, projectId } = req.body;
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
    // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Valid Workspace ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // IF INPUT NOT PROVIDED, RETURN 400 ERROR
    if (!input || typeof input !== "string" || input.trim().length === 0) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Input text is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF USER IS A MEMBER OF THE WORKSPACE
    const userMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER, RETURN 403 ERROR
    if (!userMembership) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET PROJECT CONTEXT IF PROVIDED
    let projectContext = "";
    // IF PROJECT ID PROVIDED, ADD PROJECT CONTEXT
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      // GET PROJECT DETAILS
      const project = await Project.findById(projectId)
        .select("title description")
        .lean()
        .exec();
      // IF PROJECT FOUND, ADD CONTEXT
      if (project) {
        // GET PROJECT DETAILS
        const proj = project as { title?: string; description?: string };
        // ADD PROJECT CONTEXT
        projectContext = `\n\nProject Context:\nTitle: ${
          proj.title || "Untitled"
        }\nDescription: ${proj.description || "No description"}`;
      }
    }
    // CHECK IF GEMINI IS CONFIGURED
    const model = getGeminiModel();
    // IF MODEL NOT AVAILABLE, RETURN ERROR
    if (!model) {
      // RETURNING ERROR RESPONSE
      res.status(503).json({
        message: "AI service is not configured. Please contact administrator.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // TRY TO GENERATE TASKS
    try {
      // BUILD PROMPT FOR GEMINI
      const prompt = `You are a task management assistant. Convert the following natural language input into structured tasks.${projectContext}
      User Input: "${input}"
      Project Context: ${projectContext}
      Generate a JSON array of tasks with this exact structure (no markdown, just JSON array):
      [
        {
          "title": "Task title (max 200 chars)",
          "description": "Task description (max 2000 chars)",
          "priority": "low" | "medium" | "high",
          "status": "to do",
          "estimatedHours": number (optional, estimated hours to complete)
        }
      ]
      Rules:
      1. Create 1-10 tasks based on the input complexity
      2. Each task should be actionable and specific
      3. Use appropriate priorities based on urgency keywords
      4. Status should always be "to do"
      5. If the input mentions deadlines, include estimatedHours
      6. Split large tasks into smaller, manageable sub-tasks`;
      // GENERATE CONTENT
      const result = await model.generateContent(prompt);
      // GET RESPONSE TEXT
      const responseText = result.response.text();
      // TRY TO PARSE JSON FROM RESPONSE
      let tasks: GeneratedTask[] = [];
      // TRY TO PARSE JSON FROM RESPONSE
      try {
        // FIND JSON ARRAY IN RESPONSE
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        // IF JSON FOUND, PARSE IT
        if (jsonMatch) {
          // PARSE JSON
          const parsedTasks = JSON.parse(jsonMatch[0]);
          // VALIDATE AND MAP TASKS
          tasks = parsedTasks
            .filter(
              (task: { title?: string }) =>
                task.title &&
                typeof task.title === "string" &&
                task.title.trim()
            )
            .map(
              (task: {
                title: string;
                description?: string;
                priority?: string;
                estimatedHours?: number;
              }) => ({
                title: task.title.trim().substring(0, 200),
                description: (task.description || "").trim().substring(0, 2000),
                priority: ["low", "medium", "high"].includes(
                  task.priority?.toLowerCase() || ""
                )
                  ? task.priority?.toLowerCase()
                  : "medium",
                status: "to do" as const,
                estimatedHours:
                  typeof task.estimatedHours === "number"
                    ? task.estimatedHours
                    : undefined,
              })
            );
        }
      } catch {
        // IGNORE JSON PARSE ERRORS
      }
      // IF NO TASKS GENERATED, RETURN ERROR
      if (tasks.length === 0) {
        // RETURNING ERROR RESPONSE
        res.status(400).json({
          message: "Could not generate tasks from the provided input.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        success: true,
        data: {
          tasks,
          originalInput: input,
          taskCount: tasks.length,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    } catch (error) {
      // RETURNING ERROR RESPONSE
      res.status(500).json({
        message: "Failed to generate tasks. Please try again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * PREDICT SPRINT COMPLETION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== PREDICT SPRINT ==>
export const predictSprint = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET PROJECT ID FROM QUERY (OPTIONAL)
    const projectId = req.query.projectId as string;
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
    // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Valid Workspace ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF USER IS A MEMBER OF THE WORKSPACE
    const userMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER, RETURN 403 ERROR
    if (!userMembership) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // BUILD TASK QUERY
    const taskQuery: {
      userId: string;
      isTrashed: boolean;
      projectId?: mongoose.Types.ObjectId;
    } = {
      userId,
      isTrashed: false,
    };
    // IF PROJECT ID PROVIDED, ADD TO QUERY
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      // ADD PROJECT ID TO QUERY
      taskQuery.projectId = new mongoose.Types.ObjectId(projectId);
    }
    // GET TASKS FOR VELOCITY CALCULATION
    const tasks = (await Task.find(taskQuery)
      .select("status completedAt createdAt priority")
      .lean()
      .exec()) as Array<{
      status: string;
      completedAt?: Date;
      createdAt?: Date;
      priority?: string;
    }>;
    // COUNT TASKS BY STATUS
    const todoTasks = tasks.filter((t) => t.status === "to do").length;
    // COUNT IN PROGRESS TASKS
    const inProgressTasks = tasks.filter(
      (t) => t.status === "in progress"
    ).length;
    // COUNT COMPLETED TASKS
    const completedTasks = tasks.filter((t) => t.status === "completed");
    // CALCULATE VELOCITY (TASKS COMPLETED IN LAST 14 DAYS)
    const twoWeeksAgo = new Date();
    // SET DATE TO 14 DAYS AGO
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    // FILTER COMPLETED TASKS IN LAST 14 DAYS
    const recentCompletedTasks = completedTasks.filter(
      (t) => t.completedAt && new Date(t.completedAt) >= twoWeeksAgo
    );
    // CALCULATE VELOCITY
    const tasksPerDay =
      recentCompletedTasks.length > 0 ? recentCompletedTasks.length / 14 : 0.5;
    // CALCULATE REMAINING WORK
    const remainingTasks = todoTasks + inProgressTasks;
    // CALCULATE ESTIMATED DAYS
    const estimatedDays =
      tasksPerDay > 0 ? Math.ceil(remainingTasks / tasksPerDay) : 30;
    // CALCULATE PREDICTED COMPLETION DATE
    const predictedDate = new Date();
    // SET DATE TO ESTIMATED DAYS FROM TODAY
    predictedDate.setDate(predictedDate.getDate() + estimatedDays);
    // CALCULATE CONFIDENCE BASED ON DATA AVAILABILITY
    let confidence: "high" | "medium" | "low" = "low";
    // IF RECENT COMPLETED TASKS ARE 10 OR MORE, SET CONFIDENCE TO HIGH
    if (recentCompletedTasks.length >= 10) {
      // SET CONFIDENCE TO HIGH
      confidence = "high";
    } else if (recentCompletedTasks.length >= 5) {
      // SET CONFIDENCE TO MEDIUM
      confidence = "medium";
    }
    // IDENTIFY RISK FACTORS
    const riskFactors: string[] = [];
    // IF IN PROGRESS TASKS ARE MORE THAN 50% OF TODO TASKS, ADD RISK FACTOR
    if (inProgressTasks > todoTasks * 0.5) {
      // ADD RISK FACTOR
      riskFactors.push(
        "High number of tasks in progress may indicate blockers"
      );
    }
    // IF TASKS PER DAY ARE LESS THAN 0.5, ADD RISK FACTOR
    if (tasksPerDay < 0.5) {
      // ADD RISK FACTOR
      riskFactors.push("Low velocity detected - consider breaking down tasks");
    }
    // IF REMAINING TASKS ARE MORE THAN 20, ADD RISK FACTOR
    if (remainingTasks > 20) {
      // ADD RISK FACTOR
      riskFactors.push("Large backlog may affect timeline accuracy");
    }
    // GENERATE RECOMMENDATIONS
    const recommendations: string[] = [];
    // IF IN PROGRESS TASKS ARE MORE THAN 5, ADD RECOMMENDATION
    if (inProgressTasks > 5) {
      // ADD RECOMMENDATION
      recommendations.push(
        "Focus on completing in-progress tasks before starting new ones"
      );
    }
    // IF TASKS PER DAY ARE LESS THAN 1, ADD RECOMMENDATION
    if (tasksPerDay < 1) {
      // ADD RECOMMENDATION
      recommendations.push("Consider pair programming or task decomposition");
    }
    // IF REMAINING TASKS ARE MORE THAN 15, ADD RECOMMENDATION
    if (remainingTasks > 15) {
      // ADD RECOMMENDATION
      recommendations.push(
        "Prioritize high-priority tasks to ensure critical work is completed"
      );
    }
    // IF RECENT COMPLETED TASKS ARE LESS THAN 5, ADD RECOMMENDATION
    if (recentCompletedTasks.length < 5) {
      // ADD RECOMMENDATION
      recommendations.push(
        "Track more task completions to improve prediction accuracy"
      );
    }
    // BUILD PREDICTION RESPONSE
    const prediction: SprintPrediction = {
      predictedCompletionDate: predictedDate.toISOString(),
      confidence,
      velocity: {
        tasksPerDay: Math.round(tasksPerDay * 100) / 100,
        pointsPerDay: Math.round(tasksPerDay * 3 * 100) / 100,
      },
      remainingWork: {
        totalTasks: remainingTasks,
        todoTasks,
        inProgressTasks,
      },
      riskFactors,
      recommendations,
      estimatedDays,
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      data: prediction,
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * GET CODE REVIEW INSIGHTS FOR WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET CODE REVIEW INSIGHTS ==>
export const getCodeReviewInsights = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
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
    // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Valid Workspace ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF USER IS A MEMBER OF THE WORKSPACE
    const userMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER, RETURN 403 ERROR
    if (!userMembership) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
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
        message: error?.message || "Failed to get GitHub client",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET WORKSPACE WITH LINKED REPOSITORIES
    const workspace = (await Workspace.findById(workspaceId)
      .select("linkedRepositories")
      .lean()
      .exec()) as { linkedRepositories?: ILinkedRepository[] } | null;
    // IF WORKSPACE NOT FOUND OR NO REPOS, RETURN EMPTY
    if (
      !workspace ||
      !workspace.linkedRepositories ||
      workspace.linkedRepositories.length === 0
    ) {
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        success: true,
        data: {
          overallHealth: "needs_improvement" as const,
          averagePRSize: {
            additions: 0,
            deletions: 0,
            rating: "small" as const,
          },
          averageReviewTime: { hours: 0, rating: "fast" as const },
          mergeRate: 0,
          bottlenecks: [],
          suggestions: [
            "Link repositories to this workspace to get code review insights.",
          ],
          prStats: { total: 0, open: 0, merged: 0, closed: 0 },
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // TOTAL ADDITIONS
    let totalAdditions = 0;
    // TOTAL DELETIONS
    let totalDeletions = 0;
    // TOTAL REVIEW TIME HOURS
    let totalReviewTimeHours = 0;
    // REVIEW TIME COUNT
    let reviewTimeCount = 0;
    // TOTAL PRS
    let totalPRs = 0;
    // OPEN PRS
    let openPRs = 0;
    // MERGED PRS
    let mergedPRs = 0;
    // CLOSED PRS
    let closedPRs = 0;
    // ITERATE THROUGH LINKED REPOSITORIES
    for (const repo of workspace.linkedRepositories) {
      // TRY TO GET PULL REQUESTS FOR REPOSITORY
      try {
        // GET PULL REQUESTS FOR REPOSITORY
        const { data: pullRequests } = await octokit.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state: "all",
          per_page: 30,
        });
        // PROCESS EACH PR
        for (const pr of pullRequests) {
          // INCREMENT TOTAL PRS
          totalPRs++;
          // COUNT BY STATE
          if (pr.state === "open") {
            openPRs++;
          } else if (pr.merged_at) {
            mergedPRs++;
            // CALCULATE REVIEW TIME (IN HOURS)
            const createdAt = new Date(pr.created_at);
            // MERGED AT
            const mergedAt = new Date(pr.merged_at);
            // REVIEW TIME HOURS
            const reviewTimeHours =
              (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            // ADD TO TOTAL REVIEW TIME HOURS
            totalReviewTimeHours += reviewTimeHours;
            // INCREMENT REVIEW TIME COUNT
            reviewTimeCount++;
          } else {
            // INCREMENT CLOSED PRS
            closedPRs++;
          }
          // ADD SIZE METRICS (CAST TO ANY TO ACCESS ADDITIONS/DELETIONS) (ADDITIONS)
          totalAdditions += (pr as any).additions || 0;
          // ADD SIZE METRICS (CAST TO ANY TO ACCESS ADDITIONS/DELETIONS) (DELETIONS)
          totalDeletions += (pr as any).deletions || 0;
        }
      } catch {
        // IGNORE ERRORS FOR INDIVIDUAL REPOS
      }
    }
    // CALCULATE AVERAGES
    const avgAdditions =
      totalPRs > 0 ? Math.round(totalAdditions / totalPRs) : 0;
    // AVERAGE DELETIONS
    const avgDeletions =
      totalPRs > 0 ? Math.round(totalDeletions / totalPRs) : 0;
    // AVERAGE REVIEW TIME
    const avgReviewTime =
      reviewTimeCount > 0
        ? Math.round((totalReviewTimeHours / reviewTimeCount) * 10) / 10
        : 0;
    // MERGE RATE
    const mergeRate =
      totalPRs > 0 ? Math.round((mergedPRs / totalPRs) * 100) : 0;
    // RATE PR SIZE
    const totalChanges = avgAdditions + avgDeletions;
    // SIZE RATING
    let sizeRating: "small" | "medium" | "large" | "too_large" = "small";
    // IF TOTAL CHANGES ARE MORE THAN 1000, SET SIZE RATING TO TOO LARGE
    if (totalChanges > 1000) {
      // SET SIZE RATING TO TOO LARGE
      sizeRating = "too_large";
    } else if (totalChanges > 500) {
      // SET SIZE RATING TO LARGE
      sizeRating = "large";
    } else if (totalChanges > 200) {
      // SET SIZE RATING TO MEDIUM
      sizeRating = "medium";
    }
    // RATE REVIEW TIME
    let reviewTimeRating: "fast" | "acceptable" | "slow" | "too_slow" = "fast";
    // IF AVERAGE REVIEW TIME IS MORE THAN 168 HOURS, SET REVIEW TIME RATING TO TOO SLOW
    if (avgReviewTime > 168) {
      // SET REVIEW TIME RATING TO TOO SLOW
      reviewTimeRating = "too_slow";
    } else if (avgReviewTime > 72) {
      // SET REVIEW TIME RATING TO SLOW
      reviewTimeRating = "slow";
    } else if (avgReviewTime > 24) {
      // SET REVIEW TIME RATING TO ACCEPTABLE
      reviewTimeRating = "acceptable";
    }
    // CALCULATE OVERALL HEALTH
    let overallHealth: "excellent" | "good" | "needs_improvement" | "critical" =
      "good";
    // IF SIZE RATING IS TOO LARGE OR REVIEW TIME RATING IS TOO SLOW
    if (
      sizeRating === "too_large" ||
      reviewTimeRating === "too_slow" ||
      mergeRate < 50
    ) {
      // SET OVERALL HEALTH TO CRITICAL
      overallHealth = "critical";
    } else if (
      sizeRating === "large" ||
      reviewTimeRating === "slow" ||
      mergeRate < 70
    ) {
      // SET OVERALL HEALTH TO NEEDS IMPROVEMENT
      overallHealth = "needs_improvement";
    } else if (
      sizeRating === "small" &&
      reviewTimeRating === "fast" &&
      mergeRate > 85
    ) {
      // SET OVERALL HEALTH TO EXCELLENT
      overallHealth = "excellent";
    }
    // IDENTIFY BOTTLENECKS
    const bottlenecks: {
      type: "reviewer" | "author" | "process";
      description: string;
      suggestion: string;
    }[] = [];
    // IF SIZE RATING IS TOO LARGE OR SIZE RATING IS LARGE, ADD BOTTLENECK
    if (sizeRating === "too_large" || sizeRating === "large") {
      // ADD BOTTLENECK
      bottlenecks.push({
        type: "author",
        description: "Pull requests are too large on average",
        suggestion:
          "Break down large changes into smaller, focused PRs (under 400 lines)",
      });
    }
    // IF REVIEW TIME RATING IS TOO SLOW OR REVIEW TIME RATING IS SLOW, ADD BOTTLENECK
    if (reviewTimeRating === "too_slow" || reviewTimeRating === "slow") {
      // ADD BOTTLENECK
      bottlenecks.push({
        type: "reviewer",
        description: "Code reviews are taking too long",
        suggestion:
          "Set up review reminders and consider adding more reviewers",
      });
    }
    // IF MERGE RATE IS LESS THAN 70, ADD BOTTLENECK
    if (mergeRate < 70) {
      // ADD BOTTLENECK
      bottlenecks.push({
        type: "process",
        description: "Low merge rate indicates frequent PR abandonment",
        suggestion:
          "Review PR creation guidelines and improve collaboration before creating PRs",
      });
    }
    // GENERATE SUGGESTIONS
    const suggestions: string[] = [];
    // IF SIZE RATING IS NOT SMALL, ADD SUGGESTION
    if (sizeRating !== "small") {
      // ADD SUGGESTION
      suggestions.push(
        "Aim for pull requests under 400 lines of changes for faster reviews"
      );
    }
    // IF REVIEW TIME RATING IS NOT FAST, ADD SUGGESTION
    if (reviewTimeRating !== "fast") {
      // ADD SUGGESTION
      suggestions.push(
        "Consider implementing automated code review tools to speed up the process"
      );
    }
    // IF OPEN PRS ARE GREATER THAN MERGED PRS, ADD SUGGESTION
    if (openPRs > mergedPRs) {
      // ADD SUGGESTION
      suggestions.push(
        "Focus on reviewing and merging existing PRs before creating new ones"
      );
    }
    // IF NO SUGGESTIONS, ADD DEFAULT SUGGESTION
    if (suggestions.length === 0) {
      // ADD DEFAULT SUGGESTION
      suggestions.push(
        "Great job! Keep maintaining your current code review practices"
      );
    }
    // BUILD INSIGHTS RESPONSE
    const insights: CodeReviewInsights = {
      overallHealth,
      averagePRSize: {
        additions: avgAdditions,
        deletions: avgDeletions,
        rating: sizeRating,
      },
      averageReviewTime: {
        hours: avgReviewTime,
        rating: reviewTimeRating,
      },
      mergeRate,
      bottlenecks,
      suggestions,
      prStats: {
        total: totalPRs,
        open: openPRs,
        merged: mergedPRs,
        closed: closedPRs,
      },
    };
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      data: insights,
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * SAVE GENERATED TASKS TO PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SAVE AI TASKS ==>
export const saveAITasks = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET TASKS AND PROJECT ID FROM BODY
    const { tasks, projectId } = req.body;
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
    // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Valid Workspace ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Valid Project ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // IF TASKS NOT PROVIDED, RETURN 400 ERROR
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Tasks array is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF USER IS A MEMBER OF THE WORKSPACE
    const userMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER, RETURN 403 ERROR
    if (!userMembership) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF USER HAS PERMISSION TO MANAGE PROJECTS
    const membership = userMembership as {
      permissions?: { canManageProjects?: boolean };
    };
    // IF USER DOES NOT HAVE PERMISSION TO MANAGE PROJECTS, RETURN 403 ERROR
    if (!membership.permissions?.canManageProjects) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You do not have permission to create tasks!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VERIFY PROJECT EXISTS AND USER HAS ACCESS
    const project = await Project.findOne({
      _id: projectId,
      userId,
    })
      .lean()
      .exec();
    // IF PROJECT NOT FOUND, RETURN 404 ERROR
    if (!project) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Project not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CREATE TASKS
    const tasksToCreate = tasks.map(
      (task: {
        title: string;
        description?: string;
        priority?: string;
        status?: string;
        dueDate?: string;
      }) => ({
        title: task.title.substring(0, 200),
        description: (task.description || "").substring(0, 2000),
        priority: ["low", "medium", "high"].includes(
          task.priority?.toLowerCase() || ""
        )
          ? task.priority?.toLowerCase()
          : "medium",
        status: "to do",
        projectId,
        userId,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      })
    );
    // INSERT TASKS
    const createdTasks = await Task.insertMany(tasksToCreate);
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      success: true,
      message: `${createdTasks.length} tasks created successfully!`,
      data: {
        savedCount: createdTasks.length,
        projectId,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

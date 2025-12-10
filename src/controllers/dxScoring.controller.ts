// <== IMPORTS ==>
import mongoose from "mongoose";
import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";
import { User } from "../models/user.model.js";
import { Task } from "../models/task.model.js";
import { decryptSecret } from "../utils/encryption.js";
import expressAsyncHandler from "express-async-handler";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import { Workspace, ILinkedRepository } from "../models/workspace.model.js";
import {
  MemberActivity,
  IMemberActivityStats,
} from "../models/memberActivity.model.js";

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
// <== DX SCORE INTERFACE ==>
export interface DXScore {
  // <== OVERALL SCORE (0-100) ==>
  overall: number;
  // <== RATING ==>
  rating: "excellent" | "good" | "average" | "needs_improvement";
  // <== COMPONENT SCORES ==>
  components: {
    // <== PRODUCTIVITY SCORE ==>
    productivity: number;
    // <== QUALITY SCORE ==>
    quality: number;
    // <== COLLABORATION SCORE ==>
    collaboration: number;
    // <== CONSISTENCY SCORE ==>
    consistency: number;
  };
  // <== PERCENTILE RANK ==>
  percentile: number;
}
// <== ACHIEVEMENT INTERFACE ==>
export interface Achievement {
  // <== ID ==>
  id: string;
  // <== NAME ==>
  name: string;
  // <== DESCRIPTION ==>
  description: string;
  // <== ICON ==>
  icon: string;
  // <== TIER ==>
  tier: "bronze" | "silver" | "gold" | "platinum";
  // <== EARNED AT ==>
  earnedAt?: Date | undefined;
  // <== PROGRESS (0-100) ==>
  progress: number;
}
// <== LEADERBOARD ENTRY INTERFACE ==>
export interface LeaderboardEntry {
  // <== RANK ==>
  rank: number;
  // <== USER ID ==>
  userId: string;
  // <== USER NAME ==>
  userName: string;
  // <== USER AVATAR ==>
  userAvatar?: string | undefined;
  // <== DX SCORE ==>
  dxScore: number;
  // <== STATS ==>
  stats: {
    // <== COMMITS ==>
    commits: number;
    // <== PRS OPENED ==>
    prsOpened: number;
    // <== PRS MERGED ==>
    prsMerged: number;
    // <== TASKS COMPLETED ==>
    tasksCompleted: number;
  };
  // <== CHANGE FROM PREVIOUS PERIOD ==>
  change: number;
}

// <== DX SCORE WEIGHTS ==>
const DX_WEIGHTS = {
  // <== PRODUCTIVITY WEIGHT ==>
  productivity: 0.35,
  // <== QUALITY WEIGHT ==>
  quality: 0.25,
  // <== COLLABORATION WEIGHT ==>
  collaboration: 0.25,
  // <== CONSISTENCY WEIGHT ==>
  consistency: 0.15,
};

// <== ACHIEVEMENT DEFINITIONS ==>
const ACHIEVEMENTS: Omit<Achievement, "earnedAt" | "progress">[] = [
  // <== COMMIT STREAKER ==>
  {
    id: "commit_streaker_bronze",
    name: "Commit Streaker",
    description: "Commit code 7 days in a row",
    icon: "flame",
    tier: "bronze",
  },
  // <== COMMIT WARRIOR ==>
  {
    id: "commit_streaker_silver",
    name: "Commit Warrior",
    description: "Commit code 14 days in a row",
    icon: "flame",
    tier: "silver",
  },
  // <== COMMIT MASTER ==>
  {
    id: "commit_streaker_gold",
    name: "Commit Master",
    description: "Commit code 30 days in a row",
    icon: "flame",
    tier: "gold",
  },
  // <== PR CHAMPION ==>
  {
    id: "pr_champion_bronze",
    name: "PR Champion",
    description: "Open 10 pull requests",
    icon: "git-pull-request",
    tier: "bronze",
  },
  // <== PR EXPERT ==>
  {
    id: "pr_champion_silver",
    name: "PR Expert",
    description: "Open 50 pull requests",
    icon: "git-pull-request",
    tier: "silver",
  },
  // <== PR LEGEND ==>
  {
    id: "pr_champion_gold",
    name: "PR Legend",
    description: "Open 100 pull requests",
    icon: "git-pull-request",
    tier: "gold",
  },
  // <== CODE REVIEWER ==>
  {
    id: "reviewer_bronze",
    name: "Code Reviewer",
    description: "Review 10 pull requests",
    icon: "eye",
    tier: "bronze",
  },
  // <== REVIEW EXPERT ==>
  {
    id: "reviewer_silver",
    name: "Review Expert",
    description: "Review 50 pull requests",
    icon: "eye",
    tier: "silver",
  },
  // <== REVIEW MASTER ==>
  {
    id: "reviewer_gold",
    name: "Review Master",
    description: "Review 100 pull requests",
    icon: "eye",
    tier: "gold",
  },
  // <== TASK MASTER ==>
  {
    id: "task_master_bronze",
    name: "Task Completer",
    description: "Complete 25 tasks",
    icon: "check-circle",
    tier: "bronze",
  },
  // <== TASK EXPERT ==>
  {
    id: "task_master_silver",
    name: "Task Expert",
    description: "Complete 100 tasks",
    icon: "check-circle",
    tier: "silver",
  },
  // <== TASK MASTER ==>
  {
    id: "task_master_gold",
    name: "Task Master",
    description: "Complete 500 tasks",
    icon: "check-circle",
    tier: "gold",
  },
  // <== COLLABORATION KING ==>
  {
    id: "collaborator_bronze",
    name: "Team Player",
    description: "Collaborate with 5 team members",
    icon: "users",
    tier: "bronze",
  },
  // <== COLLABORATION EXPERT ==>
  {
    id: "collaborator_silver",
    name: "Collaboration Expert",
    description: "Collaborate with 15 team members",
    icon: "users",
    tier: "silver",
  },
  // <== COLLABORATION LEGEND ==>
  {
    id: "collaborator_gold",
    name: "Collaboration Legend",
    description: "Collaborate with 30 team members",
    icon: "users",
    tier: "gold",
  },
  // <== TOP PERFORMER PLATINUM ==>
  {
    id: "top_performer_platinum",
    name: "Top Performer",
    description: "Achieve #1 on the leaderboard",
    icon: "trophy",
    tier: "platinum",
  },
];

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
    // RETURN ERROR IF USER NOT FOUND
    return {
      octokit: null,
      error: { status: 404, message: "User not found!" },
    };
  }
  // CAST USER TO GITHUB USER DATA TYPE
  const githubUser = user as unknown as GitHubUserData;
  // CHECK IF GITHUB IS CONNECTED
  if (!githubUser.githubAccessToken || !githubUser.githubUsername) {
    // RETURN ERROR IF GITHUB IS NOT CONNECTED
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
    // RETURN ERROR IF ACCESS TOKEN DECRYPTION FAILS
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
  // RETURN OCTOKIT INSTANCE AND NULL ERROR
  return { octokit, error: null };
};

// <== CALCULATE DX SCORE ==>
const calculateDXScore = (
  stats: IMemberActivityStats,
  teamAverages: IMemberActivityStats
): DXScore => {
  // CALCULATE PRODUCTIVITY METRICS (COMMITS, PRS, TASKS)
  const productivityMetrics = {
    commits: stats.commits / Math.max(teamAverages.commits, 1),
    prs:
      (stats.prsOpened + stats.prsMerged) /
      Math.max(teamAverages.prsOpened + teamAverages.prsMerged, 1),
    tasks: stats.tasksCompleted / Math.max(teamAverages.tasksCompleted, 1),
  };
  // CALCULATE PRODUCTIVITY SCORE
  const productivityScore = Math.min(
    100,
    (productivityMetrics.commits * 0.4 +
      productivityMetrics.prs * 0.3 +
      productivityMetrics.tasks * 0.3) *
      50
  );
  // CALCULATE PR MERGE RATE
  const prMergeRate =
    stats.prsOpened > 0 ? stats.prsMerged / stats.prsOpened : 0;
  // CALCULATE LINES RATIO
  const linesRatio =
    stats.linesAdded > 0
      ? Math.min(1, stats.linesRemoved / stats.linesAdded)
      : 0.5;
  const qualityScore = Math.min(100, prMergeRate * 60 + linesRatio * 40);
  // CALCULATE COLLABORATION METRICS (REVIEWS, COMMENTS)
  const collaborationMetrics = {
    reviews: stats.prsReviewed / Math.max(teamAverages.prsReviewed, 1),
    comments:
      stats.codeReviewComments / Math.max(teamAverages.codeReviewComments, 1),
  };
  // CALCULATE COLLABORATION SCORE
  const collaborationScore = Math.min(
    100,
    (collaborationMetrics.reviews * 0.6 + collaborationMetrics.comments * 0.4) *
      50
  );
  // CALCULATE CONSISTENCY METRICS
  const consistencyScore = Math.min(100, (stats.activeMinutes / 480) * 100);
  // CALCULATE CONSISTENCY SCORE
  const overallScore = Math.round(
    productivityScore * DX_WEIGHTS.productivity +
      qualityScore * DX_WEIGHTS.quality +
      collaborationScore * DX_WEIGHTS.collaboration +
      consistencyScore * DX_WEIGHTS.consistency
  );
  // DETERMINE OVERALL SCORE RATING
  let rating: DXScore["rating"];
  // DETERMINE OVERALL SCORE RATING
  if (overallScore >= 80) rating = "excellent";
  // CHECK IF OVERALL SCORE IS GREATER THAN OR EQUAL TO 60
  else if (overallScore >= 60) rating = "good";
  // CHECK IF OVERALL SCORE IS GREATER THAN OR EQUAL TO 40
  else if (overallScore >= 40) rating = "average";
  // SET OVERALL SCORE RATING TO NEEDS IMPROVEMENT
  else rating = "needs_improvement";
  // RETURN DX SCORE
  return {
    overall: overallScore,
    rating,
    components: {
      productivity: Math.round(productivityScore),
      quality: Math.round(qualityScore),
      collaboration: Math.round(collaborationScore),
      consistency: Math.round(consistencyScore),
    },
    percentile: 0,
  };
};

/**
 * GET MEMBER DX SCORE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET MEMBER DX SCORE ==>
export const getMemberDXScore = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID AND MEMBER ID FROM PARAMS
    const { workspaceId, memberId } = req.params;
    // GET PERIOD FROM QUERY (DEFAULT: 30 DAYS)
    const { period = "30" } = req.query;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN ERROR IF USER ID IS NOT SET
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN ERROR IF NOT A MEMBER
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CALCULATE END DATE
    const endDate = new Date();
    // CALCULATE START DATE
    const startDate = new Date();
    // SET START DATE TO END DATE - PERIOD
    startDate.setDate(startDate.getDate() - parseInt(period as string, 10));
    // GET TARGET MEMBER ID
    const targetMemberId = memberId || userId;
    // GET MEMBER ACTIVITIES
    const activities = await MemberActivity.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(targetMemberId),
      date: { $gte: startDate, $lte: endDate },
    })
      .lean()
      .exec();
    // AGGREGATE MEMBER STATS
    const memberStats: IMemberActivityStats = {
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      prsReviewed: 0,
      issuesClosed: 0,
      tasksCompleted: 0,
      tasksCreated: 0,
      linesAdded: 0,
      linesRemoved: 0,
      codeReviewComments: 0,
      activeMinutes: 0,
    };
    // AGGREGATE STATS
    for (const activity of activities) {
      // GET ACTIVITY STATS
      const stats = (activity as unknown as { stats: IMemberActivityStats })
        .stats;
      // ADD COMMITS TO MEMBER STATS
      memberStats.commits += stats.commits || 0;
      // ADD PRS OPENED TO MEMBER STATS
      memberStats.prsOpened += stats.prsOpened || 0;
      // ADD PRS MERGED TO MEMBER STATS
      memberStats.prsMerged += stats.prsMerged || 0;
      // ADD PRS REVIEWED TO MEMBER STATS
      memberStats.prsReviewed += stats.prsReviewed || 0;
      // ADD ISSUES CLOSED TO MEMBER STATS
      memberStats.issuesClosed += stats.issuesClosed || 0;
      // ADD TASKS COMPLETED TO MEMBER STATS
      memberStats.tasksCompleted += stats.tasksCompleted || 0;
      // ADD TASKS CREATED TO MEMBER STATS
      memberStats.tasksCreated += stats.tasksCreated || 0;
      // ADD LINES ADDED TO MEMBER STATS
      memberStats.linesAdded += stats.linesAdded || 0;
      // ADD LINES REMOVED TO MEMBER STATS
      memberStats.linesRemoved += stats.linesRemoved || 0;
      // ADD CODE REVIEW COMMENTS TO MEMBER STATS
      memberStats.codeReviewComments += stats.codeReviewComments || 0;
      // ADD ACTIVE MINUTES TO MEMBER STATS
      memberStats.activeMinutes += stats.activeMinutes || 0;
    }
    // GET TEAM AVERAGES
    const teamActivities = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          date: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP BY NULL AND CALCULATE AVERAGES
      {
        $group: {
          _id: null,
          commits: { $avg: "$stats.commits" },
          prsOpened: { $avg: "$stats.prsOpened" },
          prsMerged: { $avg: "$stats.prsMerged" },
          prsReviewed: { $avg: "$stats.prsReviewed" },
          issuesClosed: { $avg: "$stats.issuesClosed" },
          tasksCompleted: { $avg: "$stats.tasksCompleted" },
          tasksCreated: { $avg: "$stats.tasksCreated" },
          linesAdded: { $avg: "$stats.linesAdded" },
          linesRemoved: { $avg: "$stats.linesRemoved" },
          codeReviewComments: { $avg: "$stats.codeReviewComments" },
          activeMinutes: { $avg: "$stats.activeMinutes" },
        },
      },
    ]);
    // SET TEAM AVERAGES
    const teamAverages: IMemberActivityStats = teamActivities[0] || {
      commits: 1,
      prsOpened: 1,
      prsMerged: 1,
      prsReviewed: 1,
      issuesClosed: 1,
      tasksCompleted: 1,
      tasksCreated: 1,
      linesAdded: 1,
      linesRemoved: 1,
      codeReviewComments: 1,
      activeMinutes: 1,
    };
    // CALCULATE DX SCORE
    const dxScore = calculateDXScore(memberStats, teamAverages);
    // CALCULATE PERCENTILE
    const allScores = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          date: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP BY USER ID AND SUM COMMITS
      {
        $group: {
          _id: "$userId",
          totalCommits: { $sum: "$stats.commits" },
        },
      },
      // SORT BY TOTAL COMMITS IN DESCENDING ORDER
      { $sort: { totalCommits: -1 } },
    ]);
    // FIND PERCENTILE
    const memberIndex = allScores.findIndex(
      (s) => s._id.toString() === targetMemberId
    );
    // CALCULATE PERCENTILE
    dxScore.percentile =
      allScores.length > 0
        ? Math.round(
            ((allScores.length - memberIndex) / allScores.length) * 100
          )
        : 50;
    // GET DAILY TREND
    const dailyTrend = (await MemberActivity.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(targetMemberId),
      date: { $gte: startDate, $lte: endDate },
    })
      .select("date stats.commits stats.tasksCompleted")
      .sort({ date: 1 })
      .lean()
      .exec()) as Array<{
      date: Date;
      stats: { commits: number; tasksCompleted: number };
    }>;
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      data: {
        dxScore,
        stats: memberStats,
        teamAverages,
        dailyTrend: dailyTrend.map((d) => ({
          date: d.date,
          commits: d.stats.commits,
          tasksCompleted: d.stats.tasksCompleted,
        })),
        period: parseInt(period as string, 10),
      },
    });
  }
);

/**
 * GET WORKSPACE LEADERBOARD
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKSPACE LEADERBOARD ==>
export const getWorkspaceLeaderboard = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET PERIOD FROM QUERY
    const { period = "30", limit = "10" } = req.query;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN ERROR IF USER ID IS NOT SET
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN ERROR IF NOT A MEMBER
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CALCULATE END DATE
    const endDate = new Date();
    // CALCULATE START DATE
    const startDate = new Date();
    // SET START DATE TO END DATE - PERIOD
    startDate.setDate(startDate.getDate() - parseInt(period as string, 10));
    // CALCULATE PREVIOUS PERIOD
    const prevEndDate = new Date(startDate);
    // CALCULATE PREVIOUS START DATE
    const prevStartDate = new Date(startDate);
    // SET PREVIOUS START DATE TO START DATE - PERIOD
    prevStartDate.setDate(
      prevStartDate.getDate() - parseInt(period as string, 10)
    );
    // AGGREGATE CURRENT PERIOD
    const currentPeriod = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          date: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP BY USER ID AND SUM STATS
      {
        $group: {
          _id: "$userId",
          commits: { $sum: "$stats.commits" },
          prsOpened: { $sum: "$stats.prsOpened" },
          prsMerged: { $sum: "$stats.prsMerged" },
          tasksCompleted: { $sum: "$stats.tasksCompleted" },
          prsReviewed: { $sum: "$stats.prsReviewed" },
          linesAdded: { $sum: "$stats.linesAdded" },
          linesRemoved: { $sum: "$stats.linesRemoved" },
        },
      },
      // ADD FIELDS TO CALCULATE SCORE
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$commits", 5] },
              { $multiply: ["$prsMerged", 15] },
              { $multiply: ["$tasksCompleted", 10] },
              { $multiply: ["$prsReviewed", 8] },
            ],
          },
        },
      },
      // SORT BY SCORE IN DESCENDING ORDER
      { $sort: { score: -1 } },
      // LIMIT THE NUMBER OF RESULTS
      { $limit: parseInt(limit as string, 10) },
    ]);
    // AGGREGATE PREVIOUS PERIOD
    const previousPeriod = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          date: { $gte: prevStartDate, $lte: prevEndDate },
        },
      },
      // GROUP BY USER ID AND SUM STATS
      {
        $group: {
          _id: "$userId",
          score: {
            $sum: {
              $add: [
                { $multiply: ["$stats.commits", 5] },
                { $multiply: ["$stats.prsMerged", 15] },
                { $multiply: ["$stats.tasksCompleted", 10] },
                { $multiply: ["$stats.prsReviewed", 8] },
              ],
            },
          },
        },
      },
      // SORT BY SCORE IN DESCENDING ORDER
      { $sort: { score: -1 } },
      // LIMIT THE NUMBER OF RESULTS
      { $limit: parseInt(limit as string, 10) },
    ]);
    // CREATE PREVIOUS SCORES MAP
    const prevScoresMap = new Map(
      previousPeriod.map((p) => [p._id.toString(), p.score])
    );
    // GET USER IDS
    const userIds = currentPeriod.map((p) => p._id);
    // GET USERS
    const users = (await User.find({ _id: { $in: userIds } })
      .select("name profilePic")
      .lean()
      .exec()) as Array<{
      _id: mongoose.Types.ObjectId;
      name: string;
      profilePic?: string;
    }>;
    // CREATE USER MAP FOR LOOKUP
    const userMap = new Map(
      users.map((u) => [
        u._id.toString(),
        { name: u.name, profilePic: u.profilePic },
      ])
    );
    // BUILD LEADERBOARD
    const leaderboard: LeaderboardEntry[] = currentPeriod.map(
      (entry, index) => {
        // GET USER ID STRING
        const userIdStr = entry._id.toString();
        // GET USER
        const user = userMap.get(userIdStr);
        // GET PREVIOUS SCORE
        const prevScore = prevScoresMap.get(userIdStr) || 0;
        // CALCULATE CHANGE
        const change = entry.score - prevScore;
        // RETURN LEADERBOARD ENTRY
        return {
          rank: index + 1,
          userId: userIdStr,
          userName: user?.name || "Unknown User",
          userAvatar: user?.profilePic,
          dxScore: entry.score,
          stats: {
            commits: entry.commits,
            prsOpened: entry.prsOpened,
            prsMerged: entry.prsMerged,
            tasksCompleted: entry.tasksCompleted,
          },
          change,
        };
      }
    );
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        period: parseInt(period as string, 10),
        totalMembers: currentPeriod.length,
      },
    });
  }
);

/**
 * GET MEMBER ACHIEVEMENTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET MEMBER ACHIEVEMENTS ==>
export const getMemberAchievements = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID AND MEMBER ID FROM PARAMS
    const { workspaceId, memberId } = req.params;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN ERROR IF USER ID IS NOT SET
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN ERROR IF NOT A MEMBER
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET TARGET MEMBER ID
    const targetMemberId = memberId || userId;
    // GET ALL TIME STATS
    const allTimeStats = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND USER ID
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          userId: new mongoose.Types.ObjectId(targetMemberId),
        },
      },
      // GROUP BY NULL AND SUM STATS
      {
        $group: {
          _id: null,
          commits: { $sum: "$stats.commits" },
          prsOpened: { $sum: "$stats.prsOpened" },
          prsMerged: { $sum: "$stats.prsMerged" },
          prsReviewed: { $sum: "$stats.prsReviewed" },
          tasksCompleted: { $sum: "$stats.tasksCompleted" },
          daysActive: { $sum: 1 },
        },
      },
    ]);
    // GET STATS
    const stats = allTimeStats[0] || {
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      prsReviewed: 0,
      tasksCompleted: 0,
      daysActive: 0,
    };
    // CALCULATE ACHIEVEMENTS
    const achievements: Achievement[] = ACHIEVEMENTS.map((achievement) => {
      // INITIALIZE PROGRESS AND EARNED
      let progress = 0;
      // INITIALIZE EARNED
      let earned = false;
      // CALCULATE PROGRESS BASED ON ACHIEVEMENT TYPE
      if (achievement.id.startsWith("commit_streaker")) {
        // GET TARGET DAYS ACTIVE
        const target =
          achievement.tier === "bronze"
            ? 7
            : achievement.tier === "silver"
            ? 14
            : 30;
        // CALCULATE PROGRESS
        progress = Math.min(100, (stats.daysActive / target) * 100);
        // SET EARNED TO TRUE IF DAYS ACTIVE IS GREATER THAN OR EQUAL TO TARGET
        earned = stats.daysActive >= target;
      } else if (achievement.id.startsWith("pr_champion")) {
        // GET TARGET PRS OPENED
        const target =
          achievement.tier === "bronze"
            ? 10
            : achievement.tier === "silver"
            ? 50
            : 100;
        // CALCULATE PROGRESS
        progress = Math.min(100, (stats.prsOpened / target) * 100);
        // SET EARNED TO TRUE IF PRS OPENED IS GREATER THAN OR EQUAL TO TARGET
        earned = stats.prsOpened >= target;
      } else if (achievement.id.startsWith("reviewer")) {
        // GET TARGET PRS REVIEWED
        const target =
          achievement.tier === "bronze"
            ? 10
            : achievement.tier === "silver"
            ? 50
            : 100;
        // CALCULATE PROGRESS
        progress = Math.min(100, (stats.prsReviewed / target) * 100);
        // SET EARNED TO TRUE IF PRS REVIEWED IS GREATER THAN OR EQUAL TO TARGET
        earned = stats.prsReviewed >= target;
      } else if (achievement.id.startsWith("task_master")) {
        // GET TARGET TASKS COMPLETED
        const target =
          achievement.tier === "bronze"
            ? 25
            : achievement.tier === "silver"
            ? 100
            : 500;
        // CALCULATE PROGRESS
        progress = Math.min(100, (stats.tasksCompleted / target) * 100);
        // SET EARNED TO TRUE IF TASKS COMPLETED IS GREATER THAN OR EQUAL TO TARGET
        earned = stats.tasksCompleted >= target;
      } else if (achievement.id.startsWith("collaborator")) {
        // SET PROGRESS TO 0
        progress = 0;
        // SET EARNED TO FALSE
        earned = false;
      } else if (achievement.id === "top_performer_platinum") {
        // SET PROGRESS TO 0
        progress = 0;
        // SET EARNED TO FALSE
        earned = false;
      }
      // RETURN ACHIEVEMENT
      return {
        ...achievement,
        progress: Math.round(progress),
        earnedAt: earned ? new Date() : undefined,
      };
    });
    // SEPARATE EARNED AND IN PROGRESS
    const earnedAchievements = achievements.filter((a) => a.earnedAt);
    // GET IN PROGRESS ACHIEVEMENTS
    const inProgressAchievements = achievements.filter((a) => !a.earnedAt);
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      data: {
        earned: earnedAchievements,
        inProgress: inProgressAchievements,
        stats: {
          totalEarned: earnedAchievements.length,
          totalAvailable: achievements.length,
        },
      },
    });
  }
);

/**
 * GET AI DX RECOMMENDATIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET AI DX RECOMMENDATIONS ==>
export const getAIDXRecommendations = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId, memberId } = req.params;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN ERROR IF USER ID IS NOT SET
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN ERROR IF NOT A MEMBER
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET GEMINI MODEL
    const model = getGeminiModel();
    // IF GEMINI NOT CONFIGURED, RETURN ERROR
    if (!model) {
      // RETURN ERROR IF MODEL IS NOT CONFIGURED
      res.status(500).json({
        message: "AI service is not configured.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CALCULATE END DATE
    const endDate = new Date();
    // CALCULATE START DATE
    const startDate = new Date();
    // SET START DATE TO END DATE - 30 DAYS
    startDate.setDate(startDate.getDate() - 30);
    // GET TARGET MEMBER ID
    const targetMemberId = memberId || userId;
    // GET MEMBER STATS (LAST 30 DAYS)
    const activities = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND USER ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          userId: new mongoose.Types.ObjectId(targetMemberId),
          date: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP BY NULL AND SUM STATS
      {
        $group: {
          _id: null,
          commits: { $sum: "$stats.commits" },
          prsOpened: { $sum: "$stats.prsOpened" },
          prsMerged: { $sum: "$stats.prsMerged" },
          prsReviewed: { $sum: "$stats.prsReviewed" },
          tasksCompleted: { $sum: "$stats.tasksCompleted" },
          linesAdded: { $sum: "$stats.linesAdded" },
          linesRemoved: { $sum: "$stats.linesRemoved" },
          codeReviewComments: { $sum: "$stats.codeReviewComments" },
          activeDays: { $sum: 1 },
        },
      },
    ]);
    // GET STATS
    const stats = activities[0] || {
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      prsReviewed: 0,
      tasksCompleted: 0,
      linesAdded: 0,
      linesRemoved: 0,
      codeReviewComments: 0,
      activeDays: 0,
    };
    // GET TEAM AVERAGES
    const teamStats = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          date: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP BY USER ID AND SUM STATS
      {
        $group: {
          _id: "$userId",
          commits: { $sum: "$stats.commits" },
          prsOpened: { $sum: "$stats.prsOpened" },
          prsMerged: { $sum: "$stats.prsMerged" },
          prsReviewed: { $sum: "$stats.prsReviewed" },
          tasksCompleted: { $sum: "$stats.tasksCompleted" },
        },
      },
      // GROUP BY NULL AND CALCULATE AVERAGES
      {
        $group: {
          _id: null,
          avgCommits: { $avg: "$commits" },
          avgPrsOpened: { $avg: "$prsOpened" },
          avgPrsMerged: { $avg: "$prsMerged" },
          avgPrsReviewed: { $avg: "$prsReviewed" },
          avgTasksCompleted: { $avg: "$tasksCompleted" },
        },
      },
    ]);
    // GET TEAM AVERAGES
    const teamAvg = teamStats[0] || {
      avgCommits: 0,
      avgPrsOpened: 0,
      avgPrsMerged: 0,
      avgPrsReviewed: 0,
      avgTasksCompleted: 0,
    };
    // BUILD PROMPT
    const prompt = `Analyze this developer's productivity metrics and provide personalized recommendations:
    Developer Stats (Last 30 Days):
    - Commits: ${stats.commits}
    - PRs Opened: ${stats.prsOpened}
    - PRs Merged: ${stats.prsMerged}
    - PRs Reviewed: ${stats.prsReviewed}
    - Tasks Completed: ${stats.tasksCompleted}
    - Lines Added: ${stats.linesAdded}
    - Lines Removed: ${stats.linesRemoved}
    - Code Review Comments: ${stats.codeReviewComments}
    - Active Days: ${stats.activeDays}
    Team Averages (Same Period):
    - Avg Commits: ${Math.round(teamAvg.avgCommits)}
    - Avg PRs Opened: ${Math.round(teamAvg.avgPrsOpened)}
    - Avg PRs Merged: ${Math.round(teamAvg.avgPrsMerged)}
    - Avg PRs Reviewed: ${Math.round(teamAvg.avgPrsReviewed)}
    - Avg Tasks Completed: ${Math.round(teamAvg.avgTasksCompleted)}
    Provide 3-5 specific, actionable recommendations to improve this developer's productivity and developer experience (DX). Focus on areas where they're below team average or could improve.
    Format as JSON with: { "recommendations": [{ "title": "...", "description": "...", "priority": "high|medium|low", "category": "productivity|quality|collaboration|wellbeing" }] }`;
    // TRY TO GENERATE RECOMMENDATIONS
    try {
      // GENERATE CONTENT
      const result = await model.generateContent(prompt);
      // GET RESPONSE TEXT
      const responseText = result.response.text();
      // PARSE JSON FROM RESPONSE
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      // INITIALIZE RECOMMENDATIONS
      let recommendations;
      // IF JSON MATCH, PARSE JSON
      if (jsonMatch) {
        // TRY TO PARSE JSON
        try {
          // PARSE JSON
          recommendations = JSON.parse(jsonMatch[0]);
        } catch {
          // IF JSON IS NOT VALID, RETURN DEFAULT
          recommendations = {
            recommendations: [
              {
                title: "Keep up the good work!",
                description:
                  "Your metrics look healthy. Continue your current workflow.",
                priority: "low",
                category: "productivity",
              },
            ],
          };
        }
      } else {
        // IF JSON MATCH IS NOT FOUND, RETURN DEFAULT
        recommendations = {
          recommendations: [
            {
              title: "Keep up the good work!",
              description:
                "Your metrics look healthy. Continue your current workflow.",
              priority: "low",
              category: "productivity",
            },
          ],
        };
      }
      // RETURN RESPONSE
      res.status(200).json({
        success: true,
        data: {
          recommendations: recommendations.recommendations,
          stats,
          teamAverages: teamAvg,
        },
      });
    } catch (err) {
      // GET ERROR MESSAGE
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // RETURN ERROR
      res.status(500).json({
        message: `Failed to generate recommendations: ${errorMessage}`,
        success: false,
      });
    }
  }
);

/**
 * SYNC MEMBER ACTIVITY FROM GITHUB
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SYNC MEMBER ACTIVITY ==>
export const syncMemberActivity = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN ERROR IF USER ID IS NOT SET
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN ERROR IF NOT A MEMBER
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET WORKSPACE
    const workspace = (await Workspace.findById(workspaceId)
      .select("linkedRepositories")
      .lean()
      .exec()) as { linkedRepositories?: ILinkedRepository[] } | null;
    // IF NO WORKSPACE OR NO REPOSITORIES ARE LINKED, RETURN ERROR
    if (!workspace || !workspace.linkedRepositories?.length) {
      // RETURN ERROR IF NO REPOSITORIES ARE LINKED
      res.status(400).json({
        message: "No repositories linked to this workspace.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET OCTOKIT
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR
    if (error) {
      // RETURN ERROR
      res.status(error.status).json({ message: error.message, success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // CALCULATE TODAY
    const today = new Date();
    // SET HOURS TO 0
    today.setUTCHours(0, 0, 0, 0);
    // INITIALIZE TOTAL COMMITS
    let totalCommits = 0;
    // INITIALIZE TOTAL PRS
    let totalPRs = 0;
    // INITIALIZE TOTAL REVIEWS
    let totalReviews = 0;
    // INITIALIZE TOTAL LINES ADDED
    let totalLinesAdded = 0;
    // INITIALIZE TOTAL LINES REMOVED
    let totalLinesRemoved = 0;
    // PROCESS EACH REPOSITORY
    for (const repo of workspace.linkedRepositories) {
      // TRY TO PROCESS REPOSITORY
      try {
        // GET USER'S COMMITS (LAST 24 HOURS)
        const since = new Date();
        // SET HOURS TO 0
        since.setDate(since.getDate() - 1);
        // SET DATE TO 1 DAY AGO
        const commits = await octokit!.repos.listCommits({
          owner: repo.owner,
          repo: repo.name,
          since: since.toISOString(),
          per_page: 100,
        });
        // GET USER'S GITHUB USERNAME
        const userResponse = await octokit!.users.getAuthenticated();
        // GET USER'S GITHUB USERNAME
        const githubUsername = userResponse.data.login;
        // COUNT USER'S COMMITS
        const userCommits = commits.data.filter(
          (c) => c.author?.login === githubUsername
        );
        // ADD USER'S COMMITS TO TOTAL COMMITS
        totalCommits += userCommits.length;
        // ITERATE THROUGH USER'S COMMITS
        for (const commit of userCommits) {
          // TRY TO GET COMMIT DETAILS
          try {
            // GET COMMIT DETAILS
            const commitDetails = await octokit!.repos.getCommit({
              owner: repo.owner,
              repo: repo.name,
              ref: commit.sha,
            });
            // ADD LINES ADDED TO TOTAL LINES ADDED
            totalLinesAdded +=
              (commitDetails.data as { stats?: { additions?: number } }).stats
                ?.additions || 0;
            // ADD LINES REMOVED TO TOTAL LINES REMOVED
            totalLinesRemoved +=
              (commitDetails.data as { stats?: { deletions?: number } }).stats
                ?.deletions || 0;
          } catch {
            // IGNORE ERRORS
          }
        }
        // GET USER'S PULL REQUESTS
        const prs = await octokit!.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state: "all",
          sort: "updated",
          direction: "desc",
          per_page: 50,
        });
        // COUNT USER'S PRS FROM TODAY
        const todayPRs = prs.data.filter(
          (pr) =>
            pr.user?.login === githubUsername &&
            new Date(pr.created_at) >= since
        );
        // ADD USER'S PULL REQUESTS TO TOTAL PRS
        totalPRs += todayPRs.length;
        // ITERATE THROUGH USER'S PULL REQUESTS
        for (const pr of prs.data.slice(0, 20)) {
          // TRY TO GET REVIEWS FOR PR
          try {
            // GET REVIEWS FOR PR
            const reviews = await octokit!.pulls.listReviews({
              owner: repo.owner,
              repo: repo.name,
              pull_number: pr.number,
            });
            // GET USER'S REVIEWS
            const userReviews = reviews.data.filter(
              (r) =>
                r.user?.login === githubUsername &&
                new Date(r.submitted_at || "") >= since
            );
            // ADD USER'S REVIEWS TO TOTAL REVIEWS
            totalReviews += userReviews.length;
          } catch {
            // IGNORE ERRORS
          }
        }
      } catch {
        // IGNORE REPO ERRORS
      }
    }
    // GET TASKS COMPLETED TODAY
    const tasksCompleted = await Task.countDocuments({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "completed",
      completedAt: { $gte: today },
    }).exec();
    // UPDATE OR CREATE ACTIVITY RECORD
    await MemberActivity.updateOne(
      // MATCH USER ID, WORKSPACE ID AND DATE
      {
        userId: new mongoose.Types.ObjectId(userId),
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        date: today,
      },
      {
        // SET STATS
        $set: {
          "stats.commits": totalCommits,
          "stats.prsOpened": totalPRs,
          "stats.prsReviewed": totalReviews,
          "stats.linesAdded": totalLinesAdded,
          "stats.linesRemoved": totalLinesRemoved,
          "stats.tasksCompleted": tasksCompleted,
        },
      },
      // UPSERT ACTIVITY RECORD
      { upsert: true }
    );
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      message: "Activity synced successfully!",
      data: {
        commits: totalCommits,
        prsOpened: totalPRs,
        prsReviewed: totalReviews,
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved,
        tasksCompleted,
      },
    });
  }
);

/**
 * GET TEAM PERFORMANCE SUMMARY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TEAM PERFORMANCE SUMMARY ==>
export const getTeamPerformanceSummary = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // GET WORKSPACE ID FROM PARAMS
    const { workspaceId } = req.params;
    // GET PERIOD FROM QUERY
    const { period = "30" } = req.query;
    // VALIDATE USER ID
    if (!userId) {
      // RETURN ERROR IF USER ID IS NOT SET
      res.status(401).json({ message: "Unauthorized!", success: false });
      // RETURN FROM FUNCTION
      return;
    }
    // VERIFY ACCESS
    const membership = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "active",
    })
      .lean()
      .exec();
    // IF NOT A MEMBER, RETURN ERROR
    if (!membership) {
      // RETURN ERROR IF NOT A MEMBER
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CALCULATE END DATE
    const endDate = new Date();
    // CALCULATE START DATE
    const startDate = new Date();
    // SET START DATE TO END DATE - PERIOD
    startDate.setDate(startDate.getDate() - parseInt(period as string, 10));
    // AGGREGATE TEAM STATS
    const teamStats = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          date: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP BY NULL AND SUM STATS
      {
        $group: {
          _id: null,
          totalCommits: { $sum: "$stats.commits" },
          totalPRsOpened: { $sum: "$stats.prsOpened" },
          totalPRsMerged: { $sum: "$stats.prsMerged" },
          totalPRsReviewed: { $sum: "$stats.prsReviewed" },
          totalTasksCompleted: { $sum: "$stats.tasksCompleted" },
          totalLinesAdded: { $sum: "$stats.linesAdded" },
          totalLinesRemoved: { $sum: "$stats.linesRemoved" },
          uniqueMembers: { $addToSet: "$userId" },
        },
      },
    ]);
    // GET DAILY ACTIVITY
    const dailyActivity = await MemberActivity.aggregate([
      // MATCH WORKSPACE ID AND DATE RANGE
      {
        $match: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          date: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP BY DATE AND SUM STATS
      {
        $group: {
          _id: "$date",
          commits: { $sum: "$stats.commits" },
          prs: { $sum: { $add: ["$stats.prsOpened", "$stats.prsMerged"] } },
          tasks: { $sum: "$stats.tasksCompleted" },
          activeMembers: { $addToSet: "$userId" },
        },
      },
      // SORT BY DATE IN ASCENDING ORDER
      { $sort: { _id: 1 } },
    ]);
    // FORMAT RESPONSE
    const stats = teamStats[0] || {
      totalCommits: 0,
      totalPRsOpened: 0,
      totalPRsMerged: 0,
      totalPRsReviewed: 0,
      totalTasksCompleted: 0,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      uniqueMembers: [],
    };
    // RETURN RESPONSE
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCommits: stats.totalCommits,
          totalPRsOpened: stats.totalPRsOpened,
          totalPRsMerged: stats.totalPRsMerged,
          totalPRsReviewed: stats.totalPRsReviewed,
          totalTasksCompleted: stats.totalTasksCompleted,
          totalLinesAdded: stats.totalLinesAdded,
          totalLinesRemoved: stats.totalLinesRemoved,
          activeMembers: stats.uniqueMembers.length,
        },
        dailyActivity: dailyActivity.map((d) => ({
          date: d._id,
          commits: d.commits,
          prs: d.prs,
          tasks: d.tasks,
          activeMembers: d.activeMembers.length,
        })),
        period: parseInt(period as string, 10),
      },
    });
  }
);

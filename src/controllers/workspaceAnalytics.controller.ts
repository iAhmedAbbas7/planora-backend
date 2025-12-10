// <== IMPORTS ==>
import mongoose from "mongoose";
import { Octokit } from "@octokit/rest";
import { User } from "../models/user.model.js";
import { decryptSecret } from "../utils/encryption.js";
import expressAsyncHandler from "express-async-handler";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import { Workspace, ILinkedRepository } from "../models/workspace.model.js";

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

// <== DORA METRICS INTERFACE ==>
export interface DORAMetrics {
  // <== DEPLOYMENT FREQUENCY ==>
  deploymentFrequency: {
    // <== VALUE ==>
    value: number;
    // <== UNIT ==>
    unit: "per_day" | "per_week" | "per_month";
    // <== RATING ==>
    rating: "elite" | "high" | "medium" | "low";
    // <== TREND ==>
    trend: number[];
  };
  // <== LEAD TIME FOR CHANGES ==>
  leadTimeForChanges: {
    // <== VALUE ==>
    value: number;
    // <== UNIT ==>
    unit: "hours" | "days";
    // <== RATING ==>
    rating: "elite" | "high" | "medium" | "low";
    // <== TREND ==>
    trend: number[];
  };
  // <== CHANGE FAILURE RATE ==>
  changeFailureRate: {
    // <== VALUE ==>
    value: number;
    // <== UNIT ==>
    unit: "percentage";
    // <== RATING ==>
    rating: "elite" | "high" | "medium" | "low";
    // <== TREND ==>
    trend: number[];
  };
  // <== MEAN TIME TO RECOVERY ==>
  meanTimeToRecovery: {
    // <== VALUE ==>
    value: number;
    // <== UNIT ==>
    unit: "hours" | "days";
    // <== RATING ==>
    rating: "elite" | "high" | "medium" | "low";
    // <== TREND ==>
    trend: number[];
  };
  // <== OVERALL RATING ==>
  overallRating: "elite" | "high" | "medium" | "low";
  // <== LAST UPDATED DATE ==>
  lastUpdated: Date;
}

// <== DORA BENCHMARKS ==>
const DORA_BENCHMARKS = {
  // <== DEPLOYMENT FREQUENCY BENCHMARKS ==>
  deploymentFrequency: {
    // <== ELITE VALUE ==>
    elite: 1,
    // <== HIGH VALUE ==>
    high: 0.14,
    // <== MEDIUM VALUE ==>
    medium: 0.033,
  },
  // <== LEAD TIME FOR CHANGES BENCHMARKS ==>
  leadTimeForChanges: {
    // <== ELITE VALUE ==>
    elite: 1,
    // <== HIGH VALUE ==>
    high: 24,
    // <== MEDIUM VALUE ==>
    medium: 168,
  },
  // <== CHANGE FAILURE RATE BENCHMARKS ==>
  changeFailureRate: {
    // <== ELITE VALUE ==>
    elite: 15,
    // <== HIGH VALUE ==>
    high: 30,
    // <== MEDIUM VALUE ==>
    medium: 45,
  },
  // <== MEAN TIME TO RECOVERY BENCHMARKS ==>
  meanTimeToRecovery: {
    // <== ELITE VALUE ==>
    elite: 1,
    // <== HIGH VALUE ==>
    high: 24,
    // <== MEDIUM VALUE ==>
    medium: 168,
  },
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

/**
 * RATE METRIC BASED ON DORA BENCHMARKS
 * @param metric - Metric Name
 * @param value - Metric Value
 * @returns Rating (Elite, High, Medium, Low)
 */
// <== RATE METRIC ==>
const rateMetric = (
  metric: keyof typeof DORA_BENCHMARKS,
  value: number
): "elite" | "high" | "medium" | "low" => {
  // GET BENCHMARKS FOR METRIC
  const benchmarks = DORA_BENCHMARKS[metric];
  // IF METRIC IS CHANGE FAILURE RATE
  if (metric === "changeFailureRate") {
    // CHECK IF VALUE IS LESS THAN OR EQUAL TO ELITE VALUE
    if (value <= benchmarks.elite) return "elite";
    // CHECK IF VALUE IS LESS THAN OR EQUAL TO HIGH VALUE
    if (value <= benchmarks.high) return "high";
    // CHECK IF VALUE IS LESS THAN OR EQUAL TO MEDIUM VALUE
    if (value <= benchmarks.medium) return "medium";
    // RETURN LOW RATING
    return "low";
  }
  // IF METRIC IS DEPLOYMENT FREQUENCY
  if (metric === "deploymentFrequency") {
    // CHECK IF VALUE IS GREATER THAN OR EQUAL TO ELITE VALUE
    if (value >= benchmarks.elite) return "elite";
    // CHECK IF VALUE IS GREATER THAN OR EQUAL TO HIGH VALUE
    if (value >= benchmarks.high) return "high";
    // CHECK IF VALUE IS GREATER THAN OR EQUAL TO MEDIUM VALUE
    if (value >= benchmarks.medium) return "medium";
    // RETURN LOW RATING
    return "low";
  }
  // IF METRIC IS LEAD TIME FOR CHANGES OR MEAN TIME TO RECOVERY
  if (metric === "leadTimeForChanges" || metric === "meanTimeToRecovery") {
    // CHECK IF VALUE IS LESS THAN OR EQUAL TO ELITE VALUE
    if (value <= benchmarks.elite) return "elite";
    // CHECK IF VALUE IS LESS THAN OR EQUAL TO HIGH VALUE
    if (value <= benchmarks.high) return "high";
    // CHECK IF VALUE IS LESS THAN OR EQUAL TO MEDIUM VALUE
    if (value <= benchmarks.medium) return "medium";
    // RETURN LOW RATING
    return "low";
  }
  // DEFAULT RETURN LOW RATING
  return "low";
};

/**
 * CALCULATE OVERALL RATING
 * @param metrics - Individual Metric Ratings
 * @returns Overall Rating (Elite, High, Medium, Low)
 */
// <== CALCULATE OVERALL RATING ==>
const calculateOverallRating = (
  metrics: Array<"elite" | "high" | "medium" | "low">
): "elite" | "high" | "medium" | "low" => {
  // GET SCORES FOR RATINGS
  const scores = { elite: 4, high: 3, medium: 2, low: 1 };
  // CALCULATE AVERAGE SCORE
  const avgScore =
    metrics.reduce((sum, rating) => sum + scores[rating], 0) / metrics.length;
  // CHECK IF AVERAGE SCORE IS GREATER THAN OR EQUAL TO 3.5
  if (avgScore >= 3.5) return "elite";
  // CHECK IF AVERAGE SCORE IS GREATER THAN OR EQUAL TO 2.5
  if (avgScore >= 2.5) return "high";
  // CHECK IF AVERAGE SCORE IS GREATER THAN OR EQUAL TO 1.5
  if (avgScore >= 1.5) return "medium";
  // RETURN LOW RATING
  return "low";
};

/**
 * GET DORA METRICS FOR WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DORA METRICS ==>
export const getDORAMetrics = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as AuthenticatedRequest).id;
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
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING WORKSPACE ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid Workspace ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER MEMBERSHIP
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
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF NO LINKED REPOSITORIES, RETURN EMPTY METRICS
  if (
    !workspace.linkedRepositories ||
    workspace.linkedRepositories.length === 0
  ) {
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      data: {
        deploymentFrequency: {
          value: 0,
          unit: "per_day",
          rating: "low",
          trend: [],
        },
        leadTimeForChanges: {
          value: 0,
          unit: "hours",
          rating: "low",
          trend: [],
        },
        changeFailureRate: {
          value: 0,
          unit: "percentage",
          rating: "elite",
          trend: [],
        },
        meanTimeToRecovery: {
          value: 0,
          unit: "hours",
          rating: "elite",
          trend: [],
        },
        overallRating: "low",
        lastUpdated: new Date(),
        message:
          "No repositories linked. Link repositories to see DORA metrics.",
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CALCULATE DATE RANGE (LAST 30 DAYS)
  const endDate = new Date();
  // CALCULATE START DATE (LAST 30 DAYS)
  const startDate = new Date();
  // SET START DATE TO 30 DAYS AGO
  startDate.setDate(startDate.getDate() - 30);
  // COLLECT DATA FROM ALL REPOSITORIES
  let totalDeployments = 0;
  // COUNT OF FAILED DEPLOYMENTS
  let failedDeployments = 0;
  // ARRAY OF LEAD TIMES
  let leadTimes: number[] = [];
  // ARRAY OF RECOVERY TIMES
  let recoveryTimes: number[] = [];
  // ARRAY OF WEEKLY DEPLOYMENTS
  const weeklyDeployments: number[] = [0, 0, 0, 0];
  // ARRAY OF WEEKLY LEAD TIMES
  const weeklyLeadTimes: number[] = [0, 0, 0, 0];
  // ARRAY OF WEEKLY FAILURE RATES
  const weeklyFailureRates: number[] = [0, 0, 0, 0];
  // ARRAY OF WEEKLY MTTR
  const weeklyMTTR: number[] = [0, 0, 0, 0];
  // ITERATE THROUGH LINKED REPOSITORIES
  for (const repo of workspace.linkedRepositories) {
    try {
      // GET DEPLOYMENTS
      const { data: deployments } = await octokit.repos.listDeployments({
        owner: repo.owner,
        repo: repo.name,
        per_page: 100,
      });
      // FILTER DEPLOYMENTS IN DATE RANGE
      const recentDeployments = deployments.filter(
        (d) => new Date(d.created_at) >= startDate
      );
      // ADD NUMBER OF RECENT DEPLOYMENTS TO TOTAL DEPLOYMENTS
      totalDeployments += recentDeployments.length;
      // GET DEPLOYMENT STATUSES FOR EACH DEPLOYMENT
      for (const deployment of recentDeployments.slice(0, 20)) {
        // GET DEPLOYMENT STATUSES
        try {
          // GET DEPLOYMENT STATUSES
          const { data: statuses } = await octokit.repos.listDeploymentStatuses(
            {
              owner: repo.owner,
              repo: repo.name,
              deployment_id: deployment.id,
              per_page: 10,
            }
          );
          // CHECK IF ANY STATUS IS FAILURE/ERROR
          const hasFailed = statuses.some(
            (s) => s.state === "failure" || s.state === "error"
          );
          if (hasFailed) failedDeployments++;
          // CALCULATE LEAD TIME (COMMIT TO DEPLOYMENT)
          if (deployment.sha) {
            // GET COMMIT
            try {
              // GET COMMIT
              const { data: commit } = await octokit.repos.getCommit({
                owner: repo.owner,
                repo: repo.name,
                ref: deployment.sha,
              });
              // GET COMMIT DATE
              const commitDate = new Date(commit.commit.author?.date || "");
              // GET DEPLOYMENT DATE
              const deployDate = new Date(deployment.created_at);
              // CALCULATE LEAD TIME
              const leadTime =
                (deployDate.getTime() - commitDate.getTime()) /
                (1000 * 60 * 60);
              // ADD LEAD TIME TO ARRAY
              if (leadTime > 0) leadTimes.push(leadTime);
            } catch {
              // IGNORE COMMIT FETCH ERRORS
            }
          }
          // ASSIGN TO WEEKLY BUCKETS
          const deploymentDate = new Date(deployment.created_at);
          // GET WEEK INDEX
          const weekIndex = Math.floor(
            (endDate.getTime() - deploymentDate.getTime()) /
              (7 * 24 * 60 * 60 * 1000)
          );
          // ADD DEPLOYMENT TO WEEKLY BUCKET
          if (weekIndex >= 0 && weekIndex < 4) {
            // GET BUCKET INDEX
            const bucketIndex = 3 - weekIndex;
            // ADD DEPLOYMENT TO WEEKLY BUCKET
            weeklyDeployments[bucketIndex] =
              (weeklyDeployments[bucketIndex] || 0) + 1;
          }
        } catch {
          // IGNORE DEPLOYMENT STATUS FETCH ERRORS
        }
      }
      // GET ISSUES FOR MTTR CALCULATION (BUG ISSUES)
      try {
        // GET ISSUES FOR MTTR CALCULATION (BUG ISSUES)
        const { data: issues } = await octokit.issues.listForRepo({
          owner: repo.owner,
          repo: repo.name,
          state: "closed",
          labels: "bug",
          since: startDate.toISOString(),
          per_page: 50,
        });
        // CALCULATE RECOVERY TIMES
        for (const issue of issues) {
          // CHECK IF ISSUE IS CLOSED
          if (issue.closed_at) {
            // GET CREATED AT DATE
            const createdAt = new Date(issue.created_at);
            // GET CLOSED AT DATE
            const closedAt = new Date(issue.closed_at);
            // CALCULATE RECOVERY TIME
            const recoveryTime =
              (closedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            // ADD RECOVERY TIME TO ARRAY
            if (recoveryTime > 0) recoveryTimes.push(recoveryTime);
            // GET WEEK INDEX
            const weekIndex = Math.floor(
              (endDate.getTime() - closedAt.getTime()) /
                (7 * 24 * 60 * 60 * 1000)
            );
            // ASSIGN TO WEEKLY BUCKETS
            if (weekIndex >= 0 && weekIndex < 4) {
              // GET BUCKET INDEX
              const bucketIndex = 3 - weekIndex;
              // GET CURRENT MTTR
              const currentMTTR = weeklyMTTR[bucketIndex] || 0;
              // CALCULATE NEW MTTR
              weeklyMTTR[bucketIndex] =
                currentMTTR > 0
                  ? (currentMTTR + recoveryTime) / 2
                  : recoveryTime;
            }
          }
        }
      } catch {
        // IGNORE ISSUES FETCH ERRORS
      }
    } catch {
      // IGNORE REPOSITORY-LEVEL ERRORS AND CONTINUE
    }
  }
  // CALCULATE METRICS
  const deploymentFreqValue = totalDeployments / 30;
  // CALCULATE AVERAGE LEAD TIME
  const avgLeadTime =
    leadTimes.length > 0
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : 0;
  // CALCULATE CHANGE FAILURE RATE
  const changeFailureRateValue =
    totalDeployments > 0 ? (failedDeployments / totalDeployments) * 100 : 0;
  // CALCULATE AVERAGE MTTR
  const avgMTTR =
    recoveryTimes.length > 0
      ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
      : 0;
  // CALCULATE WEEKLY TRENDS
  for (let i = 0; i < 4; i++) {
    // GET DEPLOY COUNT FOR WEEK
    const deployCount = weeklyDeployments[i] || 0;
    // CHECK IF DEPLOY COUNT IS GREATER THAN 0
    if (deployCount > 0) {
      // CALCULATE AVERAGE LEAD TIME FOR WEEK
      weeklyLeadTimes[i] = avgLeadTime;
      // CALCULATE CHANGE FAILURE RATE FOR WEEK
      weeklyFailureRates[i] = changeFailureRateValue;
    }
  }
  // RATE DEPLOYMENT FREQUENCY METRIC
  const dfRating = rateMetric("deploymentFrequency", deploymentFreqValue);
  // RATE LEAD TIME FOR CHANGES METRIC
  const ltRating = rateMetric("leadTimeForChanges", avgLeadTime);
  // RATE CHANGE FAILURE RATE METRIC
  const cfrRating = rateMetric("changeFailureRate", changeFailureRateValue);
  // RATE MEAN TIME TO RECOVERY METRIC
  const mttrRating = rateMetric("meanTimeToRecovery", avgMTTR);
  // BUILD DORAMETRICS RESPONSE
  const metrics: DORAMetrics = {
    deploymentFrequency: {
      value: Math.round(deploymentFreqValue * 100) / 100,
      unit: "per_day",
      rating: dfRating,
      trend: weeklyDeployments,
    },
    leadTimeForChanges: {
      value: Math.round(avgLeadTime * 10) / 10,
      unit: avgLeadTime > 24 ? "days" : "hours",
      rating: ltRating,
      trend: weeklyLeadTimes.map((v) => Math.round(v * 10) / 10),
    },
    changeFailureRate: {
      value: Math.round(changeFailureRateValue * 10) / 10,
      unit: "percentage",
      rating: cfrRating,
      trend: weeklyFailureRates.map((v) => Math.round(v * 10) / 10),
    },
    meanTimeToRecovery: {
      value: Math.round(avgMTTR * 10) / 10,
      unit: avgMTTR > 24 ? "days" : "hours",
      rating: mttrRating,
      trend: weeklyMTTR.map((v) => Math.round(v * 10) / 10),
    },
    overallRating: calculateOverallRating([
      dfRating,
      ltRating,
      cfrRating,
      mttrRating,
    ]),
    lastUpdated: new Date(),
  };
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    data: metrics,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET DEPLOYMENT HISTORY FOR WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DEPLOYMENT HISTORY ==>
export const getDeploymentHistory = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as AuthenticatedRequest).id;
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
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
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
  // CHECKING USER MEMBERSHIP
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
      data: [],
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // COLLECT DEPLOYMENTS FROM ALL REPOSITORIES
  const allDeployments: Array<{
    id: number;
    repository: string;
    environment: string;
    status: string;
    creator: string;
    createdAt: string;
    sha: string;
  }> = [];
  // ITERATE THROUGH LINKED REPOSITORIES
  for (const repo of workspace.linkedRepositories) {
    // TRY TO GET DEPLOYMENTS FOR REPOSITORY
    try {
      // GET DEPLOYMENTS FOR REPOSITORY
      const { data: deployments } = await octokit.repos.listDeployments({
        owner: repo.owner,
        repo: repo.name,
        per_page: 20,
      });
      // ITERATE THROUGH DEPLOYMENTS
      for (const deployment of deployments) {
        // GET LATEST STATUS
        let status = "pending";
        // TRY TO GET DEPLOYMENT STATUSES
        try {
          // GET DEPLOYMENT STATUSES
          const { data: statuses } = await octokit.repos.listDeploymentStatuses(
            {
              owner: repo.owner,
              repo: repo.name,
              deployment_id: deployment.id,
              per_page: 1,
            }
          );
          // CHECK IF STATUSES ARE AVAILABLE
          if (statuses.length > 0 && statuses[0]) {
            status = statuses[0].state;
          }
        } catch {
          // IGNORE STATUS FETCH ERRORS
        }
        // ADD DEPLOYMENT TO ALL DEPLOYMENTS ARRAY
        allDeployments.push({
          id: deployment.id,
          repository: repo.fullName,
          environment: deployment.environment || "production",
          status,
          creator: deployment.creator?.login || "unknown",
          createdAt: deployment.created_at,
          sha: deployment.sha.substring(0, 7),
        });
      }
    } catch {
      // IGNORE REPOSITORY-LEVEL ERRORS
    }
  }
  // SORT BY CREATED AT (DESCENDING)
  allDeployments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: allDeployments.length,
    data: allDeployments.slice(0, 50),
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET WORKFLOW RUNS SUMMARY FOR WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKFLOW RUNS SUMMARY ==>
export const getWorkflowRunsSummary = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as AuthenticatedRequest).id;
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
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
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
  // CHECKING USER MEMBERSHIP
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
        total: 0,
        success: 0,
        failure: 0,
        pending: 0,
        cancelled: 0,
        runs: [],
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // TOTAL NUMBER OF RUNS
  let total = 0;
  // COUNT OF SUCCESSFUL RUNS
  let success = 0;
  // COUNT OF SUCCESSFUL RUNS
  let failure = 0;
  // COUNT OF FAILED RUNS
  let pending = 0;
  // COUNT OF PENDING RUNS
  let cancelled = 0;
  // COUNT OF CANCELLED RUNS
  const recentRuns: Array<{
    id: number;
    repository: string;
    workflowName: string;
    status: string;
    conclusion: string | null;
    createdAt: string;
    duration: number;
  }> = [];
  // ITERATE THROUGH LINKED REPOSITORIES
  for (const repo of workspace.linkedRepositories) {
    // TRY TO GET WORKFLOW RUNS FOR REPOSITORY
    try {
      // GET WORKFLOW RUNS FOR REPOSITORY
      const { data } = await octokit.actions.listWorkflowRunsForRepo({
        owner: repo.owner,
        repo: repo.name,
        per_page: 30,
      });
      // ITERATE THROUGH WORKFLOW RUNS
      for (const run of data.workflow_runs) {
        // INCREMENT TOTAL NUMBER OF RUNS
        total++;
        // CHECK IF RUN IS SUCCESSFUL
        if (run.conclusion === "success") success++;
        // CHECK IF RUN IS FAILED
        else if (run.conclusion === "failure") failure++;
        // CHECK IF RUN IS CANCELLED
        else if (run.conclusion === "cancelled") cancelled++;
        // CHECK IF RUN IS PENDING
        else if (run.status === "in_progress" || run.status === "queued")
          pending++;
        // CALCULATE DURATION
        const duration = run.updated_at
          ? // CHECK IF UPDATED AT IS AVAILABLE
            Math.round(
              (new Date(run.updated_at).getTime() -
                new Date(run.created_at).getTime()) /
                1000
            )
          : 0;
        // ADD RUN TO RECENT RUNS ARRAY
        recentRuns.push({
          id: run.id,
          repository: repo.fullName,
          workflowName: run.name || "Unknown",
          status: run.status || "unknown",
          conclusion: run.conclusion,
          createdAt: run.created_at,
          duration,
        });
      }
    } catch {
      // IGNORE REPOSITORY-LEVEL ERRORS
    }
  }
  // SORT BY CREATED AT (DESCENDING)
  recentRuns.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      total,
      success,
      failure,
      pending,
      cancelled,
      successRate: total > 0 ? Math.round((success / total) * 100) : 0,
      runs: recentRuns.slice(0, 30),
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

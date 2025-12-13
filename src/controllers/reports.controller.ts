// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";
import { FocusSession } from "../models/focusSession.model.js";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest {
  // <== USER ID ==>
  id: string;
}

// <== REPORT PERIOD TYPE ==>
type ReportPeriod = "week" | "month" | "quarter" | "year";

// <== GET DATE RANGE HELPER ==>
const getDateRange = (
  period: ReportPeriod
): { startDate: Date; endDate: Date } => {
  // GET END DATE (NOW)
  const endDate = new Date();
  // GET START DATE BASED ON PERIOD
  const startDate = new Date();
  // SET START DATE BASED ON PERIOD
  switch (period) {
    // WEEK
    case "week":
      // SET START DATE TO 7 DAYS AGO
      startDate.setDate(startDate.getDate() - 7);
      break;
    // MONTH
    case "month":
      // SET START DATE TO 1 MONTH AGO
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    // QUARTER
    case "quarter":
      // SET START DATE TO 3 MONTHS AGO
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    // YEAR
    case "year":
      // SET START DATE TO 1 YEAR AGO
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      // DEFAULT TO 1 MONTH AGO
      startDate.setMonth(startDate.getMonth() - 1);
  }
  // RETURN DATE RANGE
  return { startDate, endDate };
};

// <== GET DAY NAME HELPER ==>
const getDayName = (dayOfWeek: number): string => {
  // DAY NAMES ARRAY
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // RETURN DAY NAME
  return days[dayOfWeek] || "Unknown";
};

/**
 * GET PERSONAL REPORT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PERSONAL REPORT ==>
export const getPersonalReport = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
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
  // GETTING PERIOD FROM REQUEST QUERY
  const period = (req.query.period as ReportPeriod) || "month";
  // GET DATE RANGE
  const { startDate, endDate } = getDateRange(period);
  // USER OBJECT ID
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  // GET TASK COMPLETION STATS
  const taskStats = await Task.aggregate([
    // MATCH USER ID, NOT TRASHED, COMPLETED WITHIN DATE RANGE
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
      },
    },
    // GROUP TO GET COUNTS
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "completed"] },
                  { $gte: ["$completedAt", startDate] },
                  { $lte: ["$completedAt", endDate] },
                ],
              },
              1,
              0,
            ],
          },
        },
        inProgressTasks: {
          $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
        },
        pendingTasks: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        overdueTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$status", "completed"] },
                  { $lt: ["$dueDate", new Date()] },
                  { $ne: ["$dueDate", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
        highPriorityCompleted: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "completed"] },
                  { $eq: ["$priority", "high"] },
                  { $gte: ["$completedAt", startDate] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).exec();
  // DAILY TASK COMPLETION
  const dailyCompletion = await Task.aggregate([
    // MATCH COMPLETED TASKS IN DATE RANGE
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
        status: "completed",
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    // GROUP BY DATE
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$completedAt" },
        },
        count: { $sum: 1 },
      },
    },
    // SORT BY DATE
    {
      $sort: { _id: 1 },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        date: "$_id",
        completed: "$count",
      },
    },
  ]).exec();
  // PRIORITY DISTRIBUTION
  const priorityDistribution = await Task.aggregate([
    // MATCH COMPLETED TASKS IN DATE RANGE
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
        status: "completed",
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    // GROUP BY PRIORITY
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        priority: "$_id",
        count: 1,
      },
    },
  ]).exec();
  // MOST PRODUCTIVE DAY
  const productiveDay = await Task.aggregate([
    // MATCH COMPLETED TASKS IN DATE RANGE
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
        status: "completed",
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    // GROUP BY DAY OF WEEK
    {
      $group: {
        _id: { $dayOfWeek: "$completedAt" },
        count: { $sum: 1 },
      },
    },
    // SORT BY COUNT DESCENDING
    {
      $sort: { count: -1 },
    },
    // LIMIT TO 1
    {
      $limit: 1,
    },
  ]).exec();
  // MOST PRODUCTIVE HOUR
  const productiveHour = await Task.aggregate([
    // MATCH COMPLETED TASKS IN DATE RANGE
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
        status: "completed",
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    // GROUP BY HOUR
    {
      $group: {
        _id: { $hour: "$completedAt" },
        count: { $sum: 1 },
      },
    },
    // SORT BY COUNT DESCENDING
    {
      $sort: { count: -1 },
    },
    // LIMIT TO 1
    {
      $limit: 1,
    },
  ]).exec();
  // FOCUS SESSION STATS
  const focusStats = await FocusSession.aggregate([
    // MATCH USER ID AND DATE RANGE
    {
      $match: {
        userId: userObjectId,
        startedAt: { $gte: startDate, $lte: endDate },
      },
    },
    // GROUP TO GET STATS
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        completedSessions: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        totalDuration: { $sum: "$duration" },
        totalPomodoros: { $sum: "$pomodorosCompleted" },
      },
    },
  ]).exec();
  // PROJECT TASK DISTRIBUTION
  const projectDistribution = await Task.aggregate([
    // MATCH COMPLETED TASKS IN DATE RANGE
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
        status: "completed",
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    // LOOKUP PROJECT
    {
      $lookup: {
        from: "projects",
        localField: "projectId",
        foreignField: "_id",
        as: "project",
      },
    },
    // UNWIND PROJECT (HANDLE EMPTY ARRAY)
    {
      $unwind: {
        path: "$project",
        preserveNullAndEmptyArrays: true,
      },
    },
    // GROUP BY PROJECT
    {
      $group: {
        _id: "$projectId",
        projectName: { $first: "$project.title" },
        count: { $sum: 1 },
      },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        projectId: "$_id",
        projectName: { $ifNull: ["$projectName", "Unassigned"] },
        tasksCompleted: "$count",
      },
    },
    // SORT BY COUNT DESCENDING
    {
      $sort: { tasksCompleted: -1 },
    },
    // LIMIT TO TOP 10
    {
      $limit: 10,
    },
  ]).exec();
  // VELOCITY TREND (TASKS PER WEEK)
  const velocityTrend = await Task.aggregate([
    // MATCH COMPLETED TASKS IN LAST 12 WEEKS
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
        status: "completed",
        completedAt: {
          $gte: new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000),
        },
      },
    },
    // GROUP BY WEEK
    {
      $group: {
        _id: {
          year: { $isoWeekYear: "$completedAt" },
          week: { $isoWeek: "$completedAt" },
        },
        count: { $sum: 1 },
      },
    },
    // SORT BY YEAR AND WEEK
    {
      $sort: { "_id.year": 1, "_id.week": 1 },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        week: {
          $concat: ["W", { $toString: "$_id.week" }],
        },
        completed: "$count",
      },
    },
  ]).exec();
  // CALCULATE AVERAGES AND METRICS
  const stats = taskStats[0] || {
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    highPriorityCompleted: 0,
  };
  // FOCUS SESSION STATS
  const focus = focusStats[0] || {
    totalSessions: 0,
    completedSessions: 0,
    totalDuration: 0,
    totalPomodoros: 0,
  };
  // CALCULATE COMPLETION RATE
  const totalTracked =
    stats.completedTasks + stats.inProgressTasks + stats.pendingTasks;
  // CALCULATE COMPLETION RATE
  const completionRate =
    totalTracked > 0
      ? Math.round((stats.completedTasks / totalTracked) * 100)
      : 0;
  // CALCULATE VELOCITY (TASKS PER WEEK)
  const weeksInPeriod =
    period === "week"
      ? 1
      : period === "month"
      ? 4
      : period === "quarter"
      ? 13
      : 52;
  // CALCULATE VELOCITY (TASKS PER WEEK)
  const velocity =
    weeksInPeriod > 0
      ? Math.round((stats.completedTasks / weeksInPeriod) * 10) / 10
      : 0;
  // BUILD RESPONSE
  res.status(200).json({
    success: true,
    data: {
      summary: {
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        inProgressTasks: stats.inProgressTasks,
        pendingTasks: stats.pendingTasks,
        overdueTasks: stats.overdueTasks,
        completionRate,
        velocity,
        highPriorityCompleted: stats.highPriorityCompleted,
      },
      focusStats: {
        totalSessions: focus.totalSessions,
        completedSessions: focus.completedSessions,
        totalFocusTime: Math.round(focus.totalDuration),
        avgSessionLength:
          focus.totalSessions > 0
            ? Math.round(focus.totalDuration / focus.totalSessions)
            : 0,
        totalPomodoros: focus.totalPomodoros,
      },
      productivity: {
        mostProductiveDay: productiveDay[0]
          ? getDayName(productiveDay[0]._id - 1)
          : null,
        mostProductiveHour: productiveHour[0] ? productiveHour[0]._id : null,
      },
      charts: {
        dailyCompletion,
        priorityDistribution,
        projectDistribution,
        velocityTrend,
      },
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET PROJECT REPORT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PROJECT REPORT ==>
export const getProjectReport = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
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
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const { projectId } = req.params;
  // GETTING PERIOD FROM REQUEST QUERY
  const period = (req.query.period as ReportPeriod) || "month";
  // GET DATE RANGE
  const { startDate, endDate } = getDateRange(period);
  // PROJECT OBJECT ID
  const projectObjectId = new mongoose.Types.ObjectId(String(projectId));
  // USER OBJECT ID
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  // VERIFY PROJECT OWNERSHIP
  const project = await Project.findOne({
    _id: projectObjectId,
    userId: userObjectId,
    isTrashed: false,
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
  // TASK STATISTICS FOR PROJECT
  const taskStats = await Task.aggregate([
    // MATCH PROJECT ID
    {
      $match: {
        projectId: projectObjectId,
        userId: userObjectId,
        isTrashed: false,
      },
    },
    // GROUP TO GET COUNTS
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        inProgressTasks: {
          $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
        },
        pendingTasks: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        overdueTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$status", "completed"] },
                  { $lt: ["$dueDate", new Date()] },
                  { $ne: ["$dueDate", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).exec();
  // BURNDOWN DATA (REMAINING TASKS OVER TIME)
  const burndownData = await Task.aggregate([
    // MATCH PROJECT TASKS
    {
      $match: {
        projectId: projectObjectId,
        userId: userObjectId,
        isTrashed: false,
        createdAt: { $lte: endDate },
      },
    },
    // ADD FIELDS FOR CREATED AND COMPLETED DATES
    {
      $addFields: {
        createdDate: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        completedDate: {
          $cond: [
            { $eq: ["$status", "completed"] },
            { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
            null,
          ],
        },
      },
    },
    // GROUP BY DATE TO GET RUNNING TOTALS
    {
      $group: {
        _id: "$createdDate",
        created: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$completedDate", null] },
                  { $eq: ["$completedDate", "$createdDate"] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    // SORT BY DATE
    {
      $sort: { _id: 1 },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        date: "$_id",
        created: 1,
        completed: 1,
      },
    },
  ]).exec();
  // TASK STATUS OVER TIME
  const completionTrend = await Task.aggregate([
    // MATCH COMPLETED PROJECT TASKS IN DATE RANGE
    {
      $match: {
        projectId: projectObjectId,
        userId: userObjectId,
        isTrashed: false,
        status: "completed",
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    // GROUP BY DATE
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
        completed: { $sum: 1 },
      },
    },
    // SORT BY DATE
    {
      $sort: { _id: 1 },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        date: "$_id",
        completed: 1,
      },
    },
  ]).exec();
  // STATUS DISTRIBUTION
  const statusDistribution = await Task.aggregate([
    // MATCH PROJECT TASKS
    {
      $match: {
        projectId: projectObjectId,
        userId: userObjectId,
        isTrashed: false,
      },
    },
    // GROUP BY STATUS
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        status: "$_id",
        count: 1,
      },
    },
  ]).exec();
  // PRIORITY DISTRIBUTION
  const priorityDistribution = await Task.aggregate([
    // MATCH PROJECT TASKS
    {
      $match: {
        projectId: projectObjectId,
        userId: userObjectId,
        isTrashed: false,
      },
    },
    // GROUP BY PRIORITY
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
    // PROJECT FINAL SHAPE
    {
      $project: {
        _id: 0,
        priority: "$_id",
        count: 1,
      },
    },
  ]).exec();
  // CALCULATE METRICS
  const stats = taskStats[0] || {
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
  };
  // CALCULATE PROGRESS PERCENTAGE
  const progressPercentage =
    stats.totalTasks > 0
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;
  // CALCULATE REMAINING TASKS
  const remainingTasks = stats.totalTasks - stats.completedTasks;
  // BUILD RESPONSE
  res.status(200).json({
    success: true,
    data: {
      project: {
        id: project._id,
        title: project.title,
        description: project.description,
        status: project.status,
        dueDate: project.dueDate,
      },
      summary: {
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        inProgressTasks: stats.inProgressTasks,
        pendingTasks: stats.pendingTasks,
        overdueTasks: stats.overdueTasks,
        remainingTasks,
        progressPercentage,
      },
      charts: {
        burndownData,
        completionTrend,
        statusDistribution,
        priorityDistribution,
      },
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET REPORTS OVERVIEW
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPORTS OVERVIEW ==>
export const getReportsOverview = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
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
  // USER OBJECT ID
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  // GET TODAY DATE
  const today = new Date();
  // SET HOURS TO 0
  today.setHours(0, 0, 0, 0);
  // GET WEEK AGO DATE
  const weekAgo = new Date(today);
  // SET DATE TO 7 DAYS AGO
  weekAgo.setDate(weekAgo.getDate() - 7);
  // GET MONTH AGO DATE
  const monthAgo = new Date(today);
  // SET DATE TO 1 MONTH AGO
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  // QUICK STATS
  const quickStats = await Task.aggregate([
    // MATCH USER'S TASKS
    {
      $match: {
        userId: userObjectId,
        isTrashed: false,
      },
    },
    // GROUP TO GET STATS
    {
      $group: {
        _id: null,
        // THIS WEEK COMPLETED
        completedThisWeek: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "completed"] },
                  { $gte: ["$completedAt", weekAgo] },
                ],
              },
              1,
              0,
            ],
          },
        },
        // THIS MONTH COMPLETED
        completedThisMonth: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "completed"] },
                  { $gte: ["$completedAt", monthAgo] },
                ],
              },
              1,
              0,
            ],
          },
        },
        // ACTIVE TASKS
        activeTasks: {
          $sum: {
            $cond: [{ $ne: ["$status", "completed"] }, 1, 0],
          },
        },
        // OVERDUE TASKS
        overdueTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$status", "completed"] },
                  { $lt: ["$dueDate", new Date()] },
                  { $ne: ["$dueDate", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).exec();
  // ACTIVE PROJECTS COUNT
  const activeProjectsCount = await Project.countDocuments({
    userId: userObjectId,
    isTrashed: false,
    status: { $ne: "completed" },
  }).exec();
  // FOCUS TIME THIS WEEK
  const focusTimeThisWeek = await FocusSession.aggregate([
    // MATCH USER'S SESSIONS THIS WEEK
    {
      $match: {
        userId: userObjectId,
        startedAt: { $gte: weekAgo },
        status: "completed",
      },
    },
    // SUM DURATION
    {
      $group: {
        _id: null,
        totalMinutes: { $sum: "$duration" },
      },
    },
  ]).exec();
  // BUILD RESPONSE
  const stats = quickStats[0] || {
    completedThisWeek: 0,
    completedThisMonth: 0,
    activeTasks: 0,
    overdueTasks: 0,
  };

  res.status(200).json({
    success: true,
    data: {
      tasksCompletedThisWeek: stats.completedThisWeek,
      tasksCompletedThisMonth: stats.completedThisMonth,
      activeTasks: stats.activeTasks,
      overdueTasks: stats.overdueTasks,
      activeProjects: activeProjectsCount,
      focusTimeThisWeek: focusTimeThisWeek[0]?.totalMinutes || 0,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import expressAsyncHandler from "express-async-handler";
import { FocusSession } from "../models/focusSession.model.js";

// <== TYPES ==>
interface AuthenticatedRequest {
  // ID FIELD
  id?: string;
}

/**
 * START A FOCUS SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== START SESSION ==>
export const startSession = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION DATA FROM REQUEST BODY
  const { taskId, title, plannedDuration, isPomodoroMode, pomodoroSettings } =
    req.body;
  // CHECK IF USER HAS AN ACTIVE SESSION
  const activeSession = await FocusSession.findOne({
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: "active",
  })
    .lean()
    .exec();
  // IF USER HAS AN ACTIVE SESSION, RETURN 400 ERROR
  if (activeSession) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "You already have an active focus session!",
      success: false,
      data: { activeSessionId: activeSession._id },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE TASK ID IF PROVIDED
  if (taskId) {
    // CHECK IF TASK EXISTS
    const task = await Task.findOne({
      _id: new mongoose.Types.ObjectId(String(taskId)),
      userId: new mongoose.Types.ObjectId(String(userId)),
      isTrashed: false,
    })
      .lean()
      .exec();
    // IF TASK NOT FOUND, RETURN 404 ERROR
    if (!task) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Task not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
  // CREATE NEW FOCUS SESSION
  const session = await FocusSession.create({
    userId: new mongoose.Types.ObjectId(String(userId)),
    taskId: taskId ? new mongoose.Types.ObjectId(String(taskId)) : null,
    title: title || null,
    plannedDuration: plannedDuration ?? 0,
    isPomodoroMode: isPomodoroMode || false,
    pomodoroSettings: pomodoroSettings || {},
    startedAt: new Date(),
    status: "active",
  });
  // POPULATE TASK IF PROVIDED
  const populatedSession = await FocusSession.findById(session._id)
    .populate("taskId", "title taskKey status priority")
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(201).json({
    success: true,
    message: "Focus session started!",
    data: populatedSession,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * PAUSE A FOCUS SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== PAUSE SESSION ==>
export const pauseSession = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION ID FROM REQUEST PARAMS
  const { sessionId } = req.params;
  // IF SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Session ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE SESSION
  const session = await FocusSession.findOne({
    _id: new mongoose.Types.ObjectId(String(sessionId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: "active",
  }).exec();
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (!session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Active session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // SET PAUSED AT
  session.pausedAt = new Date();
  // SET STATUS TO PAUSED
  session.status = "paused";
  // ADD NEW BREAK ENTRY
  session.breaks.push({
    startedAt: new Date(),
    endedAt: null,
    duration: 0,
  });
  // SAVE SESSION
  await session.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Focus session paused!",
    data: session,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * RESUME A FOCUS SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RESUME SESSION ==>
export const resumeSession = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION ID FROM REQUEST PARAMS
  const { sessionId } = req.params;
  // IF SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Session ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE SESSION
  const session = await FocusSession.findOne({
    _id: new mongoose.Types.ObjectId(String(sessionId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: "paused",
  }).exec();
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (!session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Paused session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CALCULATE PAUSE DURATION
  const pausedAt = session.pausedAt || new Date();
  // CALCULATE PAUSE DURATION
  const pauseDuration = (new Date().getTime() - pausedAt.getTime()) / 1000 / 60;
  // UPDATE TOTAL PAUSE DURATION
  session.totalPauseDuration =
    (session.totalPauseDuration || 0) + pauseDuration;
  // UPDATE LAST BREAK ENTRY
  if (session.breaks.length > 0) {
    // GET LAST BREAK
    const lastBreak = session.breaks[session.breaks.length - 1];
    // IF LAST BREAK EXISTS, UPDATE ENDED AT AND DURATION
    if (lastBreak) {
      // UPDATE ENDED AT
      lastBreak.endedAt = new Date();
      // UPDATE DURATION
      lastBreak.duration = pauseDuration;
    }
  }
  // SET PAUSED AT TO NULL
  (session as any).pausedAt = null;
  // SET STATUS TO ACTIVE
  session.status = "active";
  // SAVE SESSION
  await session.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Focus session resumed!",
    data: session,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * END A FOCUS SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== END SESSION ==>
export const endSession = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION ID FROM REQUEST PARAMS
  const { sessionId } = req.params;
  // GETTING NOTES AND STATUS FROM REQUEST BODY
  const { notes, completed } = req.body;
  // IF SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Session ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE SESSION
  const session = await FocusSession.findOne({
    _id: new mongoose.Types.ObjectId(String(sessionId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: { $in: ["active", "paused"] },
  }).exec();
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (!session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF SESSION WAS PAUSED, CALCULATE FINAL PAUSE DURATION
  if (session.status === "paused" && session.pausedAt) {
    // CALCULATE PAUSE DURATION
    const pauseDuration =
      (new Date().getTime() - session.pausedAt.getTime()) / 1000 / 60;
    // UPDATE TOTAL PAUSE DURATION
    session.totalPauseDuration =
      (session.totalPauseDuration || 0) + pauseDuration;
    // UPDATE LAST BREAK ENTRY
    if (session.breaks.length > 0) {
      // GET LAST BREAK
      const lastBreak = session.breaks[session.breaks.length - 1];
      // IF LAST BREAK EXISTS, UPDATE ENDED AT AND DURATION
      if (lastBreak) {
        // UPDATE ENDED AT
        lastBreak.endedAt = new Date();
        // UPDATE DURATION
        lastBreak.duration = pauseDuration;
      }
    }
  }
  // SET END TIME AND STATUS
  session.endedAt = new Date();
  // SET STATUS TO COMPLETED IF COMPLETED IS TRUE, OTHERWISE SET TO ABANDONED
  session.status = completed === true ? "completed" : "abandoned";
  // CALCULATE TOTAL DURATION (EXCLUDING BREAKS)
  const totalElapsed =
    (session.endedAt.getTime() - session.startedAt.getTime()) / 1000 / 60;
  session.duration = Math.max(
    0,
    totalElapsed - (session.totalPauseDuration || 0)
  );
  // SET NOTES IF PROVIDED
  if (notes) {
    // SET NOTES
    session.notes = notes;
  }
  // INCREMENT POMODOROS COMPLETED IF IN POMODORO MODE AND COMPLETED
  if (session.isPomodoroMode && completed === true) {
    // INCREMENT POMODOROS COMPLETED
    session.pomodorosCompleted = (session.pomodorosCompleted || 0) + 1;
  }
  // SAVE SESSION
  await session.save();
  // POPULATE TASK IF EXISTS
  const populatedSession = await FocusSession.findById(session._id)
    // POPULATE TASK WITH TITLE, TASK KEY, STATUS AND PRIORITY
    .populate("taskId", "title taskKey status priority")
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: `Focus session ${completed ? "completed" : "ended"}!`,
    data: populatedSession,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET ACTIVE SESSION FOR USER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ACTIVE SESSION ==>
export const getActiveSession = expressAsyncHandler(async (req, res) => {
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
  // FIND ACTIVE OR PAUSED SESSION
  const session = await FocusSession.findOne({
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: { $in: ["active", "paused"] },
  })
    .populate("taskId", "title taskKey status priority")
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: session,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET SESSION HISTORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET SESSION HISTORY ==>
export const getSessionHistory = expressAsyncHandler(async (req, res) => {
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
  // GETTING QUERY PARAMETERS
  const { limit, page, status, taskId, startDate, endDate } = req.query;
  // SETTING PAGE NUMBER FOR QUERY
  const pageNumber = parseInt(page as string) || 1;
  // SETTING PAGE SIZE FOR QUERY
  const pageSize = parseInt(limit as string) || 20;
  // SETTING SKIP FOR QUERY
  const skip = (pageNumber - 1) * pageSize;
  // BUILDING QUERY OBJECT
  const query: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(String(userId)),
  };
  // FILTER BY STATUS
  if (status) {
    // FILTER BY STATUS
    query.status = status;
  } else {
    // FILTER BY STATUS (EXCLUDE ACTIVE/PAUSED BY DEFAULT)
    query.status = { $in: ["completed", "abandoned"] };
  }
  // FILTER BY TASK ID
  if (taskId) {
    // FILTER BY TASK ID
    query.taskId = new mongoose.Types.ObjectId(String(taskId));
  }
  // FILTER BY DATE RANGE
  if (startDate || endDate) {
    // FILTER BY DATE RANGE
    query.startedAt = {};
    // FILTER BY START DATE
    if (startDate) {
      // FILTER BY START DATE
      (query.startedAt as Record<string, unknown>).$gte = new Date(
        startDate as string
      );
    }
    // FILTER BY END DATE
    if (endDate) {
      (query.startedAt as Record<string, unknown>).$lte = new Date(
        endDate as string
      );
    }
  }
  // GET TOTAL COUNT
  const totalSessions = await FocusSession.countDocuments(query).exec();
  // GET SESSIONS
  const sessions = await FocusSession.find(query)
    .populate("taskId", "title taskKey status priority")
    .sort({ startedAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean()
    .exec();
  // CALCULATE PAGINATION METADATA
  const totalPages = Math.ceil(totalSessions / pageSize);
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      count: sessions.length,
      total: totalSessions,
      page: pageNumber,
      totalPages,
      data: sessions,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET FOCUS STATS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET FOCUS STATS ==>
export const getFocusStats = expressAsyncHandler(async (req, res) => {
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
  // GETTING PERIOD FROM QUERY
  const { period } = req.query;
  // CALCULATE DATE RANGE BASED ON PERIOD
  const now = new Date();
  // SETTING START DATE BASED ON PERIOD
  let startDate: Date;
  // SWITCH CASE FOR PERIOD
  switch (period) {
    // WEEK
    case "week":
      // SET START DATE TO 7 DAYS AGO
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    // MONTH
    case "month":
      // SET START DATE TO 30 DAYS AGO
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    // YEAR
    case "year":
      // SET START DATE TO 365 DAYS AGO
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      // DEFAULT TO 7 DAYS AGO
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  // AGGREGATE FOCUS STATS
  const stats = await FocusSession.aggregate([
    // MATCH USER ID, STARTED AT AND STATUS
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        startedAt: { $gte: startDate },
        status: { $in: ["completed", "abandoned"] },
      },
    },
    // GROUP BY NULL AND SUM STATS
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        completedSessions: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        abandonedSessions: {
          $sum: { $cond: [{ $eq: ["$status", "abandoned"] }, 1, 0] },
        },
        totalDuration: { $sum: "$duration" },
        avgDuration: { $avg: "$duration" },
        totalPomodoros: { $sum: "$pomodorosCompleted" },
        longestSession: { $max: "$duration" },
      },
    },
  ]).exec();
  // GET DAILY BREAKDOWN
  const dailyStats = await FocusSession.aggregate([
    // MATCH USER ID, STARTED AT AND STATUS
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        startedAt: { $gte: startDate },
        status: "completed",
      },
    },
    // GROUP BY YEAR, MONTH AND DAY AND SUM SESSIONS AND DURATION
    {
      $group: {
        _id: {
          year: { $year: "$startedAt" },
          month: { $month: "$startedAt" },
          day: { $dayOfMonth: "$startedAt" },
        },
        sessions: { $sum: 1 },
        duration: { $sum: "$duration" },
      },
    },
    // SORT BY YEAR, MONTH AND DAY IN ASCENDING ORDER
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
    },
    // PROJECT ID, DATE, SESSIONS AND DURATION
    {
      $project: {
        _id: 0,
        date: {
          $dateFromParts: {
            year: "$_id.year",
            month: "$_id.month",
            day: "$_id.day",
          },
        },
        sessions: 1,
        duration: 1,
      },
    },
  ]).exec();
  // GET USER'S TIMEZONE FROM QUERY (DEFAULT TO UTC)
  const timezone = (req.query.timezone as string) || "UTC";
  // GET HOURLY BREAKDOWN (BEST FOCUS TIME) - USE USER'S TIMEZONE
  const hourlyStats = await FocusSession.aggregate([
    // MATCH USER ID, STARTED AT AND STATUS
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        startedAt: { $gte: startDate },
        status: "completed",
      },
    },
    // GROUP BY HOUR AND SUM SESSIONS AND DURATION
    {
      $group: {
        _id: { $hour: { date: "$startedAt", timezone } },
        sessions: { $sum: 1 },
        totalDuration: { $sum: "$duration" },
      },
    },
    // SORT BY SESSIONS IN DESCENDING ORDER
    {
      $sort: { sessions: -1 },
    },
    // LIMIT TO 5 HOURS
    {
      $limit: 5,
    },
  ]).exec();
  // FORMAT RESPONSE
  const result = stats[0] || {
    totalSessions: 0,
    completedSessions: 0,
    abandonedSessions: 0,
    totalDuration: 0,
    avgDuration: 0,
    totalPomodoros: 0,
    longestSession: 0,
  };
  // CALCULATE COMPLETION RATE
  result.completionRate =
    result.totalSessions > 0
      ? Math.round((result.completedSessions / result.totalSessions) * 100)
      : 0;
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      summary: result,
      dailyBreakdown: dailyStats,
      bestFocusHours: hourlyStats.map((h) => ({
        hour: h._id,
        sessions: h.sessions,
        totalMinutes: Math.round(h.totalDuration),
      })),
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE SESSION NOTES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE SESSION NOTES ==>
export const updateSessionNotes = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION ID FROM REQUEST PARAMS
  const { sessionId } = req.params;
  // GETTING NOTES FROM REQUEST BODY
  const { notes } = req.body;
  // IF SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Session ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND AND UPDATE SESSION
  const session = await FocusSession.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(String(sessionId)),
      userId: new mongoose.Types.ObjectId(String(userId)),
    },
    { notes },
    { new: true }
  )
    .lean()
    .exec();
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (!session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Notes updated!",
    data: session,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * COMPLETE POMODORO CYCLE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== COMPLETE POMODORO ==>
export const completePomodoro = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION ID FROM REQUEST PARAMS
  const { sessionId } = req.params;
  // GETTING START BREAK FLAG FROM REQUEST BODY
  const { startBreak } = req.body;
  // IF SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Session ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE SESSION
  const session = await FocusSession.findOne({
    _id: new mongoose.Types.ObjectId(String(sessionId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: "active",
    isPomodoroMode: true,
  }).exec();
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (!session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Active pomodoro session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // INCREMENT POMODOROS COMPLETED
  session.pomodorosCompleted = (session.pomodorosCompleted || 0) + 1;
  // INCREMENT CURRENT POMODORO
  session.currentPomodoro = (session.currentPomodoro || 1) + 1;
  // IF START BREAK FLAG IS TRUE, SET IS ON BREAK
  if (startBreak) {
    // SET IS ON BREAK TO TRUE
    session.isOnBreak = true;
    // ADD BREAK ENTRY
    session.breaks.push({
      startedAt: new Date(),
      endedAt: null,
      duration: 0,
    });
  }
  // SAVE SESSION
  await session.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: `Pomodoro ${session.pomodorosCompleted} completed!`,
    data: session,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * END POMODORO BREAK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== END POMODORO BREAK ==>
export const endPomodoroBreak = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION ID FROM REQUEST PARAMS
  const { sessionId } = req.params;
  // IF SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Session ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE SESSION
  const session = await FocusSession.findOne({
    _id: new mongoose.Types.ObjectId(String(sessionId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: "active",
    isPomodoroMode: true,
    isOnBreak: true,
  }).exec();
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (!session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Session with active break not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // UPDATE LAST BREAK ENTRY
  if (session.breaks.length > 0) {
    // GET LAST BREAK
    const lastBreak = session.breaks[session.breaks.length - 1];
    // IF LAST BREAK EXISTS, UPDATE ENDED AT AND DURATION
    if (lastBreak && lastBreak.startedAt && !lastBreak.endedAt) {
      // UPDATE ENDED AT
      lastBreak.endedAt = new Date();
      // UPDATE DURATION
      lastBreak.duration =
        (lastBreak.endedAt.getTime() - lastBreak.startedAt.getTime()) /
        1000 /
        60;
    }
  }
  // SET IS ON BREAK TO FALSE
  session.isOnBreak = false;
  // SAVE SESSION
  await session.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Break ended, back to focus!",
    data: session,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DELETE A SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE SESSION ==>
export const deleteSession = expressAsyncHandler(async (req, res) => {
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
  // GETTING SESSION ID FROM REQUEST PARAMS
  const { sessionId } = req.params;
  // IF SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Session ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETE SESSION
  const result = await FocusSession.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(String(sessionId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
  }).exec();
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (!result) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Session deleted!",
  });
  // RETURNING FROM FUNCTION
  return;
});

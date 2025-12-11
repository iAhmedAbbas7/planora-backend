// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import expressAsyncHandler from "express-async-handler";

// <== TYPES ==>
interface AuthenticatedRequest {
  // <== ID FIELD ==>
  id?: string;
}

/**
 * START TIMER ON A TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== START TIMER ==>
export const startTimer = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID AND NOTE FROM REQUEST BODY
  const { taskId, note } = req.body;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER HAS AN ACTIVE TIMER ON ANY TASK
  const activeTimerTask = await Task.findOne({
    userId: new mongoose.Types.ObjectId(String(userId)),
    "timeTracking.activeSession.startedAt": { $ne: null },
  })
    .select("_id title taskKey")
    .lean()
    .exec();
  // IF USER HAS AN ACTIVE TIMER, RETURN 400 ERROR
  if (activeTimerTask) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: `You already have an active timer on "${activeTimerTask.title}"`,
      success: false,
      data: {
        activeTaskId: activeTimerTask._id,
        activeTaskTitle: activeTimerTask.title,
        activeTaskKey: activeTimerTask.taskKey,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE TASK
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(String(taskId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    isTrashed: false,
  }).exec();
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
  // STARTING THE TIMER
  task.set("timeTracking.activeSession", {
    startedAt: new Date(),
    note: note || "",
  });
  // SAVE THE TASK
  await task.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Timer started!",
    data: {
      taskId: task._id,
      taskKey: task.taskKey,
      title: task.title,
      startedAt: task.timeTracking?.activeSession?.startedAt,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * STOP TIMER AND LOG SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== STOP TIMER ==>
export const stopTimer = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID AND NOTE FROM REQUEST BODY
  const { taskId, note } = req.body;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING THE TASK WITH ACTIVE TIMER
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(String(taskId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    "timeTracking.activeSession.startedAt": { $ne: null },
  }).exec();
  // IF TASK NOT FOUND OR NO ACTIVE TIMER, RETURN 404 ERROR
  if (!task || !task.timeTracking?.activeSession?.startedAt) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "No active timer found for this task!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CALCULATING DURATION IN MINUTES
  const startedAt = new Date(task.timeTracking.activeSession.startedAt);
  // GETTING ENDED AT DATE
  const endedAt = new Date();
  // CALCULATING DURATION IN MILLISECONDS
  const durationMs = endedAt.getTime() - startedAt.getTime();
  // CALCULATING DURATION IN MINUTES
  const durationMinutes = Math.round(durationMs / 60000);
  // CREATING THE SESSION OBJECT
  const session = {
    startedAt,
    endedAt,
    duration: durationMinutes,
    note: note || task.timeTracking.activeSession.note || "",
  };
  // ADD SESSION TO SESSIONS ARRAY AND UPDATE LOGGED TIME
  const currentLogged = task.timeTracking?.logged || 0;
  // ADDING SESSION TO SESSIONS ARRAY AND UPDATING LOGGED TIME
  task.set("timeTracking.sessions", [
    ...(task.timeTracking?.sessions || []),
    session,
  ]);
  // UPDATING LOGGED TIME
  task.set("timeTracking.logged", currentLogged + durationMinutes);
  // CLEARING THE ACTIVE SESSION
  task.set("timeTracking.activeSession", {
    startedAt: null,
    note: "",
  });
  // SAVING THE TASK
  await task.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Timer stopped!",
    data: {
      taskId: task._id,
      taskKey: task.taskKey,
      title: task.title,
      session,
      totalLogged: task.timeTracking?.logged,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DISCARD TIMER WITHOUT LOGGING SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DISCARD TIMER ==>
export const discardTimer = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID FROM REQUEST BODY
  const { taskId } = req.body;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING THE TASK WITH ACTIVE TIMER
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(String(taskId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    "timeTracking.activeSession.startedAt": { $ne: null },
  }).exec();
  // IF TASK NOT FOUND OR NO ACTIVE TIMER, RETURN 404 ERROR
  if (!task) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "No active timer found for this task!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CLEARING THE ACTIVE SESSION WITHOUT LOGGING
  task.set("timeTracking.activeSession", {
    startedAt: null,
    note: "",
  });
  // SAVING THE TASK
  await task.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Timer discarded!",
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * LOG MANUAL TIME SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LOG MANUAL TIME ==>
export const logManualTime = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID, DURATION, DATE, AND NOTE FROM REQUEST BODY
  const { taskId, duration, date, note } = req.body;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF DURATION NOT PROVIDED OR INVALID, RETURN 400 ERROR
  if (!duration || typeof duration !== "number" || duration <= 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Valid duration (in minutes) is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING THE TASK
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(String(taskId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
    isTrashed: false,
  }).exec();
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
  // CREATING SESSION WITH PROVIDED DATE OR NOW
  const sessionDate = date ? new Date(date) : new Date();
  // CREATING THE SESSION OBJECT
  const session = {
    startedAt: sessionDate,
    endedAt: new Date(sessionDate.getTime() + duration * 60000),
    duration: Math.round(duration),
    note: note || "",
  };
  // ADDING SESSION TO SESSIONS ARRAY AND UPDATING LOGGED TIME
  const currentLogged = task.timeTracking?.logged || 0;
  // ADDING SESSION TO SESSIONS ARRAY AND UPDATING LOGGED TIME
  task.set("timeTracking.sessions", [
    ...(task.timeTracking?.sessions || []),
    session,
  ]);
  // UPDATING LOGGED TIME
  task.set("timeTracking.logged", currentLogged + Math.round(duration));
  // SAVING THE TASK
  await task.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Time logged successfully!",
    data: {
      taskId: task._id,
      session,
      totalLogged: task.timeTracking?.logged,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE TIME ESTIMATE FOR A TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE TIME ESTIMATE ==>
export const updateTimeEstimate = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID FROM PARAMS
  const { taskId } = req.params;
  // GETTING ESTIMATED TIME FROM REQUEST BODY
  const { estimated } = req.body;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE ESTIMATED TIME (CAN BE NULL TO CLEAR)
  if (estimated !== null && (typeof estimated !== "number" || estimated < 0)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid estimated time!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // UPDATING THE TASK
  const task = await Task.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(String(taskId)),
      userId: new mongoose.Types.ObjectId(String(userId)),
      isTrashed: false,
    },
    { $set: { "timeTracking.estimated": estimated } },
    { new: true }
  )
    .select("_id taskKey title timeTracking")
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
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Time estimate updated!",
    data: {
      taskId: task._id,
      estimated: task.timeTracking?.estimated,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET ACTIVE TIMER FOR A TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ACTIVE TIMER ==>
export const getActiveTimer = expressAsyncHandler(async (req, res) => {
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
  // FINDING TASK WITH ACTIVE TIMER
  const task = await Task.findOne({
    userId: new mongoose.Types.ObjectId(String(userId)),
    "timeTracking.activeSession.startedAt": { $ne: null },
  })
    .select("_id taskKey title projectId timeTracking.activeSession")
    .populate("projectId", "title")
    .lean()
    .exec();
  // IF NO ACTIVE TIMER, RETURN NULL
  if (!task) {
    // RETURNING ERROR RESPONSE
    res.status(200).json({
      success: true,
      data: null,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      taskId: task._id,
      taskKey: task.taskKey,
      title: task.title,
      project: task.projectId,
      startedAt: task.timeTracking?.activeSession?.startedAt,
      note: task.timeTracking?.activeSession?.note,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET TIME TRACKING FOR TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TIME TRACKING FOR TASK ==>
export const getTaskTimeTracking = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID FROM PARAMS
  const { taskId } = req.params;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING THE TASK
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(String(taskId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
  })
    .select("_id taskKey title timeTracking")
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
  // GET TIME TRACKING DATA OR DEFAULT
  const timeTrackingData = (task as any).timeTracking || {
    estimated: null,
    logged: 0,
    sessions: [],
    activeSession: null,
  };
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      taskId: task._id,
      taskKey: task.taskKey,
      title: task.title,
      timeTracking: timeTrackingData,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET TIME REPORT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TIME REPORT ==>
export const getTimeReport = expressAsyncHandler(async (req, res) => {
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
  // GETTING QUERY PARAMS
  const { projectId, startDate, endDate } = req.query;
  // BUILDING MATCH QUERY
  const matchQuery: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(String(userId)),
    isTrashed: false,
    "timeTracking.logged": { $gt: 0 },
  };
  // ADD PROJECT FILTER IF PROVIDED
  if (projectId) {
    // ADDING PROJECT ID TO MATCH QUERY
    matchQuery.projectId = new mongoose.Types.ObjectId(String(projectId));
  }
  // BUILD DATE FILTER FOR SESSIONS
  let sessionDateFilter: Record<string, unknown> = {};
  // IF START DATE OR END DATE PROVIDED
  if (startDate || endDate) {
    // CREATING SESSION DATE FILTER
    sessionDateFilter = {};
    // ADDING START DATE TO SESSION DATE FILTER
    if (startDate) {
      // ADDING START DATE TO SESSION DATE FILTER
      sessionDateFilter.$gte = new Date(String(startDate));
    }
    if (endDate) {
      // ADDING END DATE TO SESSION DATE FILTER
      sessionDateFilter.$lte = new Date(String(endDate));
    }
  }
  // AGGREGATE TIME TRACKING DATA
  const report = await Task.aggregate([
    // MATCH TASKS WITH LOGGED TIME
    { $match: matchQuery },
    // UNWIND SESSIONS IF DATE FILTER IS PROVIDED
    ...(Object.keys(sessionDateFilter).length > 0
      ? [
          {
            $unwind: {
              path: "$timeTracking.sessions",
              preserveNullAndEmptyArrays: false,
            },
          },
          { $match: { "timeTracking.sessions.startedAt": sessionDateFilter } },
          {
            $group: {
              _id: "$_id",
              title: { $first: "$title" },
              taskKey: { $first: "$taskKey" },
              projectId: { $first: "$projectId" },
              status: { $first: "$status" },
              estimated: { $first: "$timeTracking.estimated" },
              logged: { $sum: "$timeTracking.sessions.duration" },
              sessionCount: { $sum: 1 },
            },
          },
        ]
      : [
          {
            $project: {
              _id: 1,
              title: 1,
              taskKey: 1,
              projectId: 1,
              status: 1,
              estimated: "$timeTracking.estimated",
              logged: "$timeTracking.logged",
              sessionCount: {
                $size: { $ifNull: ["$timeTracking.sessions", []] },
              },
            },
          },
        ]),
    // LOOKUP PROJECT INFO
    {
      $lookup: {
        from: "projects",
        localField: "projectId",
        foreignField: "_id",
        as: "project",
      },
    },
    { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
    // GROUP BY PROJECT
    {
      $group: {
        _id: "$projectId",
        projectTitle: { $first: "$project.title" },
        totalLogged: { $sum: "$logged" },
        totalEstimated: { $sum: { $ifNull: ["$estimated", 0] } },
        taskCount: { $sum: 1 },
        tasks: {
          $push: {
            taskId: "$_id",
            taskKey: "$taskKey",
            title: "$title",
            status: "$status",
            logged: "$logged",
            estimated: "$estimated",
            sessionCount: "$sessionCount",
          },
        },
      },
    },
    // SORT BY TOTAL LOGGED DESC
    { $sort: { totalLogged: -1 } },
  ]).exec();
  // CALCULATE TOTALS
  const totals = report.reduce(
    (acc, project) => {
      acc.totalLogged += project.totalLogged;
      acc.totalEstimated += project.totalEstimated;
      acc.taskCount += project.taskCount;
      return acc;
    },
    { totalLogged: 0, totalEstimated: 0, taskCount: 0 }
  );
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      projects: report,
      totals: {
        ...totals,
        projectCount: report.length,
      },
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DELETE TIME SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE TIME SESSION ==>
export const deleteTimeSession = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID AND SESSION ID FROM PARAMS
  const { taskId, sessionId } = req.params;
  // IF TASK ID OR SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId || !sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID and Session ID are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING THE TASK
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(String(taskId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
  }).exec();
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
  // FINDING THE SESSION TO DELETE
  const sessions = task.timeTracking?.sessions || [];
  // FINDING THE SESSION INDEX
  const sessionIndex = sessions.findIndex(
    (s: { _id?: mongoose.Types.ObjectId }) => s._id?.toString() === sessionId
  );
  // GETTING THE SESSION
  const session = sessions[sessionIndex];
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (sessionIndex === -1 || !session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET SESSION DURATION TO SUBTRACT FROM TOTAL
  const sessionDuration = session.duration || 0;
  // REMOVING SESSION FROM ARRAY
  sessions.splice(sessionIndex, 1);
  // UPDATING SESSIONS ARRAY
  task.set("timeTracking.sessions", sessions);
  // UPDATING TOTAL LOGGED TIME
  const currentLogged = task.timeTracking?.logged || 0;
  task.set("timeTracking.logged", Math.max(0, currentLogged - sessionDuration));
  // SAVING THE TASK
  await task.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Time session deleted!",
    data: {
      taskId: task._id,
      totalLogged: task.timeTracking?.logged,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE TIME SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE TIME SESSION ==>
export const updateTimeSession = expressAsyncHandler(async (req, res) => {
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
  // GETTING TASK ID AND SESSION ID FROM PARAMS
  const { taskId, sessionId } = req.params;
  // GETTING UPDATED DATA FROM REQUEST BODY
  const { duration, note, startedAt, endedAt } = req.body;
  // IF TASK ID OR SESSION ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId || !sessionId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID and Session ID are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING THE TASK
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(String(taskId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
  }).exec();
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
  // FINDING THE SESSION TO UPDATE
  const sessions = task.timeTracking?.sessions || [];
  // FINDING THE SESSION INDEX
  const sessionIndex = sessions.findIndex(
    (s: { _id?: mongoose.Types.ObjectId }) => s._id?.toString() === sessionId
  );
  // GETTING THE SESSION
  const session = sessions[sessionIndex];
  // IF SESSION NOT FOUND, RETURN 404 ERROR
  if (sessionIndex === -1 || !session) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Session not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING OLD DURATION
  const oldDuration = session.duration || 0;
  // UPDATING SESSION FIELDS
  if (duration !== undefined) {
    // UPDATING SESSION DURATION
    session.duration = duration;
  }
  // IF NOTE PROVIDED
  if (note !== undefined) {
    // UPDATING SESSION NOTE
    session.note = note;
  }
  // IF STARTED AT PROVIDED
  if (startedAt) {
    // UPDATING SESSION STARTED AT
    session.startedAt = new Date(startedAt);
  }
  // IF ENDED AT PROVIDED
  if (endedAt) {
    // UPDATING SESSION ENDED AT
    session.endedAt = new Date(endedAt);
  }
  // UPDATING THE SESSIONS ARRAY
  task.set("timeTracking.sessions", sessions);
  // UPDATING TOTAL LOGGED TIME IF DURATION CHANGED
  if (duration !== undefined && duration !== oldDuration) {
    // GETTING CURRENT LOGGED TIME
    const currentLogged = task.timeTracking?.logged || 0;
    // CALCULATING NEW LOGGED TIME
    const newLogged = Math.max(0, currentLogged - oldDuration + duration);
    // UPDATING TOTAL LOGGED TIME
    task.set("timeTracking.logged", newLogged);
  }
  // SAVING THE TASK
  await task.save();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    message: "Time session updated!",
    data: {
      taskId: task._id,
      session,
      totalLogged: task.timeTracking?.logged,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

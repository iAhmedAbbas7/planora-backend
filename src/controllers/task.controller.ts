// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";
import { createNotification } from "./notification.controller.js";

// <== RECURRENCE PATTERN TYPE ==>
type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly" | "custom";

/**
 * CALCULATE NEXT OCCURRENCE DATE FOR RECURRING TASKS
 * @param baseDate - Base Date to Calculate From
 * @param pattern - Recurrence Pattern
 * @param interval - Interval Between Occurrences
 * @param daysOfWeek - Days of Week for Weekly Pattern (0-6)
 * @param skipWeekends - Whether to Skip Weekends
 * @returns Next Occurrence Date
 */
// <== CALCULATE NEXT OCCURRENCE HELPER FUNCTION ==>
const calculateNextOccurrence = (
  baseDate: Date,
  pattern: RecurrencePattern,
  interval: number = 1,
  daysOfWeek: number[] = [],
  skipWeekends: boolean = false
): Date => {
  // CREATE NEW DATE OBJECT FROM BASE DATE
  const nextDate = new Date(baseDate);
  // SWITCH BASED ON PATTERN
  switch (pattern) {
    // CASE DAILY
    case "daily":
      // ADD INTERVAL DAYS
      nextDate.setDate(nextDate.getDate() + interval);
      // IF SKIP WEEKENDS, ADJUST DATE
      if (skipWeekends) {
        // GET DAY OF WEEK (0 = SUNDAY, 6 = SATURDAY)
        const dayOfWeek = nextDate.getDay();
        // IF SATURDAY, ADD 2 DAYS TO GET TO MONDAY
        if (dayOfWeek === 6) {
          // ADD 2 DAYS TO GET TO MONDAY
          nextDate.setDate(nextDate.getDate() + 2);
        }
        // IF SUNDAY, ADD 1 DAY TO GET TO MONDAY
        else if (dayOfWeek === 0) {
          // ADD 1 DAY TO GET TO MONDAY
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }
      break;
    // CASE WEEKLY
    case "weekly":
      // IF DAYS OF WEEK SPECIFIED, FIND NEXT MATCHING DAY
      if (daysOfWeek.length > 0) {
        // SORT DAYS OF WEEK
        const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
        // GET CURRENT DAY OF WEEK
        const currentDay = nextDate.getDay();
        // FIND NEXT DAY IN SORTED DAYS
        let foundNextDay = false;
        // LOOP THROUGH SORTED DAYS
        for (const day of sortedDays) {
          // IF DAY IS AFTER CURRENT DAY, USE IT
          if (day > currentDay) {
            // CALCULATE DAYS TO ADD
            nextDate.setDate(nextDate.getDate() + (day - currentDay));
            // SET FOUND NEXT DAY TO TRUE
            foundNextDay = true;
            // BREAK OUT OF LOOP
            break;
          }
        }
        // IF NO NEXT DAY FOUND IN CURRENT WEEK, GO TO FIRST DAY OF NEXT INTERVAL WEEK
        if (!foundNextDay && sortedDays.length > 0) {
          // DAYS UNTIL NEXT OCCURRENCE OF FIRST DAY
          const firstDay = sortedDays[0] as number;
          // CALCULATE DAYS UNTIL FIRST DAY
          const daysUntilFirst = 7 - currentDay + firstDay;
          // ADD INTERVAL WEEKS MINUS ONE (SINCE WE ALREADY ADD ONE WEEK)
          nextDate.setDate(
            nextDate.getDate() + daysUntilFirst + (interval - 1) * 7
          );
        }
      } else {
        // NO SPECIFIC DAYS, JUST ADD INTERVAL WEEKS
        nextDate.setDate(nextDate.getDate() + interval * 7);
      }
      break;
    // CASE MONTHLY
    case "monthly":
      // ADD INTERVAL MONTHS
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    // CASE YEARLY
    case "yearly":
      // ADD INTERVAL YEARS
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
    // CASE CUSTOM
    case "custom":
      // FOR CUSTOM, DEFAULT TO DAILY WITH INTERVAL
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    // DEFAULT CASE
    default:
      // DEFAULT TO DAILY
      nextDate.setDate(nextDate.getDate() + 1);
  }
  // RETURN NEXT DATE
  return nextDate;
};

/**
 * GET MONTHLY SUMMARY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET MONTHLY SUMMARY ==>
export const getMonthlySummary = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING MONTHLY SUMMARY USING AGGREGATION
  const summary = await Task.aggregate([
    // MATCHING COMPLETED TASKS WITHIN THE USER'S TASKS
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        status: "completed",
        isTrashed: false,
        completedAt: { $ne: null },
      },
    },
    // GROUPING BY MONTH AND YEAR
    {
      $group: {
        _id: {
          year: { $year: "$completedAt" },
          month: { $month: "$completedAt" },
        },
        completed: { $sum: 1 },
      },
    },
    // SORTING CHRONOLOGICALLY
    {
      $sort: {
        "_id.year": 1,
        "_id.month": 1,
      },
    },
    // FORMATTING RESPONSE
    {
      $project: {
        _id: 0,
        month: {
          $concat: [
            {
              $arrayElemAt: [
                [
                  "",
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ],
                "$_id.month",
              ],
            },
            " ",
            { $toString: "$_id.year" },
          ],
        },
        completed: 1,
      },
    },
  ]).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: summary,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET TASK STATISTICS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TASK STATISTICS ==>
export const getTaskStats = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING CURRENT DATE
  const now = new Date();
  // GETTING START OF DAY
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // GETTING END OF DAY
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  // GETTING STATISTICS IN PARALLEL
  const [
    totalCount,
    completedCount,
    inProgressCount,
    toDoCount,
    dueTodayCount,
  ] = await Promise.all([
    Task.countDocuments({ userId, isTrashed: false }).exec(),
    Task.countDocuments({
      userId,
      status: "completed",
      isTrashed: false,
    }).exec(),
    Task.countDocuments({
      userId,
      status: "in progress",
      isTrashed: false,
    }).exec(),
    Task.countDocuments({
      userId,
      status: "to do",
      isTrashed: false,
    }).exec(),
    Task.countDocuments({
      userId,
      isTrashed: false,
      dueDate: { $gte: startOfDay, $lt: endOfDay },
    }).exec(),
  ]);
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      totalCount,
      completedCount,
      inProgressCount,
      pendingCount: toDoCount,
      dueTodayCount,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET ALL TASKS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ALL TASKS ==>
export const getAllTasks = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  const { projectId, status, search, page, limit } = req.query;
  // PAGINATION PARAMETERS (PAGE NUMBER AND PAGE SIZE)
  const pageNumber = parseInt(page as string) || 1;
  // PAGE SIZE (NUMBER OF TASKS PER PAGE)
  const pageSize = parseInt(limit as string) || 50;
  // SKIP NUMBER OF TASKS
  const skip = (pageNumber - 1) * pageSize;
  // BUILDING QUERY OBJECT
  let query: any = { userId, isTrashed: false };
  // IF PROJECT ID PROVIDED
  if (projectId) {
    // ADDING PROJECT ID TO QUERY
    query.projectId = projectId;
  }
  // IF STATUS PROVIDED
  if (status) {
    // ADDING STATUS TO QUERY
    query.status = (status as string).toLowerCase();
  }
  // IF SEARCH PROVIDED
  if (search) {
    // CREATING SEARCH REGEX
    const searchRegex = new RegExp(search as string, "i");
    // ADDING SEARCH QUERY TO QUERY
    query.$or = [{ title: searchRegex }, { description: searchRegex }];
  }
  // GETTING TOTAL COUNT
  const totalTasks = await Task.countDocuments(query).exec();
  // FINDING TASKS
  const tasks = await Task.find(query)
    .populate("projectId", "title")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean()
    .exec();
  // CALCULATING PAGINATION METADATA
  const totalPages = Math.ceil(totalTasks / pageSize);
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: tasks.length,
    total: totalTasks,
    page: pageNumber,
    totalPages,
    data: tasks,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * CREATE TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE TASK ==>
export const createTask = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK DATA FROM REQUEST BODY
  const {
    title,
    description,
    status,
    priority,
    dueDate,
    projectId,
    recurrence,
  } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!title || !projectId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Title and Project ID are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING IF PROJECT EXISTS AND BELONGS TO USER
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
      message: "Project not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // SETTING COMPLETED AT IF STATUS IS COMPLETED
  const taskData: any = {
    title,
    description: description || "",
    status: (status || "to do").toLowerCase(),
    priority: priority || "medium",
    dueDate: dueDate || null,
    projectId,
    userId,
  };
  // IF STATUS IS COMPLETED, SET COMPLETED AT
  if (taskData.status === "completed") {
    // SETTING COMPLETED AT IF STATUS IS COMPLETED
    taskData.completedAt = new Date();
  }
  // IF RECURRENCE IS PROVIDED, ADD RECURRENCE DATA
  if (recurrence && recurrence.isRecurring) {
    // CALCULATE NEXT OCCURRENCE DATE
    const nextOccurrence = calculateNextOccurrence(
      dueDate ? new Date(dueDate) : new Date(),
      recurrence.pattern,
      recurrence.interval || 1,
      recurrence.daysOfWeek || [],
      recurrence.skipWeekends || false
    );
    // SET RECURRENCE DATA
    taskData.recurrence = {
      isRecurring: true,
      pattern: recurrence.pattern || "daily",
      interval: recurrence.interval || 1,
      daysOfWeek: recurrence.daysOfWeek || [],
      dayOfMonth: recurrence.dayOfMonth || null,
      endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
      skipWeekends: recurrence.skipWeekends || false,
      nextOccurrence,
      lastGeneratedAt: null,
      originalTaskId: null,
      occurrenceCount: 0,
    };
  }
  // CREATING NEW TASK
  const newTask = await Task.create(taskData);
  // CREATING NOTIFICATION FOR TASK CREATION
  await createNotification(
    userId,
    "task_created",
    "New Task Created",
    `Task "${newTask.title}" has been created in project "${project.title}".`,
    newTask._id.toString(),
    (req as any).app
  );
  // GETTING SOCKET IO INSTANCE
  const io = (req.app as any).get("io");
  // IF SOCKET IO AVAILABLE, EMIT TASK CREATED EVENT
  if (io) {
    // EMIT TASK CREATED EVENT IF SOCKET IO AVAILABLE
    io.emit("task_created", newTask);
  }
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Task created successfully!",
    success: true,
    data: newTask,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET TASKS BY PROJECT ID
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TASKS BY PROJECT ID ==>
export const getTasksByProjectId = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING PROJECT ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid Project ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING TASKS BY PROJECT ID
  const tasks = await Task.find({ projectId, userId, isTrashed: false })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: tasks.length,
    data: tasks,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET SINGLE TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET SINGLE TASK ==>
export const getOneTask = expressAsyncHandler(async (req, res) => {
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING TASK
  const task = await Task.findById(taskId)
    .populate("projectId", "title")
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
    data: task,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE TASK ==>
export const updateTask = expressAsyncHandler(async (req, res) => {
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING STATUS FROM REQUEST BODY
  const { status } = req.body;
  // IF STATUS IS COMPLETED, SET COMPLETED AT
  if (status && status.toLowerCase() === "completed") {
    // SETTING COMPLETED AT IF STATUS IS COMPLETED
    req.body.completedAt = new Date();
  } else if (status && status.toLowerCase() !== "completed") {
    // IF STATUS IS NOT COMPLETED, CLEAR COMPLETED AT
    req.body.completedAt = null;
  }
  // FINDING AND UPDATING TASK
  const task = await Task.findByIdAndUpdate(taskId, req.body, {
    new: true,
    runValidators: true,
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
  // CREATING NOTIFICATION FOR TASK UPDATE
  await createNotification(
    task.userId.toString(),
    "task_updated",
    "Task Updated",
    `Task "${task.title}" has been updated.`,
    task._id.toString(),
    (req as any).app
  );
  // GETTING SOCKET IO INSTANCE
  const io = (req.app as any).get("io");
  // IF SOCKET IO AVAILABLE, EMIT TASK UPDATED EVENT
  if (io) {
    // EMIT TASK UPDATED EVENT IF SOCKET IO AVAILABLE
    io.emit("task_updated", task);
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task updated successfully!",
    success: true,
    data: task,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DELETE TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE TASK ==>
export const deleteTask = expressAsyncHandler(async (req, res) => {
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING TASK BEFORE DELETION
  const task = await Task.findById(taskId).lean().exec();
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
  // DELETING TASK
  await Task.findByIdAndDelete(taskId).exec();
  // CREATING NOTIFICATION FOR TASK DELETION
  await createNotification(
    task.userId.toString(),
    "task_deleted",
    "Task Deleted",
    `Task "${task.title}" has been deleted.`,
    task._id.toString(),
    (req as any).app
  );
  // GETTING SOCKET IO INSTANCE
  const io = (req.app as any).get("io");
  // IF SOCKET IO AVAILABLE, EMIT TASK DELETED EVENT
  if (io) {
    // EMIT TASK DELETED EVENT IF SOCKET IO AVAILABLE
    io.emit("task_deleted", taskId);
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task deleted successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * MOVE TASK TO TRASH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MOVE TASK TO TRASH ==>
export const moveTaskToTrash = expressAsyncHandler(async (req, res) => {
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING CURRENT STATUS FROM REQUEST BODY
  const { status } = req.body;
  // FINDING TASK
  const existingTask = await Task.findById(taskId).lean().exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!existingTask) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING AND UPDATING TASK
  const task = await Task.findByIdAndUpdate(
    taskId,
    {
      isTrashed: true,
      deletedOn: new Date(),
      originalStatus: status || existingTask.status,
    },
    { new: true }
  )
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task moved to trash successfully!",
    success: true,
    data: task,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * RESTORE TASK FROM TRASH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RESTORE TASK FROM TRASH ==>
export const restoreTask = expressAsyncHandler(async (req, res) => {
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING ORIGINAL STATUS FROM REQUEST BODY
  const { originalStatus } = req.body;
  // FINDING AND UPDATING TASK
  const task = await Task.findByIdAndUpdate(
    taskId,
    {
      isTrashed: false,
      deletedOn: null,
      status: originalStatus || "to do",
    },
    { new: true }
  )
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
    message: "Task restored successfully!",
    success: true,
    data: task,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * PERMANENTLY DELETE TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== PERMANENTLY DELETE TASK ==>
export const permanentlyDeleteTask = expressAsyncHandler(async (req, res) => {
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING TASK BEFORE DELETION
  const task = await Task.findById(taskId).lean().exec();
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
  // DELETING TASK PERMANENTLY
  await Task.findByIdAndDelete(taskId).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task permanently deleted successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET TRASHED TASKS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TRASHED TASKS ==>
export const getTrashedTasks = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // FINDING TRASHED TASKS
  const trashedTasks = await Task.find({
    userId,
    isTrashed: true,
  })
    .populate("projectId", "title")
    .sort({ deletedOn: -1 })
    .lean()
    .exec();
  // IF NO TRASHED TASKS FOUND, RETURN 404 ERROR
  if (!trashedTasks || trashedTasks.length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "No trashed tasks found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: trashedTasks.length,
    data: trashedTasks,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET RECENT TASKS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET RECENT TASKS ==>
export const getRecentTasks = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING LIMIT FROM QUERY PARAMETERS
  const limit = parseInt((req.query.limit as string) || "4");
  // FINDING RECENT TASKS
  const recentTasks = await Task.find({ userId, isTrashed: false })
    .populate("projectId", "title")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: recentTasks.length,
    data: recentTasks,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE TASK STATUS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE TASK STATUS ==>
export const updateTaskStatus = expressAsyncHandler(async (req, res) => {
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // IF TASK ID NOT PROVIDED, RETURN 400 ERROR
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING STATUS FROM REQUEST BODY
  const { status } = req.body;
  // IF STATUS NOT PROVIDED, RETURN 400 ERROR
  if (!status) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Status is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // PREPARING UPDATE DATA
  const updateData: any = { status: status.toLowerCase() };
  // IF STATUS IS COMPLETED, SET COMPLETED AT
  if (status.toLowerCase() === "completed") {
    updateData.completedAt = new Date();
  } else {
    // IF STATUS IS NOT COMPLETED, CLEAR COMPLETED AT
    updateData.completedAt = null;
  }
  // FINDING AND UPDATING TASK
  const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, {
    new: true,
    runValidators: true,
  })
    .lean()
    .exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!updatedTask) {
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
    message: "Task status updated successfully!",
    success: true,
    data: updatedTask,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * ADD DEPENDENCY TO TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ADD DEPENDENCY ==>
export const addDependency = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // GETTING DEPENDENCY DATA FROM REQUEST BODY
  const { dependencyTaskId, type } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!taskId || !dependencyTaskId || !type) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID, Dependency Task ID, and Type are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE DEPENDENCY TYPE
  if (!["blocks", "blocked_by", "relates_to"].includes(type)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Invalid dependency type! Must be: blocks, blocked_by, or relates_to",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // PREVENT SELF-DEPENDENCY
  if (taskId === dependencyTaskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "A task cannot depend on itself!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF TASK EXISTS AND BELONGS TO USER
  const task = await Task.findOne({ _id: taskId, userId }).exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!task) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF DEPENDENCY TASK EXISTS
  const dependencyTask = await Task.findById(dependencyTaskId).lean().exec();
  // IF DEPENDENCY TASK NOT FOUND, RETURN 404 ERROR
  if (!dependencyTask) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Dependency task not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF DEPENDENCY ALREADY EXISTS
  const existingDependency = task.dependencies?.find(
    (dep: any) =>
      dep.taskId.toString() === dependencyTaskId && dep.type === type
  );
  // IF DEPENDENCY ALREADY EXISTS, RETURN 400 ERROR
  if (existingDependency) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "This dependency already exists!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // ADD DEPENDENCY TO TASK
  task.dependencies = task.dependencies || [];
  // ADD DEPENDENCY TO TASK
  task.dependencies.push({
    taskId: new mongoose.Types.ObjectId(dependencyTaskId),
    type,
    linkedAt: new Date(),
  });
  // SAVE TASK
  await task.save();
  // IF TYPE IS "blocks" OR "blocked_by", CREATE REVERSE DEPENDENCY
  if (type === "blocks" || type === "blocked_by") {
    // GET REVERSE TYPE
    const reverseType = type === "blocks" ? "blocked_by" : "blocks";
    // FIND REVERSE TASK
    const reverseTask = await Task.findById(dependencyTaskId).exec();
    // IF REVERSE TASK FOUND, CHECK IF REVERSE DEPENDENCY DOESN'T EXIST
    if (reverseTask) {
      // CHECK IF REVERSE DEPENDENCY DOESN'T EXIST
      const existingReverse = reverseTask.dependencies?.find(
        (dep: any) =>
          dep.taskId.toString() === taskId && dep.type === reverseType
      );
      // IF REVERSE DEPENDENCY DOESN'T EXIST, ADD REVERSE DEPENDENCY
      if (!existingReverse) {
        // ADD REVERSE DEPENDENCY TO REVERSE TASK
        reverseTask.dependencies = reverseTask.dependencies || [];
        // ADD REVERSE DEPENDENCY TO REVERSE TASK
        reverseTask.dependencies.push({
          taskId: new mongoose.Types.ObjectId(taskId),
          type: reverseType,
          linkedAt: new Date(),
        });
        // SAVE REVERSE TASK
        await reverseTask.save();
      }
    }
  }
  // GET UPDATED TASK WITH POPULATED DEPENDENCIES
  const updatedTask = await Task.findById(taskId)
    .populate("dependencies.taskId", "title status priority taskKey")
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Dependency added successfully!",
    success: true,
    data: updatedTask,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * REMOVE DEPENDENCY FROM TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REMOVE DEPENDENCY ==>
export const removeDependency = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK ID AND DEPENDENCY ID FROM REQUEST PARAMS
  const { id: taskId, dependencyId } = req.params;
  // VALIDATE REQUIRED FIELDS
  if (!taskId || !dependencyId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID and Dependency ID are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF TASK EXISTS AND BELONGS TO USER
  const task = await Task.findOne({ _id: taskId, userId }).exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!task) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE DEPENDENCY TO REMOVE
  const dependencyIndex = task.dependencies?.findIndex(
    (dep: any) => dep._id.toString() === dependencyId
  );
  if (dependencyIndex === undefined || dependencyIndex === -1) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Dependency not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET DEPENDENCY DETAILS BEFORE REMOVING
  const dependency = task.dependencies![dependencyIndex];
  // GET DEPENDENCY TASK ID
  const dependencyTaskId = dependency!.taskId.toString();
  // GET DEPENDENCY TYPE
  const dependencyType = dependency!.type;
  // REMOVE DEPENDENCY FROM TASK
  task.dependencies!.splice(dependencyIndex, 1);
  // SAVE TASK
  await task.save();
  // IF TYPE IS "blocks" OR "blocked_by", REMOVE REVERSE DEPENDENCY
  if (dependencyType === "blocks" || dependencyType === "blocked_by") {
    // GET REVERSE TYPE
    const reverseType = dependencyType === "blocks" ? "blocked_by" : "blocks";
    // FIND REVERSE TASK
    const reverseTask = await Task.findById(dependencyTaskId).exec();
    // IF REVERSE TASK FOUND, CHECK IF REVERSE DEPENDENCY DOESN'T EXIST
    if (reverseTask && reverseTask.dependencies) {
      // FILTER REVERSE DEPENDENCIES
      const filteredDeps = reverseTask.dependencies.filter(
        (dep: any) =>
          !(dep.taskId.toString() === taskId && dep.type === reverseType)
      );
      // REMOVE ALL REVERSE DEPENDENCIES
      reverseTask.dependencies.splice(0, reverseTask.dependencies.length);
      // ADD FILTERED DEPENDENCIES TO REVERSE TASK
      filteredDeps.forEach((dep: any) => reverseTask.dependencies!.push(dep));
      // SAVE REVERSE TASK
      await reverseTask.save();
    }
  }
  // GET UPDATED TASK WITH POPULATED DEPENDENCIES
  const updatedTask = await Task.findById(taskId)
    .populate("dependencies.taskId", "title status priority taskKey")
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Dependency removed successfully!",
    success: true,
    data: updatedTask,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET BLOCKERS FOR TASK (TASKS BLOCKING THIS TASK)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET BLOCKERS ==>
export const getBlockers = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // VALIDATE TASK ID
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND TASK AND GET BLOCKERS (TASKS WITH blocked_by DEPENDENCY)
  const taskResult = await Task.findOne({ _id: taskId, userId })
    .populate({
      path: "dependencies.taskId",
      select: "title status priority taskKey dueDate",
      match: { isTrashed: false },
    })
    .lean()
    .exec();
  if (!taskResult) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  const task = taskResult as any;
  // FILTER BLOCKERS (blocked_by DEPENDENCIES)
  const blockers: any[] = [];
  // IF TASK HAS DEPENDENCIES, FILTER BLOCKERS (blocked_by DEPENDENCIES)
  if (task.dependencies) {
    // LOOP THROUGH DEPENDENCIES
    task.dependencies.forEach((dep: any) => {
      // IF DEPENDENCY TYPE IS "blocked_by" AND TASK ID IS PROVIDED, ADD DEPENDENCY TO BLOCKERS
      if (dep.type === "blocked_by" && dep.taskId) {
        // ADD DEPENDENCY TO BLOCKERS
        blockers.push({
          ...dep.taskId,
          linkedAt: dep.linkedAt,
          dependencyId: dep._id,
        });
      }
    });
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: blockers.length,
    data: blockers,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET BLOCKED TASKS (TASKS THAT THIS TASK BLOCKS)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET BLOCKED TASKS ==>
export const getBlockedTasks = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // VALIDATE TASK ID
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND TASK AND GET BLOCKED TASKS (TASKS WITH blocks DEPENDENCY)
  const taskResult = await Task.findOne({ _id: taskId, userId })
    .populate({
      path: "dependencies.taskId",
      select: "title status priority taskKey dueDate",
      match: { isTrashed: false },
    })
    .lean()
    .exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!taskResult) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  const task = taskResult as any;
  // FILTER BLOCKED TASKS (blocks DEPENDENCIES)
  const blockedTasks: any[] = [];
  // IF TASK HAS DEPENDENCIES, FILTER BLOCKED TASKS (blocks DEPENDENCIES)
  if (task.dependencies) {
    // LOOP THROUGH DEPENDENCIES
    task.dependencies.forEach((dep: any) => {
      // IF DEPENDENCY TYPE IS "blocks" AND TASK ID IS PROVIDED, ADD DEPENDENCY TO BLOCKED TASKS
      if (dep.type === "blocks" && dep.taskId) {
        // ADD DEPENDENCY TO BLOCKED TASKS
        blockedTasks.push({
          ...dep.taskId,
          linkedAt: dep.linkedAt,
          dependencyId: dep._id,
        });
      }
    });
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: blockedTasks.length,
    data: blockedTasks,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET ALL DEPENDENCIES FOR TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TASK DEPENDENCIES ==>
export const getTaskDependencies = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // VALIDATE TASK ID
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND TASK WITH POPULATED DEPENDENCIES
  const taskResult = await Task.findOne({ _id: taskId, userId })
    .populate({
      path: "dependencies.taskId",
      select: "title status priority taskKey dueDate",
      match: { isTrashed: false },
    })
    .lean()
    .exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!taskResult) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // TYPE CAST TASK
  const task = taskResult as any;
  // FORMAT DEPENDENCIES BY TYPE
  const blockersList: any[] = [];
  // FORMAT DEPENDENCIES BY TYPE
  const blockingList: any[] = [];
  // FORMAT DEPENDENCIES BY TYPE
  const relatedList: any[] = [];
  // IF TASK HAS DEPENDENCIES, FORMAT DEPENDENCIES BY TYPE
  if (task.dependencies) {
    // LOOP THROUGH DEPENDENCIES
    task.dependencies.forEach((dep: any) => {
      // IF DEPENDENCY TASK ID IS PROVIDED, ADD DEPENDENCY TO LIST
      if (dep.taskId) {
        // ADD DEPENDENCY TO LIST
        const item = {
          ...dep.taskId,
          linkedAt: dep.linkedAt,
          dependencyId: dep._id,
        };
        // IF DEPENDENCY TYPE IS "blocked_by", ADD DEPENDENCY TO BLOCKERS LIST
        if (dep.type === "blocked_by") {
          // ADD DEPENDENCY TO BLOCKERS LIST
          blockersList.push(item);
        } else if (dep.type === "blocks") {
          // ADD DEPENDENCY TO BLOCKING LIST
          blockingList.push(item);
        } else if (dep.type === "relates_to") {
          // ADD DEPENDENCY TO RELATED LIST
          relatedList.push(item);
        }
      }
    });
  }
  // CREATE DEPENDENCIES OBJECT
  const dependencies = {
    blockers: blockersList,
    blocking: blockingList,
    related: relatedList,
  };
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: dependencies,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * ADD SUBTASK TO TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ADD SUBTASK ==>
export const addSubtask = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING PARENT TASK ID FROM REQUEST PARAMS
  const parentTaskId = req.params.id;
  // GETTING SUBTASK DATA FROM REQUEST BODY
  const { title, description, priority, dueDate, projectId } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!parentTaskId || !title) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Parent Task ID and Title are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF PARENT TASK EXISTS AND BELONGS TO USER
  const parentTask = await Task.findOne({ _id: parentTaskId, userId }).exec();
  // IF PARENT TASK NOT FOUND, RETURN 404 ERROR
  if (!parentTask) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Parent task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF PARENT TASK IS ALREADY A SUBTASK (PREVENT DEEP NESTING)
  if (parentTask.parentTask) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message:
        "Cannot add subtask to a subtask! Only one level of nesting is allowed.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CREATE SUBTASK
  const subtask = await Task.create({
    title,
    description: description || "",
    priority: priority || "medium",
    dueDate: dueDate || null,
    projectId: projectId || parentTask.projectId,
    userId,
    parentTask: parentTaskId,
    status: "to do",
  });
  // ADD SUBTASK TO PARENT TASK
  parentTask.subtasks = parentTask.subtasks || [];
  // ADD SUBTASK TO PARENT TASK
  parentTask.subtasks.push(subtask._id);
  // SAVE PARENT TASK
  await parentTask.save();
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Subtask created successfully!",
    success: true,
    data: subtask,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * REMOVE SUBTASK FROM TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REMOVE SUBTASK ==>
export const removeSubtask = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING PARENT TASK ID AND SUBTASK ID FROM REQUEST PARAMS
  const { id: parentTaskId, subtaskId } = req.params;
  // VALIDATE REQUIRED FIELDS
  if (!parentTaskId || !subtaskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Parent Task ID and Subtask ID are Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF PARENT TASK EXISTS AND BELONGS TO USER
  const parentTask = await Task.findOne({ _id: parentTaskId, userId }).exec();
  // IF PARENT TASK NOT FOUND, RETURN 404 ERROR
  if (!parentTask) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Parent task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF SUBTASK EXISTS IN PARENT
  const subtaskIndex = parentTask.subtasks?.findIndex(
    (id: any) => id.toString() === subtaskId
  );
  // IF SUBTASK NOT FOUND, RETURN 404 ERROR
  if (subtaskIndex === undefined || subtaskIndex === -1) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Subtask not found in parent task!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // REMOVE SUBTASK FROM PARENT
  parentTask.subtasks.splice(subtaskIndex, 1);
  // SAVE PARENT TASK
  await parentTask.save();
  // UPDATE SUBTASK TO REMOVE PARENT REFERENCE (CONVERT TO STANDALONE TASK)
  await Task.findByIdAndUpdate(subtaskId, { parentTask: null }).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Subtask removed successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET SUBTASKS FOR TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET SUBTASKS ==>
export const getSubtasks = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK ID FROM REQUEST PARAMS
  const taskId = req.params.id;
  // VALIDATE TASK ID
  if (!taskId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND TASK WITH POPULATED SUBTASKS
  const task = await Task.findOne({ _id: taskId, userId })
    .populate({
      path: "subtasks",
      select: "title status priority taskKey dueDate createdAt",
      match: { isTrashed: false },
    })
    .lean()
    .exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!task) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: task.subtasks?.length || 0,
    data: task.subtasks || [],
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET DEPENDENCY GRAPH FOR VISUALIZATION
 * Returns nodes and edges for react-flow visualization
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET DEPENDENCY GRAPH ==>
export const getDependencyGraph = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING PROJECT ID FROM QUERY (OPTIONAL)
  const { projectId } = req.query;
  // BUILD QUERY
  const query: any = { userId, isTrashed: false };
  // IF PROJECT ID IS PROVIDED, ADD PROJECT ID TO QUERY
  if (projectId) {
    // ADD PROJECT ID TO QUERY
    query.projectId = projectId;
  }
  // FIND ALL TASKS WITH DEPENDENCIES
  const tasks = await Task.find(query)
    .select("title status priority taskKey dependencies subtasks parentTask")
    .lean()
    .exec();
  // BUILD NODES AND EDGES FOR GRAPH
  const nodes = tasks.map((task: any, index: number) => ({
    id: task._id.toString(),
    type: "taskNode",
    position: { x: (index % 5) * 200, y: Math.floor(index / 5) * 100 },
    data: {
      label: task.title,
      taskKey: task.taskKey,
      status: task.status,
      priority: task.priority,
      isBlocked:
        task.dependencies?.some((dep: any) => dep.type === "blocked_by") ||
        false,
      hasSubtasks: task.subtasks?.length > 0,
      isSubtask: !!task.parentTask,
    },
  }));
  // BUILD EDGES FROM DEPENDENCIES
  const edges: any[] = [];
  // LOOP THROUGH TASKS
  tasks.forEach((task: any) => {
    // IF TASK HAS DEPENDENCIES, ADD DEPENDENCY EDGES
    task.dependencies?.forEach((dep: any) => {
      // IF DEPENDENCY TYPE IS "blocks", ADD BLOCKS EDGE
      if (dep.type === "blocks") {
        // ADD BLOCKS EDGE
        edges.push({
          id: `${task._id}-${dep.taskId}-blocks`,
          source: task._id.toString(),
          target: dep.taskId.toString(),
          type: "smoothstep",
          animated: true,
          style: { stroke: "#ef4444" },
          label: "blocks",
          data: { type: "blocks" },
        });
      } else if (dep.type === "relates_to") {
        // ADD RELATES TO EDGE
        edges.push({
          id: `${task._id}-${dep.taskId}-relates`,
          source: task._id.toString(),
          target: dep.taskId.toString(),
          type: "smoothstep",
          style: { stroke: "#6b7280", strokeDasharray: "5 5" },
          label: "relates to",
          data: { type: "relates_to" },
        });
      }
    });
    // ADD SUBTASK EDGES
    task.subtasks?.forEach((subtaskId: any) => {
      // ADD SUBTASK EDGE
      edges.push({
        id: `${task._id}-${subtaskId}-subtask`,
        source: task._id.toString(),
        target: subtaskId.toString(),
        type: "smoothstep",
        style: { stroke: "#3b82f6" },
        label: "subtask",
        data: { type: "subtask" },
      });
    });
  });
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      nodes,
      edges,
      taskCount: tasks.length,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GENERATE NEXT OCCURRENCE FOR A RECURRING TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GENERATE RECURRING TASK OCCURRENCE ==>
export const generateRecurringTaskOccurrence = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as any).id;
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
    // GETTING TASK ID FROM REQUEST PARAMS
    const { taskId } = req.params;
    // VALIDATE TASK ID
    if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Valid Task ID is Required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FIND THE ORIGINAL RECURRING TASK
    const originalTask = await Task.findOne({
      _id: taskId,
      userId,
      "recurrence.isRecurring": true,
      isTrashed: false,
    }).exec();
    // IF TASK NOT FOUND, RETURN 404 ERROR
    if (!originalTask) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Recurring task not found or unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECK IF END DATE HAS PASSED
    if (
      originalTask.recurrence?.endDate &&
      new Date() > new Date(originalTask.recurrence.endDate)
    ) {
      // RETURNING RESPONSE THAT RECURRENCE HAS ENDED
      res.status(400).json({
        message: "Recurrence period has ended!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CALCULATE NEW DUE DATE
    const baseDueDate = originalTask.dueDate || new Date();
    // CALCULATE NEW DUE DATE
    const newDueDate = calculateNextOccurrence(
      new Date(baseDueDate),
      (originalTask.recurrence?.pattern as RecurrencePattern) || "daily",
      originalTask.recurrence?.interval || 1,
      originalTask.recurrence?.daysOfWeek || [],
      originalTask.recurrence?.skipWeekends || false
    );
    // CHECK IF NEW DUE DATE IS AFTER END DATE
    if (
      originalTask.recurrence?.endDate &&
      newDueDate > new Date(originalTask.recurrence.endDate)
    ) {
      // DISABLE RECURRENCE ON ORIGINAL TASK
      originalTask.recurrence.isRecurring = false;
      // SAVE ORIGINAL TASK
      await originalTask.save();
      // RETURNING RESPONSE
      res.status(400).json({
        message: "Next occurrence would exceed end date. Recurrence disabled!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CREATE NEW TASK OCCURRENCE
    const newTaskData = {
      title: originalTask.title,
      description: originalTask.description,
      status: "to do",
      priority: originalTask.priority,
      dueDate: newDueDate,
      projectId: originalTask.projectId,
      userId: originalTask.userId,
      recurrence: {
        isRecurring: true,
        pattern: originalTask.recurrence?.pattern,
        interval: originalTask.recurrence?.interval,
        daysOfWeek: originalTask.recurrence?.daysOfWeek,
        dayOfMonth: originalTask.recurrence?.dayOfMonth,
        endDate: originalTask.recurrence?.endDate,
        skipWeekends: originalTask.recurrence?.skipWeekends,
        nextOccurrence: calculateNextOccurrence(
          newDueDate,
          (originalTask.recurrence?.pattern as RecurrencePattern) || "daily",
          originalTask.recurrence?.interval || 1,
          originalTask.recurrence?.daysOfWeek || [],
          originalTask.recurrence?.skipWeekends || false
        ),
        lastGeneratedAt: new Date(),
        originalTaskId:
          originalTask.recurrence?.originalTaskId || originalTask._id,
        occurrenceCount: (originalTask.recurrence?.occurrenceCount || 0) + 1,
      },
    };
    // CREATE NEW TASK
    const newTask = await Task.create(newTaskData);
    // UPDATE ORIGINAL TASK'S LAST GENERATED AT AND DISABLE RECURRENCE
    if (originalTask.recurrence) {
      // DISABLE RECURRENCE
      originalTask.recurrence.isRecurring = false;
      // SET LAST GENERATED AT
      originalTask.recurrence.lastGeneratedAt = new Date();
    }
    // SAVE ORIGINAL TASK
    await originalTask.save();
    // RETURNING RESPONSE
    res.status(201).json({
      message: "Recurring task occurrence generated successfully!",
      success: true,
      data: newTask,
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * GET RECURRING TASKS FOR USER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET RECURRING TASKS ==>
export const getRecurringTasks = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // FIND ALL RECURRING TASKS
  const recurringTasks = await Task.find({
    userId,
    "recurrence.isRecurring": true,
    isTrashed: false,
  })
    .populate("projectId", "title")
    .sort({ dueDate: 1 })
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: recurringTasks.length,
    data: recurringTasks,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE RECURRENCE SETTINGS FOR A TASK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE TASK RECURRENCE ==>
export const updateTaskRecurrence = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING TASK ID FROM REQUEST PARAMS
  const { taskId } = req.params;
  // GETTING RECURRENCE DATA FROM REQUEST BODY
  const { recurrence } = req.body;
  // VALIDATE TASK ID
  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Valid Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND TASK
  const task = await Task.findOne({ _id: taskId, userId }).exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!task) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Task not found or unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // UPDATE RECURRENCE SETTINGS
  if (recurrence && recurrence.isRecurring) {
    // CALCULATE NEXT OCCURRENCE
    const nextOccurrence = calculateNextOccurrence(
      task.dueDate ? new Date(task.dueDate) : new Date(),
      recurrence.pattern || "daily",
      recurrence.interval || 1,
      recurrence.daysOfWeek || [],
      recurrence.skipWeekends || false
    );
    // UPDATE RECURRENCE DATA - CAST TO ANY TO HANDLE MONGOOSE SCHEMA NULL DEFAULTS
    (task.recurrence as any) = {
      isRecurring: true,
      pattern: recurrence.pattern || "daily",
      interval: recurrence.interval || 1,
      daysOfWeek: recurrence.daysOfWeek || [],
      dayOfMonth: recurrence.dayOfMonth || null,
      endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
      skipWeekends: recurrence.skipWeekends || false,
      nextOccurrence,
      lastGeneratedAt: task.recurrence?.lastGeneratedAt || null,
      originalTaskId: task.recurrence?.originalTaskId || null,
      occurrenceCount: task.recurrence?.occurrenceCount || 0,
    };
  } else {
    // DISABLE RECURRENCE - CAST TO ANY TO HANDLE MONGOOSE SCHEMA NULL DEFAULTS
    (task.recurrence as any) = {
      isRecurring: false,
      pattern: null,
      interval: 1,
      daysOfWeek: [],
      dayOfMonth: null,
      endDate: null,
      skipWeekends: false,
      nextOccurrence: null,
      lastGeneratedAt: task.recurrence?.lastGeneratedAt || null,
      originalTaskId: task.recurrence?.originalTaskId || null,
      occurrenceCount: task.recurrence?.occurrenceCount || 0,
    };
  }
  // SAVE TASK
  await task.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task recurrence updated successfully!",
    success: true,
    data: task,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET TASK OCCURRENCES (ALL INSTANCES OF A RECURRING TASK)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TASK OCCURRENCES ==>
export const getTaskOccurrences = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
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
  // GETTING ORIGINAL TASK ID FROM REQUEST PARAMS
  const { taskId } = req.params;
  // VALIDATE TASK ID
  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Valid Task ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND ALL OCCURRENCES OF THIS RECURRING TASK
  const occurrences = await Task.find({
    userId,
    $or: [{ _id: taskId }, { "recurrence.originalTaskId": taskId }],
    isTrashed: false,
  })
    .populate("projectId", "title")
    .sort({ dueDate: 1 })
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: occurrences.length,
    data: occurrences,
  });
  // RETURNING FROM FUNCTION
  return;
});

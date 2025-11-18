// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";
import { createNotification } from "./notification.controller.js";

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
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING MONTHLY SUMMARY USING AGGREGATION
  const summary = await Task.aggregate([
    // MATCHING COMPLETED TASKS
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
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
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
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING QUERY PARAMETERS
  const { projectId, status, search, page, limit } = req.query;
  // PAGINATION PARAMETERS
  const pageNumber = parseInt(page as string) || 1;
  const pageSize = parseInt(limit as string) || 50;
  const skip = (pageNumber - 1) * pageSize;
  // BUILDING QUERY OBJECT
  let query: any = { userId, isTrashed: false };
  // IF PROJECT ID PROVIDED
  if (projectId) {
    query.projectId = projectId;
  }
  // IF STATUS PROVIDED
  if (status) {
    query.status = (status as string).toLowerCase();
  }
  // IF SEARCH PROVIDED
  if (search) {
    const searchRegex = new RegExp(search as string, "i");
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
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING TASK DATA FROM REQUEST BODY
  const { title, description, status, priority, dueDate, projectId } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!title || !projectId) {
    res.status(400).json({
      message: "Title and Project ID are Required!",
      success: false,
    });
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
    res.status(404).json({
      message: "Project not found or unauthorized!",
      success: false,
    });
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
    taskData.completedAt = new Date();
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
    io.emit("task_created", newTask);
  }
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Task created successfully!",
    success: true,
    data: newTask,
  });
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
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const { projectId } = req.params;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // VALIDATING PROJECT ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    res.status(400).json({
      message: "Invalid Project ID format!",
      success: false,
    });
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
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING TASK
  const task = await Task.findById(taskId)
    .populate("projectId", "title")
    .lean()
    .exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!task) {
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: task,
  });
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
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    return;
  }
  // GETTING STATUS FROM REQUEST BODY
  const { status } = req.body;
  // IF STATUS IS COMPLETED, SET COMPLETED AT
  if (status && status.toLowerCase() === "completed") {
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
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
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
    io.emit("task_updated", task);
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task updated successfully!",
    success: true,
    data: task,
  });
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
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING TASK BEFORE DELETION
  const task = await Task.findById(taskId).lean().exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!task) {
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
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
    io.emit("task_deleted", taskId);
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task deleted successfully!",
    success: true,
  });
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
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    return;
  }
  // GETTING CURRENT STATUS FROM REQUEST BODY
  const { status } = req.body;
  // FINDING TASK
  const existingTask = await Task.findById(taskId).lean().exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!existingTask) {
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
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
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
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
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task restored successfully!",
    success: true,
    data: task,
  });
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
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING TASK BEFORE DELETION
  const task = await Task.findById(taskId).lean().exec();
  // IF TASK NOT FOUND, RETURN 404 ERROR
  if (!task) {
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
    return;
  }
  // DELETING TASK PERMANENTLY
  await Task.findByIdAndDelete(taskId).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task permanently deleted successfully!",
    success: true,
  });
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
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
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
    res.status(404).json({
      message: "No trashed tasks found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: trashedTasks.length,
    data: trashedTasks,
  });
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
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
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
    res.status(400).json({
      message: "Task ID is Required!",
      success: false,
    });
    return;
  }
  // GETTING STATUS FROM REQUEST BODY
  const { status } = req.body;
  // IF STATUS NOT PROVIDED, RETURN 400 ERROR
  if (!status) {
    res.status(400).json({
      message: "Status is Required!",
      success: false,
    });
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
    res.status(404).json({
      message: "Task not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Task status updated successfully!",
    success: true,
    data: updatedTask,
  });
  return;
});

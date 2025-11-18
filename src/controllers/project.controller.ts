// <== IMPORTS ==>
import mongoose from "mongoose";
import { Project } from "../models/project.model.js";
import { Task } from "../models/task.model.js";
import { createNotification } from "./notification.controller.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET PROJECT STATISTICS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PROJECT STATISTICS ==>
export const getProjectsStats = expressAsyncHandler(async (req, res) => {
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
    Project.countDocuments({ userId, isTrashed: false }).exec(),
    Project.countDocuments({
      userId,
      status: "Completed",
      isTrashed: false,
    }).exec(),
    Project.countDocuments({
      userId,
      status: "In Progress",
      isTrashed: false,
    }).exec(),
    Project.countDocuments({
      userId,
      status: "To Do",
      isTrashed: false,
    }).exec(),
    Project.countDocuments({
      userId,
      dueDate: { $gte: startOfDay, $lt: endOfDay },
      isTrashed: false,
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
 * GET WEEKLY SUMMARY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WEEKLY SUMMARY ==>
export const getWeeklySummary = expressAsyncHandler(async (req, res) => {
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
  // FINDING ALL PROJECTS FOR USER
  const projects: any[] = await Project.find({ userId, isTrashed: false })
    .lean()
    .exec();
  // COUNTING COMPLETED PROJECTS
  const completedProjects = projects.filter(
    (p: any) => p.status === "Completed"
  ).length;
  // GETTING TARGET PROJECTS (TOTAL PROJECTS)
  const targetProjects = projects.length;
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      completedProjects,
      targetProjects,
    },
  });
  return;
});

/**
 * GET ALL PROJECTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ALL PROJECTS ==>
export const getProjects = expressAsyncHandler(async (req, res) => {
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
  // GETTING PROJECTS WITH TASK COUNTS USING AGGREGATION
  const projectsWithTaskCount = await Project.aggregate([
    // MATCHING USER ID AND NOT TRASHED
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        isTrashed: false,
      },
    },
    // LOOKING UP TASKS
    {
      $lookup: {
        from: "tasks",
        localField: "_id",
        foreignField: "projectId",
        as: "tasks",
      },
    },
    // ADDING TASK COUNT FIELDS
    {
      $addFields: {
        totalTasks: { $size: "$tasks" },
        completedTasks: {
          $size: {
            $filter: {
              input: "$tasks",
              cond: { $eq: ["$$this.status", "completed"] },
            },
          },
        },
      },
    },
    // REMOVING TASKS ARRAY FROM RESPONSE
    {
      $project: { tasks: 0 },
    },
  ]).exec();
  // IF NO PROJECTS FOUND, RETURN 404 ERROR
  if (!projectsWithTaskCount || projectsWithTaskCount.length === 0) {
    res.status(404).json({
      message: "No projects found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: projectsWithTaskCount.length,
    data: projectsWithTaskCount,
  });
  return;
});

/**
 * CREATE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE PROJECT ==>
export const createProject = expressAsyncHandler(async (req, res) => {
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
  // GETTING PROJECT DATA FROM REQUEST BODY
  const { title, description, priority, inChargeName, role, status, dueDate } =
    req.body;
  // VALIDATING REQUIRED FIELDS
  if (!title || !inChargeName || !role) {
    res.status(400).json({
      message: "Title, In Charge Name, and Role are Required!",
      success: false,
    });
    return;
  }
  // CREATING NEW PROJECT
  const project = await Project.create({
    title,
    description: description || "",
    priority: priority || "medium",
    inChargeName,
    role,
    status: status || "To Do",
    dueDate: dueDate || null,
    userId,
  });
  // CREATING NOTIFICATION FOR PROJECT CREATION
  await createNotification(
    userId,
    "project_created",
    "New Project Created",
    `Project "${project.title}" has been created successfully.`,
    project._id.toString(),
    (req as any).app
  );
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Project created successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * GET SINGLE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET SINGLE PROJECT ==>
export const getOneProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // GETTING PROJECT WITH TASKS USING AGGREGATION
  const projectWithTasks = await Project.aggregate([
    // MATCHING PROJECT ID
    {
      $match: { _id: new mongoose.Types.ObjectId(projectId) },
    },
    // LOOKING UP TASKS
    {
      $lookup: {
        from: "tasks",
        localField: "_id",
        foreignField: "projectId",
        as: "tasks",
      },
    },
    // ADDING TASK COUNT FIELD
    {
      $addFields: {
        totalTasks: { $size: "$tasks" },
      },
    },
    // REMOVING TASKS ARRAY FROM RESPONSE
    {
      $project: { tasks: 0 },
    },
  ]).exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!projectWithTasks || projectWithTasks.length === 0) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: projectWithTasks[0],
  });
  return;
});

/**
 * UPDATE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE PROJECT ==>
export const updateProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND UPDATING PROJECT
  const project = await Project.findByIdAndUpdate(projectId, req.body, {
    new: true,
    runValidators: true,
  })
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // CREATING NOTIFICATION FOR PROJECT UPDATE
  await createNotification(
    project.userId.toString(),
    "project_updated",
    "Project Updated",
    `Project "${project.title}" has been updated.`,
    project._id.toString(),
    (req as any).app
  );
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project updated successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * DELETE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE PROJECT ==>
export const deleteProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING PROJECT BEFORE DELETION
  const project = await Project.findById(projectId).lean().exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // DELETING ALL TASKS ASSOCIATED WITH PROJECT
  await Task.deleteMany({ projectId }).exec();
  // DELETING PROJECT
  await Project.findByIdAndDelete(projectId).exec();
  // CREATING NOTIFICATION FOR PROJECT DELETION
  await createNotification(
    project.userId.toString(),
    "project_deleted",
    "Project Deleted",
    `Project "${project.title}" has been deleted.`,
    project._id.toString(),
    (req as any).app
  );
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project deleted successfully!",
    success: true,
  });
  return;
});

/**
 * MOVE PROJECT TO TRASH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MOVE PROJECT TO TRASH ==>
export const moveToTrash = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND UPDATING PROJECT
  const project = await Project.findByIdAndUpdate(
    projectId,
    { isTrashed: true, deletedOn: new Date() },
    { new: true }
  )
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project moved to trash successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * RESTORE PROJECT FROM TRASH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RESTORE PROJECT FROM TRASH ==>
export const restoreProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND UPDATING PROJECT
  const project = await Project.findByIdAndUpdate(
    projectId,
    { isTrashed: false, deletedOn: null },
    { new: true }
  )
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project restored successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * GET TRASHED PROJECTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TRASHED PROJECTS ==>
export const getTrashedProjects = expressAsyncHandler(async (req, res) => {
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
  // FINDING TRASHED PROJECTS
  const trashedProjects = await Project.find({
    userId,
    isTrashed: true,
  })
    .sort({ deletedOn: -1 })
    .lean()
    .exec();
  // IF NO TRASHED PROJECTS FOUND, RETURN 404 ERROR
  if (!trashedProjects || trashedProjects.length === 0) {
    res.status(404).json({
      message: "No trashed projects found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: trashedProjects.length,
    data: trashedProjects,
  });
  return;
});

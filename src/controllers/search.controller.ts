// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";

// <== SEARCH RESULT TYPE ==>
type SearchResultItem = {
  // <== ID ==>
  id: string;
  // <== TITLE ==>
  title: string;
  // <== DESCRIPTION ==>
  description?: string;
  // <== TYPE ==>
  type: "task" | "project";
  // <== STATUS ==>
  status?: string;
  // <== PATH ==>
  path: string;
  // <== DUE DATE ==>
  dueDate?: Date | null;
  // <== PRIORITY ==>
  priority?: string;
  // <== PROJECT ID ==>
  projectId?: string;
  // <== PROJECT TITLE ==>
  projectTitle?: string;
};

/**
 * GLOBAL SEARCH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GLOBAL SEARCH ==>
export const globalSearch = expressAsyncHandler(async (req, res) => {
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
  // GETTING SEARCH QUERY FROM REQUEST
  const { q, limit = "10", types } = req.query;
  // IF NO QUERY PROVIDED, RETURN 400 ERROR
  if (!q || typeof q !== "string" || q.trim().length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Search query is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // PARSE LIMIT
  const resultLimit = Math.min(parseInt(limit as string) || 10, 50);
  // PARSE TYPES TO SEARCH
  const searchTypes = types
    ? (types as string).split(",").map((t) => t.trim().toLowerCase())
    : ["task", "project"];
  // CREATE SEARCH REGEX
  const searchQuery = q.trim();
  // CREATE SEARCH REGEX
  const searchRegex = new RegExp(searchQuery, "i");
  // RESULTS CONTAINER
  const results: {
    tasks: SearchResultItem[];
    projects: SearchResultItem[];
  } = {
    tasks: [],
    projects: [],
  };
  // SEARCH TASKS
  if (searchTypes.includes("task")) {
    // FIND TASKS
    const tasks = await Task.find({
      userId: new mongoose.Types.ObjectId(String(userId)),
      isTrashed: false,
      $or: [{ title: searchRegex }, { description: searchRegex }],
    })
      .populate("projectId", "title")
      .sort({ updatedAt: -1 })
      .limit(resultLimit)
      .lean()
      .exec();
    // MAP TASKS TO SEARCH RESULTS
    results.tasks = tasks.map((task: any) => ({
      id: task._id.toString(),
      title: task.title,
      description: task.description || undefined,
      type: "task" as const,
      status: task.status,
      path: `/tasks`,
      dueDate: task.dueDate || null,
      priority: task.priority,
      projectId: task.projectId?._id?.toString() || task.projectId?.toString(),
      projectTitle: task.projectId?.title || undefined,
    }));
  }
  // SEARCH PROJECTS
  if (searchTypes.includes("project")) {
    // FIND PROJECTS
    const projects = await Project.find({
      userId: new mongoose.Types.ObjectId(String(userId)),
      isTrashed: false,
      $or: [{ title: searchRegex }, { description: searchRegex }],
    })
      .sort({ updatedAt: -1 })
      .limit(resultLimit)
      .lean()
      .exec();
    // MAP PROJECTS TO SEARCH RESULTS
    results.projects = projects.map((project: any) => ({
      id: project._id.toString(),
      title: project.title,
      description: project.description || undefined,
      type: "project" as const,
      status: project.status,
      path: `/projects/${project._id}`,
      dueDate: project.dueDate || null,
    }));
  }
  // CALCULATE TOTAL COUNT
  const totalCount = results.tasks.length + results.projects.length;
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    query: searchQuery,
    totalCount,
    data: results,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET RECENT ITEMS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET RECENT ITEMS ==>
export const getRecentItems = expressAsyncHandler(async (req, res) => {
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
  // GETTING LIMIT FROM QUERY
  const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
  // FIND RECENT TASKS
  const recentTasks = await Task.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    isTrashed: false,
  })
    .populate("projectId", "title")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()
    .exec();
  // FIND RECENT PROJECTS
  const recentProjects = await Project.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    isTrashed: false,
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()
    .exec();
  // MAP RECENT TASKS TO SEARCH RESULT ITEM
  const tasks: SearchResultItem[] = recentTasks.map((task: any) => ({
    id: task._id.toString(),
    title: task.title,
    description: task.description || undefined,
    type: "task" as const,
    status: task.status,
    path: `/tasks`,
    dueDate: task.dueDate || null,
    priority: task.priority,
    projectId: task.projectId?._id?.toString() || task.projectId?.toString(),
    projectTitle: task.projectId?.title || undefined,
  }));
  // MAP RECENT PROJECTS TO SEARCH RESULT ITEM
  const projects: SearchResultItem[] = recentProjects.map((project: any) => ({
    id: project._id.toString(),
    title: project.title,
    description: project.description || undefined,
    type: "project" as const,
    status: project.status,
    path: `/projects/${project._id}`,
    dueDate: project.dueDate || null,
  }));
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      tasks,
      projects,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET QUICK ACTIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET QUICK ACTIONS ==>
export const getQuickActions = expressAsyncHandler(async (req, res) => {
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
  // DEFINE QUICK ACTIONS
  const quickActions = [
    // CREATE NEW TASK
    {
      id: "create-task",
      title: "Create New Task",
      description: "Add a new task to a project",
      icon: "plus",
      path: "/tasks",
      shortcut: "N",
    },
    // CREATE NEW PROJECT
    {
      id: "create-project",
      title: "Create New Project",
      description: "Start a new project",
      icon: "folder-plus",
      path: "/projects",
      shortcut: "P",
    },
    // GO TO DASHBOARD
    {
      id: "go-dashboard",
      title: "Go to Dashboard",
      description: "View your dashboard",
      icon: "layout-dashboard",
      path: "/dashboard",
      shortcut: "1",
    },
    // GO TO TASKS
    {
      id: "go-tasks",
      title: "Go to Tasks",
      description: "View all tasks",
      icon: "list-todo",
      path: "/tasks",
      shortcut: "3",
    },
    // GO TO PROJECTS
    {
      id: "go-projects",
      title: "Go to Projects",
      description: "View all projects",
      icon: "folder",
      path: "/projects",
      shortcut: "2",
    },
    // GO TO SETTINGS
    {
      id: "go-settings",
      title: "Go to Settings",
      description: "Manage your settings",
      icon: "settings",
      path: "/settings",
      shortcut: "S",
    },
  ];
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: quickActions,
  });
  // RETURNING FROM FUNCTION
  return;
});

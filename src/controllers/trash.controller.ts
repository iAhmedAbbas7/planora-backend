// <== IMPORTS ==>
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET ALL TRASHED ITEMS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ALL TRASHED ITEMS ==>
export const getAllTrashedItems = expressAsyncHandler(async (req, res) => {
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
  const { type, search } = req.query;
  // BUILDING QUERY OBJECT FOR PROJECTS
  let projectQuery: any = { userId, isTrashed: true };
  // BUILDING QUERY OBJECT FOR TASKS
  let taskQuery: any = { userId, isTrashed: true };
  // IF SEARCH PROVIDED
  if (search) {
    // CREATING SEARCH REGEX
    const searchRegex = new RegExp(search as string, "i");
    // ADDING SEARCH QUERY TO PROJECT QUERY
    projectQuery.$or = [{ title: searchRegex }, { description: searchRegex }];
    // ADDING SEARCH QUERY TO TASK QUERY
    taskQuery.$or = [{ title: searchRegex }, { description: searchRegex }];
  }
  // GETTING TRASHED ITEMS IN PARALLEL
  const projectsPromise: Promise<any[]> =
    type === "tasks"
      ? Promise.resolve([])
      : Project.find(projectQuery).sort({ deletedOn: -1 }).lean().exec();
  // CREATING TASKS PROMISE
  const tasksPromise: Promise<any[]> =
    type === "projects"
      ? Promise.resolve([])
      : Task.find(taskQuery)
          .populate("projectId", "title")
          .sort({ deletedOn: -1 })
          .lean()
          .exec();
  // GETTING TRASHED ITEMS IN PARALLEL
  const [trashedProjects, trashedTasks] = await Promise.all([
    projectsPromise,
    tasksPromise,
  ]);
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      projects: trashedProjects || [],
      tasks: trashedTasks || [],
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * BULK RESTORE ITEMS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== BULK RESTORE ITEMS ==>
export const bulkRestore = expressAsyncHandler(async (req, res) => {
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
  // GETTING ITEM IDS FROM REQUEST BODY
  const { projectIds, taskIds } = req.body;
  // INITIALIZING RESULTS OBJECT
  const results: {
    restoredProjects: any[];
    restoredTasks: any[];
    errors: string[];
  } = {
    restoredProjects: [],
    restoredTasks: [],
    errors: [],
  };
  // RESTORING PROJECTS
  // IF PROJECT IDS PROVIDED
  if (projectIds && Array.isArray(projectIds) && projectIds.length > 0) {
    // ITERATING OVER PROJECT IDS
    for (const projectId of projectIds) {
      // TRYING TO RESTORE PROJECT
      try {
        // FINDING AND UPDATING PROJECT
        const project = await Project.findOneAndUpdate(
          { _id: projectId, userId, isTrashed: true },
          { isTrashed: false, deletedOn: null },
          { new: true }
        )
          .lean()
          .exec();
        // IF PROJECT FOUND, ADD TO RESULTS
        if (project) {
          // ADDING PROJECT TO RESULTS
          results.restoredProjects.push(project);
        }
      } catch (error: any) {
        // ADDING ERROR TO RESULTS
        results.errors.push(
          `Failed to restore project ${projectId}: ${error.message}`
        );
      }
    }
  }
  // RESTORING TASKS
  // IF TASK IDS PROVIDED
  if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
    // ITERATING OVER TASK IDS
    for (const taskId of taskIds) {
      // TRYING TO RESTORE TASK
      try {
        // FINDING TASK TO GET ORIGINAL STATUS
        const existingTask = await Task.findById(taskId).lean().exec();
        // FINDING AND UPDATING TASK
        const task = await Task.findOneAndUpdate(
          { _id: taskId, userId, isTrashed: true },
          {
            isTrashed: false,
            deletedOn: null,
            status: existingTask?.originalStatus || "to do",
          },
          { new: true }
        )
          .lean()
          .exec();
        // IF TASK FOUND, ADD TO RESULTS
        if (task) {
          // ADDING TASK TO RESULTS
          results.restoredTasks.push(task);
        }
      } catch (error: any) {
        // ADDING ERROR TO RESULTS
        results.errors.push(
          `Failed to restore task ${taskId}: ${error.message}`
        );
      }
    }
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Bulk restore completed!",
    success: true,
    data: results,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * BULK PERMANENT DELETE ITEMS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== BULK PERMANENT DELETE ITEMS ==>
export const bulkPermanentDelete = expressAsyncHandler(async (req, res) => {
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
  // GETTING ITEM IDS FROM REQUEST BODY
  const { projectIds, taskIds } = req.body;
  // INITIALIZING RESULTS OBJECT
  const results: {
    deletedProjects: any[];
    deletedTasks: any[];
    errors: string[];
  } = {
    deletedProjects: [],
    deletedTasks: [],
    errors: [],
  };
  // PERMANENTLY DELETING PROJECTS
  if (projectIds && Array.isArray(projectIds) && projectIds.length > 0) {
    // ITERATING OVER PROJECT IDS
    for (const projectId of projectIds) {
      // TRYING TO DELETE PROJECT
      try {
        // FINDING AND DELETING PROJECT
        const project = await Project.findOneAndDelete({
          _id: projectId,
          userId,
          isTrashed: true,
        })
          .lean()
          .exec();
        // IF PROJECT FOUND, ADD TO RESULTS
        if (project) {
          // ADDING PROJECT TO RESULTS
          results.deletedProjects.push(project);
          // DELETING ALL TASKS ASSOCIATED WITH PROJECT
          await Task.deleteMany({ projectId }).exec();
        }
      } catch (error: any) {
        // ADDING ERROR TO RESULTS
        results.errors.push(
          `Failed to delete project ${projectId}: ${error.message}`
        );
      }
    }
  }
  // PERMANENTLY DELETING TASKS
  if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
    // ITERATING OVER TASK IDS
    for (const taskId of taskIds) {
      // TRYING TO DELETE TASK
      try {
        // FINDING AND DELETING TASK
        const task = await Task.findOneAndDelete({
          _id: taskId,
          userId,
          isTrashed: true,
        })
          .lean()
          .exec();
        // IF TASK FOUND, ADD TO RESULTS
        if (task) {
          // ADDING TASK TO RESULTS
          results.deletedTasks.push(task);
        }
      } catch (error: any) {
        // ADDING ERROR TO RESULTS
        results.errors.push(
          `Failed to delete task ${taskId}: ${error.message}`
        );
      }
    }
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Bulk permanent delete completed!",
    success: true,
    data: results,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * EMPTY TRASH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== EMPTY TRASH ==>
export const emptyTrash = expressAsyncHandler(async (req, res) => {
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
  // DELETING ALL TRASHED ITEMS IN PARALLEL
  const [deletedProjects, deletedTasks] = await Promise.all([
    // DELETING ALL TRASHED PROJECTS
    Project.deleteMany({ userId, isTrashed: true }).exec(),
    // DELETING ALL TRASHED TASKS
    Task.deleteMany({ userId, isTrashed: true }).exec(),
  ]);
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Trash emptied successfully!",
    success: true,
    data: {
      deletedProjects: deletedProjects.deletedCount,
      deletedTasks: deletedTasks.deletedCount,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

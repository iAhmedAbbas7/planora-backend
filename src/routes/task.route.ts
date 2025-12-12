// <== IMPORTS ==>
import {
  getAllTasks,
  getTaskStats,
  getMonthlySummary,
  getRecentTasks,
  createTask,
  getOneTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  moveTaskToTrash,
  restoreTask,
  permanentlyDeleteTask,
  getTrashedTasks,
  getTasksByProjectId,
  addDependency,
  removeDependency,
  getBlockers,
  getBlockedTasks,
  getTaskDependencies,
  addSubtask,
  removeSubtask,
  getSubtasks,
  getDependencyGraph,
} from "../controllers/task.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET ALL TASKS
router.get("/", getAllTasks);
// CREATE TASK
router.post("/", createTask);
// <== SPECIFIC ROUTES MUST BE DEFINED BEFORE PARAMETERIZED ROUTES ==>
// GET TASK STATISTICS
router.get("/stats", getTaskStats);
// GET RECENT TASKS
router.get("/recent", getRecentTasks);
// GET TRASHED TASKS
router.get("/trashed", getTrashedTasks);
// GET MONTHLY SUMMARY
router.get("/monthly-summary", getMonthlySummary);
// GET TASKS BY PROJECT ID
router.get("/project/:projectId", getTasksByProjectId);
// <== DEPENDENCY GRAPH ROUTE (BEFORE PARAMETERIZED ROUTES) ==>
// GET DEPENDENCY GRAPH
router.get("/dependency-graph", getDependencyGraph);
// <== PARAMETERIZED ROUTES MUST BE AFTER SPECIFIC ROUTES ==>
// GET SINGLE TASK
router.get("/:id", getOneTask);
// UPDATE TASK
router.put("/:id", updateTask);
// DELETE TASK
router.delete("/:id", deleteTask);
// UPDATE TASK STATUS
router.patch("/:id", updateTaskStatus);
// RESTORE TASK FROM TRASH
router.put("/:id/restore", restoreTask);
// MOVE TASK TO TRASH
router.put("/:id/trash", moveTaskToTrash);
// PERMANENTLY DELETE TASK
router.delete("/:id/permanent", permanentlyDeleteTask);
// <== DEPENDENCY ROUTES ==>
// GET TASK DEPENDENCIES
router.get("/:id/dependencies", getTaskDependencies);
// ADD DEPENDENCY TO TASK
router.post("/:id/dependencies", addDependency);
// REMOVE DEPENDENCY FROM TASK
router.delete("/:id/dependencies/:dependencyId", removeDependency);
// GET BLOCKERS (TASKS BLOCKING THIS TASK)
router.get("/:id/blockers", getBlockers);
// GET BLOCKED TASKS (TASKS THIS TASK BLOCKS)
router.get("/:id/blocked", getBlockedTasks);
// <== SUBTASK ROUTES ==>
// GET SUBTASKS
router.get("/:id/subtasks", getSubtasks);
// ADD SUBTASK
router.post("/:id/subtasks", addSubtask);
// REMOVE SUBTASK
router.delete("/:id/subtasks/:subtaskId", removeSubtask);

export default router;

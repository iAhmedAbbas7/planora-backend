// <== IMPORTS ==>
import {
  createGoal,
  getGoals,
  getGoalById,
  updateGoal,
  deleteGoal,
  linkTaskToGoal,
  unlinkTaskFromGoal,
  linkProjectToGoal,
  unlinkProjectFromGoal,
  calculateProgress,
  getGoalsHierarchy,
  getGoalStats,
} from "../controllers/goal.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);

// GET GOAL STATISTICS
router.get("/stats", getGoalStats);
// GET GOALS HIERARCHY
router.get("/hierarchy", getGoalsHierarchy);
// GET ALL GOALS
router.get("/", getGoals);
// CREATE GOAL
router.post("/", createGoal);
// UPDATE GOAL
router.put("/:id", updateGoal);
// GET SINGLE GOAL
router.get("/:id", getGoalById);
// DELETE GOAL
router.delete("/:id", deleteGoal);
// LINK TASK TO GOAL
router.post("/:id/link-task", linkTaskToGoal);
// LINK PROJECT TO GOAL
router.post("/:id/link-project", linkProjectToGoal);
// CALCULATE GOAL PROGRESS
router.post("/:id/calculate-progress", calculateProgress);
// UNLINK TASK FROM GOAL
router.delete("/:id/unlink-task/:taskId", unlinkTaskFromGoal);
// UNLINK PROJECT FROM GOAL
router.delete("/:id/unlink-project/:projectId", unlinkProjectFromGoal);

export default router;

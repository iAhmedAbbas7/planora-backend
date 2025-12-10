// <== IMPORTS ==>
import {
  generateStandup,
  naturalLanguageToTasks,
  predictSprint,
  getCodeReviewInsights,
  saveAITasks,
} from "../controllers/workspaceAI.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GENERATE STANDUP SUMMARY FOR WORKSPACE MEMBER
router.get("/:workspaceId/standup", generateStandup);
// SAVE AI GENERATED TASKS
router.post("/:workspaceId/save-tasks", saveAITasks);
// PREDICT SPRINT COMPLETION
router.get("/:workspaceId/predict-sprint", predictSprint);
// CONVERT NATURAL LANGUAGE TO TASKS
router.post("/:workspaceId/nl-to-tasks", naturalLanguageToTasks);
// GET CODE REVIEW INSIGHTS
router.get("/:workspaceId/code-review-insights", getCodeReviewInsights);

export default router;

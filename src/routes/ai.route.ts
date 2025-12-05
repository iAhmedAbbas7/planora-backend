// <== IMPORTS ==>
import {
  getAIStatus,
  generateTasksFromReadme,
  generateTasksFromCommits,
  suggestNextTasks,
  summarizeRepository,
  saveGeneratedTasks,
  aiCategorizeRepository,
  aiRepositoryHealthScore,
} from "../controllers/ai.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET AI STATUS
router.get("/status", getAIStatus);
// SUMMARIZE REPOSITORY
router.post("/summarize", summarizeRepository);
// SAVE GENERATED TASKS TO PROJECT
router.post("/save-tasks", saveGeneratedTasks);
// SUGGEST NEXT TASKS FOR PROJECT
router.get("/suggest/:projectId", suggestNextTasks);
// GENERATE TASKS FROM README
router.post("/generate/readme", generateTasksFromReadme);
// GENERATE TASKS FROM COMMITS
router.post("/generate/commits", generateTasksFromCommits);
// AI REPOSITORY HEALTH SCORE
router.get("/health/:owner/:repo", aiRepositoryHealthScore);
// AI CATEGORIZE REPOSITORY
router.get("/categorize/:owner/:repo", aiCategorizeRepository);

export default router;

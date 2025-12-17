// <== IMPORTS ==>
import {
  suggestKeyResults,
  analyzeGoalProgress,
  suggestGoalAlignment,
  generateObjective,
} from "../controllers/goalAI.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// ANALYZE GOAL PROGRESS
router.get("/analyze-progress", analyzeGoalProgress);
// GENERATE OBJECTIVE FROM DESCRIPTION
router.post("/generate-objective", generateObjective);
// SUGGEST KEY RESULTS FOR AN OBJECTIVE
router.post("/suggest-key-results", suggestKeyResults);
// SUGGEST ALIGNMENT FOR A GOAL
router.get("/:goalId/suggest-alignment", suggestGoalAlignment);

export default router;

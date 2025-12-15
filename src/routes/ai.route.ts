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
  aiCodeExplainer,
  generateCommitMessage,
  summarizeCommitHistory,
  suggestBranchStrategy,
  aiCodeReview,
  aiIssueAnalyzer,
  aiGenerateIssue,
  aiPermissionRecommendation,
  aiAnalyzeWorkflowFailure,
  aiSuggestWorkflowImprovements,
  aiRepositoryAnalysis,
  aiCodeQualityScan,
  aiSecurityScan,
  aiGenerateReadme,
  aiActivityInsights,
  getDailyBriefing,
  suggestDueDate,
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
// AI CODE EXPLAINER
router.post("/explain-code", aiCodeExplainer);
// AI GENERATE COMMIT MESSAGE
router.post("/generate-commit-message", generateCommitMessage);
// AI SUMMARIZE COMMIT HISTORY
router.post("/summarize-commits", summarizeCommitHistory);
// AI SUGGEST BRANCH STRATEGY
router.post("/suggest-branch-strategy", suggestBranchStrategy);
// AI CODE REVIEW FOR PULL REQUESTS
router.post("/review-pr", aiCodeReview);
// AI ISSUE ANALYZER (AUTO-LABEL, DUPLICATES, SOLUTIONS)
router.post("/analyze-issue", aiIssueAnalyzer);
// AI GENERATE ISSUE FROM DESCRIPTION
router.post("/generate-issue", aiGenerateIssue);
// AI PERMISSION RECOMMENDATION FOR COLLABORATORS
router.post("/recommend-permission", aiPermissionRecommendation);
// AI ANALYZE WORKFLOW FAILURE
router.post("/analyze-workflow-failure", aiAnalyzeWorkflowFailure);
// AI SUGGEST WORKFLOW IMPROVEMENTS
router.post("/suggest-workflow-improvements", aiSuggestWorkflowImprovements);
// AI REPOSITORY COMPREHENSIVE ANALYSIS
router.post("/repository-analysis", aiRepositoryAnalysis);
// AI CODE QUALITY SCAN
router.post("/code-quality-scan", aiCodeQualityScan);
// AI SECURITY SCAN
router.post("/security-scan", aiSecurityScan);
// AI GENERATE README
router.post("/generate-readme", aiGenerateReadme);
// AI ACTIVITY INSIGHTS
router.post("/activity-insights", aiActivityInsights);
// AI DAILY BRIEFING
router.get("/daily-briefing", getDailyBriefing);
// AI SUGGEST DUE DATE
router.post("/suggest-due-date", suggestDueDate);

export default router;

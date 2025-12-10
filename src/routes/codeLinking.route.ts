// <== IMPORTS ==>
import {
  scanCommitsForTasks,
  linkCommitToTask,
  linkPullRequestToTask,
  linkFileToTask,
  linkBranchToTask,
  getLinkedCode,
  unlinkCode,
  analyzeTaskImpact,
  getWorkspaceTasksWithLinkedCode,
} from "../controllers/codeLinking.controller.js";
import { Router } from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== CREATE ROUTER ==>
const router = Router();
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET LINKED CODE FOR A TASK
router.get("/tasks/:taskId", getLinkedCode);
// LINK A FILE TO A TASK
router.post("/tasks/:taskId/files", linkFileToTask);
// SCAN COMMITS FOR TASKS AND LINK THEM
router.post("/:workspaceId/scan", scanCommitsForTasks);
// LINK A COMMIT TO A TASK
router.post("/tasks/:taskId/commits", linkCommitToTask);
// LINK A BRANCH TO A TASK
router.post("/tasks/:taskId/branches", linkBranchToTask);
// UNLINK CODE FROM A TASK
router.delete("/tasks/:taskId/:type/:identifier", unlinkCode);
// ANALYZE TASK IMPACT USING AI
router.post("/tasks/:taskId/analyze-impact", analyzeTaskImpact);
// LINK A PULL REQUEST TO A TASK
router.post("/tasks/:taskId/pull-requests", linkPullRequestToTask);
// GET WORKSPACE TASKS WITH LINKED CODE
router.get("/:workspaceId/tasks", getWorkspaceTasksWithLinkedCode);

export default router;

// <== IMPORTS ==>
import {
  getDORAMetrics,
  getDeploymentHistory,
  getWorkflowRunsSummary,
} from "../controllers/workspaceAnalytics.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET DORA METRICS FOR WORKSPACE
router.get("/:id/dora", getDORAMetrics);
// GET DEPLOYMENT HISTORY FOR WORKSPACE
router.get("/:id/deployments", getDeploymentHistory);
// GET WORKFLOW RUNS SUMMARY FOR WORKSPACE
router.get("/:id/workflows", getWorkflowRunsSummary);

export default router;

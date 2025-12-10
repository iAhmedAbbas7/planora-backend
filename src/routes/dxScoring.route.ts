// <== IMPORTS ==>
import {
  getMemberDXScore,
  getWorkspaceLeaderboard,
  getMemberAchievements,
  getAIDXRecommendations,
  syncMemberActivity,
  getTeamPerformanceSummary,
} from "../controllers/dxScoring.controller.js";
import { Router } from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== CREATE ROUTER ==>
const router = Router();
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET CURRENT USER'S DX SCORE
router.get("/:workspaceId/score", getMemberDXScore);
// SYNC MEMBER ACTIVITY FROM GITHUB
router.post("/:workspaceId/sync", syncMemberActivity);
// GET SPECIFIC MEMBER'S DX SCORE
router.get("/:workspaceId/score/:memberId", getMemberDXScore);
// GET CURRENT USER'S ACHIEVEMENTS
router.get("/:workspaceId/achievements", getMemberAchievements);
// GET WORKSPACE LEADERBOARD
router.get("/:workspaceId/leaderboard", getWorkspaceLeaderboard);
// GET AI RECOMMENDATIONS FOR CURRENT USER
router.get("/:workspaceId/recommendations", getAIDXRecommendations);
// GET TEAM PERFORMANCE SUMMARY
router.get("/:workspaceId/team-summary", getTeamPerformanceSummary);
// GET SPECIFIC MEMBER'S ACHIEVEMENTS
router.get("/:workspaceId/achievements/:memberId", getMemberAchievements);
// GET AI RECOMMENDATIONS FOR SPECIFIC MEMBER
router.get("/:workspaceId/recommendations/:memberId", getAIDXRecommendations);

export default router;

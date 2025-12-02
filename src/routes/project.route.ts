// <== IMPORTS ==>
import {
  getProjects,
  getProjectsStats,
  createProject,
  getOneProject,
  updateProject,
  deleteProject,
  moveToTrash,
  restoreProject,
  getTrashedProjects,
  getWeeklySummary,
} from "../controllers/project.controller.js";
import {
  getCommentsByProjectId,
  createComment,
  deleteComment,
} from "../controllers/comment.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET ALL PROJECTS
router.get("/", getProjects);
// CREATE PROJECT
router.post("/", createProject);
// GET SINGLE PROJECT
router.get("/:id", getOneProject);
// UPDATE PROJECT
router.put("/:id", updateProject);
// DELETE PROJECT
router.delete("/:id", deleteProject);
// MOVE PROJECT TO TRASH
router.put("/:id/trash", moveToTrash);
// GET PROJECT STATISTICS
router.get("/stats", getProjectsStats);
// RESTORE PROJECT FROM TRASH
router.put("/:id/restore", restoreProject);
// GET TRASHED PROJECTS
router.get("/trashed", getTrashedProjects);
// GET WEEKLY SUMMARY
router.get("/weekly-summary", getWeeklySummary);
// CREATE COMMENT
router.post("/:projectId/comments", createComment);
// DELETE COMMENT
router.delete("/comments/:commentId", deleteComment);
// GET COMMENTS BY PROJECT ID
router.get("/:projectId/comments", getCommentsByProjectId);

export default router;

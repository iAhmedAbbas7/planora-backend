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
  linkGitHubRepo,
  unlinkGitHubRepo,
  getProjectGitHubData,
  addLinkedRepository,
  removeLinkedRepository,
  setPrimaryRepository,
  getLinkedRepositories,
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
// GET PROJECT STATISTICS
router.get("/stats", getProjectsStats);
// GET TRASHED PROJECTS
router.get("/trashed", getTrashedProjects);
// GET WEEKLY SUMMARY
router.get("/weekly-summary", getWeeklySummary);
// DELETE COMMENT (NO PROJECT ID IN PATH)
router.delete("/comments/:commentId", deleteComment);
// GET SINGLE PROJECT
router.get("/:id", getOneProject);
// UPDATE PROJECT
router.put("/:id", updateProject);
// DELETE PROJECT
router.delete("/:id", deleteProject);
// MOVE PROJECT TO TRASH
router.put("/:id/trash", moveToTrash);
// RESTORE PROJECT FROM TRASH
router.put("/:id/restore", restoreProject);
// LINK GITHUB REPOSITORY TO PROJECT
router.post("/:id/github/link", linkGitHubRepo);
// GET PROJECT GITHUB DATA
router.get("/:id/github", getProjectGitHubData);
// CREATE COMMENT
router.post("/:projectId/comments", createComment);
// UNLINK GITHUB REPOSITORY FROM PROJECT
router.delete("/:id/github/unlink", unlinkGitHubRepo);
// GET COMMENTS BY PROJECT ID
router.get("/:projectId/comments", getCommentsByProjectId);
// GET ALL LINKED REPOSITORIES FOR A PROJECT
router.get("/:id/repositories", getLinkedRepositories);
// ADD LINKED REPOSITORY TO PROJECT
router.post("/:id/repositories", addLinkedRepository);
// REMOVE LINKED REPOSITORY FROM PROJECT
router.delete("/:id/repositories/:repoId", removeLinkedRepository);
// SET PRIMARY REPOSITORY
router.put("/:id/repositories/:repoId/primary", setPrimaryRepository);

export default router;

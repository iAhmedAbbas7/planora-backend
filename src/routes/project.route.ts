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
// <== SPECIFIC ROUTES MUST BE DEFINED BEFORE PARAMETERIZED ROUTES ==>
// GET PROJECT STATISTICS
router.get("/stats", getProjectsStats);
// GET TRASHED PROJECTS
router.get("/trashed", getTrashedProjects);
// GET WEEKLY SUMMARY
router.get("/weekly-summary", getWeeklySummary);
// <== PARAMETERIZED ROUTES MUST BE AFTER SPECIFIC ROUTES ==>
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

export default router;

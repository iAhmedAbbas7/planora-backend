// <== IMPORTS ==>
import {
  getPersonalReport,
  getProjectReport,
  getReportsOverview,
} from "../controllers/reports.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET REPORTS OVERVIEW
router.get("/overview", getReportsOverview);
// GET PERSONAL REPORT
router.get("/personal", getPersonalReport);
// GET PROJECT REPORT
router.get("/project/:projectId", getProjectReport);

export default router;

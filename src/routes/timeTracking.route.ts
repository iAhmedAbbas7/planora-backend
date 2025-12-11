// <== IMPORTS ==>
import {
  startTimer,
  stopTimer,
  discardTimer,
  logManualTime,
  updateTimeEstimate,
  getActiveTimer,
  getTaskTimeTracking,
  getTimeReport,
  deleteTimeSession,
  updateTimeSession,
} from "../controllers/timeTracking.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// STOP TIMER AND LOG SESSION
router.post("/stop", stopTimer);
// START TIMER ON A TASK
router.post("/start", startTimer);
// MANUAL TIME LOGGING
router.post("/log", logManualTime);
// GET TIME TRACKING REPORT
router.get("/report", getTimeReport);
// GET ACTIVE TIMER
router.get("/active", getActiveTimer);
// DISCARD TIMER WITHOUT LOGGING
router.post("/discard", discardTimer);
// GET TIME TRACKING FOR A SPECIFIC TASK
router.get("/task/:taskId", getTaskTimeTracking);
// UPDATE TIME ESTIMATE FOR A TASK
router.put("/estimate/:taskId", updateTimeEstimate);
// UPDATE A TIME SESSION
router.put("/session/:taskId/:sessionId", updateTimeSession);
// DELETE A TIME SESSION
router.delete("/session/:taskId/:sessionId", deleteTimeSession);

export default router;

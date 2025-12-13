// <== IMPORTS ==>
import {
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  getActiveSession,
  getSessionHistory,
  getFocusStats,
  updateSessionNotes,
  completePomodoro,
  endPomodoroBreak,
  deleteSession,
} from "../controllers/focusSession.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// START A NEW FOCUS SESSION
router.post("/start", startSession);
// GET ACTIVE SESSION
router.get("/active", getActiveSession);
// GET SESSION HISTORY
router.get("/history", getSessionHistory);
// GET FOCUS STATS
router.get("/stats", getFocusStats);
// PAUSE A SESSION
router.post("/:sessionId/pause", pauseSession);
// RESUME A SESSION
router.post("/:sessionId/resume", resumeSession);
// END A SESSION
router.post("/:sessionId/end", endSession);
// UPDATE SESSION NOTES
router.put("/:sessionId/notes", updateSessionNotes);
// COMPLETE POMODORO CYCLE
router.post("/:sessionId/pomodoro/complete", completePomodoro);
// END POMODORO BREAK
router.post("/:sessionId/pomodoro/end-break", endPomodoroBreak);
// DELETE A SESSION
router.delete("/:sessionId", deleteSession);

export default router;


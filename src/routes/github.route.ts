// <== IMPORTS ==>
import {
  getGitHubStatus,
  disconnectGitHub,
  verifyGitHubToken,
  getGitHubProfile,
} from "../controllers/github.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET GITHUB CONNECTION STATUS
router.get("/status", getGitHubStatus);
// VERIFY GITHUB TOKEN (CHECK IF STILL VALID)
router.get("/verify", verifyGitHubToken);
// GET GITHUB USER PROFILE
router.get("/profile", getGitHubProfile);
// DISCONNECT GITHUB FROM ACCOUNT
router.delete("/disconnect", disconnectGitHub);

export default router;

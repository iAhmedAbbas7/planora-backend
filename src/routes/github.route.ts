// <== IMPORTS ==>
import {
  getGitHubStatus,
  disconnectGitHub,
  verifyGitHubToken,
  getGitHubProfile,
  getRepositories,
  getRepositoryDetails,
  getRepositoryCommits,
  getRepositoryIssues,
  getRepositoryPullRequests,
  getRepositoryReadme,
  getRepositoryBranches,
  getRepositoryLanguages,
  getRepositoryContributors,
} from "../controllers/github.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET REPOSITORY CONTRIBUTORS
router.get(
  "/repositories/:owner/:repo/contributors",
  getRepositoryContributors
);
// GET GITHUB CONNECTION STATUS
router.get("/status", getGitHubStatus);
// VERIFY GITHUB TOKEN (CHECK IF STILL VALID)
router.get("/verify", verifyGitHubToken);
// GET GITHUB USER PROFILE
router.get("/profile", getGitHubProfile);
// GET USER REPOSITORIES
router.get("/repositories", getRepositories);
// DISCONNECT GITHUB FROM ACCOUNT
router.delete("/disconnect", disconnectGitHub);
// GET REPOSITORY DETAILS
router.get("/repositories/:owner/:repo", getRepositoryDetails);
// GET REPOSITORY ISSUES
router.get("/repositories/:owner/:repo/issues", getRepositoryIssues);
// GET REPOSITORY README
router.get("/repositories/:owner/:repo/readme", getRepositoryReadme);
// GET REPOSITORY COMMITS
router.get("/repositories/:owner/:repo/commits", getRepositoryCommits);
// GET REPOSITORY BRANCHES
router.get("/repositories/:owner/:repo/branches", getRepositoryBranches);
// GET REPOSITORY PULL REQUESTS
router.get("/repositories/:owner/:repo/pulls", getRepositoryPullRequests);
// GET REPOSITORY LANGUAGES
router.get("/repositories/:owner/:repo/languages", getRepositoryLanguages);

export default router;

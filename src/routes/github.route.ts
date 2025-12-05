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
  createRepository,
  forkRepository,
  deleteRepository,
  updateRepository,
  getGitCommands,
} from "../controllers/github.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET REPOSITORY CONTRIBUTORS (SPECIFIC ROUTE BEFORE DYNAMIC)
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
// CREATE NEW REPOSITORY
router.post("/repositories", createRepository);
// DISCONNECT GITHUB FROM ACCOUNT
router.delete("/disconnect", disconnectGitHub);
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
// GET GIT COMMANDS FOR REPOSITORY
router.get("/repositories/:owner/:repo/commands", getGitCommands);
// FORK REPOSITORY
router.post("/repositories/:owner/:repo/fork", forkRepository);
// GET REPOSITORY DETAILS (DYNAMIC ROUTE AFTER SPECIFIC ROUTES)
router.get("/repositories/:owner/:repo", getRepositoryDetails);
// UPDATE REPOSITORY SETTINGS
router.patch("/repositories/:owner/:repo", updateRepository);
// DELETE REPOSITORY
router.delete("/repositories/:owner/:repo", deleteRepository);

export default router;

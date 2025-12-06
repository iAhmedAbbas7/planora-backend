// <== IMPORTS ==>
import {
  getGitHubStatus,
  disconnectGitHub,
  verifyGitHubToken,
  getGitHubProfile,
  getRepositories,
  getRepositoryDetails,
  getRepositoryCommits,
  searchRepositoryCommits,
  getRepositoryIssues,
  getRepositoryPullRequests,
  getRepositoryReadme,
  getRepositoryBranches,
  getBranchDetails,
  createBranch,
  deleteBranch,
  mergeBranches,
  getBranchProtection,
  updateBranchProtection,
  deleteBranchProtection,
  getRepositoryLanguages,
  getRepositoryContributors,
  createRepository,
  forkRepository,
  deleteRepository,
  updateRepository,
  getGitCommands,
  updateRepositoryTopics,
  getRepositoryCollaborators,
  addRepositoryCollaborator,
  removeRepositoryCollaborator,
  transferRepository,
  getRepositoryContents,
  getFileContent,
  createFile,
  updateFile,
  deleteFile,
  getFileBlame,
  getRepositoryTree,
  getCommitDetails,
  compareCommits,
  getCommitBranches,
  getCommitPullRequests,
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
// GET USER REPOSITORIES
router.get("/repositories", getRepositories);
// CREATE NEW REPOSITORY
router.post("/repositories", createRepository);
// DISCONNECT GITHUB FROM ACCOUNT
router.delete("/disconnect", disconnectGitHub);
// GET REPOSITORY CONTRIBUTORS (SPECIFIC ROUTE BEFORE DYNAMIC)
router.get(
  "/repositories/:owner/:repo/contributors",
  getRepositoryContributors
);
// GET REPOSITORY COLLABORATORS
router.get(
  "/repositories/:owner/:repo/collaborators",
  getRepositoryCollaborators
);
// ADD REPOSITORY COLLABORATOR
router.put(
  "/repositories/:owner/:repo/collaborators/:username",
  addRepositoryCollaborator
);
// REMOVE REPOSITORY COLLABORATOR
router.delete(
  "/repositories/:owner/:repo/collaborators/:username",
  removeRepositoryCollaborator
);
// GET REPOSITORY ISSUES
router.get("/repositories/:owner/:repo/issues", getRepositoryIssues);
// GET REPOSITORY README
router.get("/repositories/:owner/:repo/readme", getRepositoryReadme);
// GET REPOSITORY COMMITS
router.get("/repositories/:owner/:repo/commits", getRepositoryCommits);
// SEARCH REPOSITORY COMMITS
router.get("/repositories/:owner/:repo/commits/search", searchRepositoryCommits);
// COMPARE COMMITS
router.get("/repositories/:owner/:repo/compare", compareCommits);
// GET COMMIT DETAILS (SPECIFIC SHA)
router.get("/repositories/:owner/:repo/commits/:sha", getCommitDetails);
// GET COMMIT BRANCHES (BRANCHES CONTAINING THIS COMMIT)
router.get("/repositories/:owner/:repo/commits/:sha/branches", getCommitBranches);
// GET COMMIT PULL REQUESTS (PRs ASSOCIATED WITH COMMIT)
router.get("/repositories/:owner/:repo/commits/:sha/pulls", getCommitPullRequests);
// GET REPOSITORY BRANCHES
router.get("/repositories/:owner/:repo/branches", getRepositoryBranches);
// CREATE BRANCH
router.post("/repositories/:owner/:repo/branches", createBranch);
// MERGE BRANCHES
router.post("/repositories/:owner/:repo/merges", mergeBranches);
// GET BRANCH PROTECTION
router.get(
  "/repositories/:owner/:repo/branches/:branch/protection",
  getBranchProtection
);
// UPDATE BRANCH PROTECTION
router.put(
  "/repositories/:owner/:repo/branches/:branch/protection",
  updateBranchProtection
);
// DELETE BRANCH PROTECTION
router.delete(
  "/repositories/:owner/:repo/branches/:branch/protection",
  deleteBranchProtection
);
// GET BRANCH DETAILS (SPECIFIC BRANCH)
router.get("/repositories/:owner/:repo/branches/:branch", getBranchDetails);
// DELETE BRANCH
router.delete("/repositories/:owner/:repo/branches/:branch", deleteBranch);
// GET REPOSITORY PULL REQUESTS
router.get("/repositories/:owner/:repo/pulls", getRepositoryPullRequests);
// GET REPOSITORY LANGUAGES
router.get("/repositories/:owner/:repo/languages", getRepositoryLanguages);
// GET GIT COMMANDS FOR REPOSITORY
router.get("/repositories/:owner/:repo/commands", getGitCommands);
// UPDATE REPOSITORY TOPICS
router.put("/repositories/:owner/:repo/topics", updateRepositoryTopics);
// GET REPOSITORY TREE (FULL TREE STRUCTURE)
router.get("/repositories/:owner/:repo/tree", getRepositoryTree);
// GET REPOSITORY CONTENTS (FILE TREE / DIRECTORY)
router.get("/repositories/:owner/:repo/contents", getRepositoryContents);
// GET FILE CONTENT
router.get("/repositories/:owner/:repo/file", getFileContent);
// CREATE FILE
router.post("/repositories/:owner/:repo/file", createFile);
// UPDATE FILE
router.put("/repositories/:owner/:repo/file", updateFile);
// DELETE FILE
router.delete("/repositories/:owner/:repo/file", deleteFile);
// GET FILE BLAME
router.get("/repositories/:owner/:repo/blame", getFileBlame);
// FORK REPOSITORY
router.post("/repositories/:owner/:repo/fork", forkRepository);
// TRANSFER REPOSITORY
router.post("/repositories/:owner/:repo/transfer", transferRepository);
// GET REPOSITORY DETAILS (DYNAMIC ROUTE AFTER SPECIFIC ROUTES)
router.get("/repositories/:owner/:repo", getRepositoryDetails);
// UPDATE REPOSITORY SETTINGS
router.patch("/repositories/:owner/:repo", updateRepository);
// DELETE REPOSITORY
router.delete("/repositories/:owner/:repo", deleteRepository);

export default router;

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
  getIssueDetails,
  createIssue,
  updateIssue,
  getIssueComments,
  addIssueComment,
  getRepositoryLabels,
  searchIssues,
  getRepositoryPullRequests,
  getPullRequestDetails,
  getPullRequestComments,
  addPullRequestComment,
  createPullRequest,
  mergePullRequest,
  updatePullRequest,
  getPullRequestReviews,
  createPullRequestReview,
  getPullRequestFiles,
  requestPullRequestReviewers,
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
  getRepositoryInvitations,
  deleteRepositoryInvitation,
  updateRepositoryInvitation,
  checkCollaborator,
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
  getRepositoryWorkflows,
  getWorkflowDetails,
  getWorkflowRuns,
  getWorkflowRunDetails,
  getWorkflowRunJobs,
  getWorkflowRunLogs,
  getJobLogs,
  triggerWorkflowDispatch,
  rerunWorkflow,
  rerunFailedJobs,
  cancelWorkflowRun,
  deleteWorkflowRun,
  listReleases,
  getReleaseDetails,
  getLatestRelease,
  createRelease,
  updateRelease,
  deleteRelease,
  listTags,
  getTagDetails,
  createTag,
  deleteTag,
  generateReleaseNotes,
  listDeployments,
  getDeploymentDetails,
  getDeploymentStatuses,
  createDeployment,
  createDeploymentStatus,
  deleteDeployment,
  listEnvironments,
  getEnvironment,
  getDashboardStats,
  getDashboardActivity,
  getStarredRepositories,
  starRepository,
  unstarRepository,
  checkIfStarred,
  getPinnedRepositories,
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
// GET DASHBOARD STATS (AGGREGATED ACROSS ALL REPOS)
router.get("/dashboard/stats", getDashboardStats);
// GET DASHBOARD ACTIVITY (RECENT EVENTS)
router.get("/dashboard/activity", getDashboardActivity);
// GET STARRED REPOSITORIES
router.get("/starred", getStarredRepositories);
// STAR A REPOSITORY
router.put("/starred/:owner/:repo", starRepository);
// UNSTAR A REPOSITORY
router.delete("/starred/:owner/:repo", unstarRepository);
// CHECK IF REPOSITORY IS STARRED
router.get("/starred/:owner/:repo", checkIfStarred);
// GET PINNED REPOSITORIES (USES GRAPHQL)
router.get("/pinned", getPinnedRepositories);
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
// CHECK COLLABORATOR PERMISSION LEVEL
router.get(
  "/repositories/:owner/:repo/collaborators/:username/permission",
  checkCollaborator
);
// GET REPOSITORY INVITATIONS
router.get("/repositories/:owner/:repo/invitations", getRepositoryInvitations);
// UPDATE REPOSITORY INVITATION
router.patch(
  "/repositories/:owner/:repo/invitations/:invitation_id",
  updateRepositoryInvitation
);
// DELETE REPOSITORY INVITATION
router.delete(
  "/repositories/:owner/:repo/invitations/:invitation_id",
  deleteRepositoryInvitation
);
// GET REPOSITORY ISSUES
router.get("/repositories/:owner/:repo/issues", getRepositoryIssues);
// CREATE ISSUE
router.post("/repositories/:owner/:repo/issues", createIssue);
// GET REPOSITORY LABELS
router.get("/repositories/:owner/:repo/labels", getRepositoryLabels);
// SEARCH ISSUES
router.get("/repositories/:owner/:repo/issues/search", searchIssues);
// GET ISSUE COMMENTS (BEFORE :issue_number TO AVOID CONFLICT)
router.get(
  "/repositories/:owner/:repo/issues/:issue_number/comments",
  getIssueComments
);
// ADD ISSUE COMMENT
router.post(
  "/repositories/:owner/:repo/issues/:issue_number/comments",
  addIssueComment
);
// GET ISSUE DETAILS (DYNAMIC ROUTE AFTER SPECIFIC)
router.get("/repositories/:owner/:repo/issues/:issue_number", getIssueDetails);
// UPDATE ISSUE
router.patch("/repositories/:owner/:repo/issues/:issue_number", updateIssue);
// GET REPOSITORY README
router.get("/repositories/:owner/:repo/readme", getRepositoryReadme);
// GET REPOSITORY COMMITS
router.get("/repositories/:owner/:repo/commits", getRepositoryCommits);
// SEARCH REPOSITORY COMMITS
router.get(
  "/repositories/:owner/:repo/commits/search",
  searchRepositoryCommits
);
// COMPARE COMMITS
router.get("/repositories/:owner/:repo/compare", compareCommits);
// GET COMMIT DETAILS (SPECIFIC SHA)
router.get("/repositories/:owner/:repo/commits/:sha", getCommitDetails);
// GET COMMIT BRANCHES (BRANCHES CONTAINING THIS COMMIT)
router.get(
  "/repositories/:owner/:repo/commits/:sha/branches",
  getCommitBranches
);
// GET COMMIT PULL REQUESTS (PRs ASSOCIATED WITH COMMIT)
router.get(
  "/repositories/:owner/:repo/commits/:sha/pulls",
  getCommitPullRequests
);
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
// CREATE PULL REQUEST
router.post("/repositories/:owner/:repo/pulls", createPullRequest);
// GET PULL REQUEST FILES (BEFORE :pull_number TO AVOID CONFLICT)
router.get(
  "/repositories/:owner/:repo/pulls/:pull_number/files",
  getPullRequestFiles
);
// GET PULL REQUEST COMMENTS
router.get(
  "/repositories/:owner/:repo/pulls/:pull_number/comments",
  getPullRequestComments
);
// ADD PULL REQUEST COMMENT
router.post(
  "/repositories/:owner/:repo/pulls/:pull_number/comments",
  addPullRequestComment
);
// GET PULL REQUEST REVIEWS
router.get(
  "/repositories/:owner/:repo/pulls/:pull_number/reviews",
  getPullRequestReviews
);
// CREATE PULL REQUEST REVIEW
router.post(
  "/repositories/:owner/:repo/pulls/:pull_number/reviews",
  createPullRequestReview
);
// REQUEST PULL REQUEST REVIEWERS
router.post(
  "/repositories/:owner/:repo/pulls/:pull_number/reviewers",
  requestPullRequestReviewers
);
// MERGE PULL REQUEST
router.put(
  "/repositories/:owner/:repo/pulls/:pull_number/merge",
  mergePullRequest
);
// GET PULL REQUEST DETAILS (DYNAMIC ROUTE AFTER SPECIFIC)
router.get(
  "/repositories/:owner/:repo/pulls/:pull_number",
  getPullRequestDetails
);
// UPDATE PULL REQUEST
router.patch(
  "/repositories/:owner/:repo/pulls/:pull_number",
  updatePullRequest
);
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
// GET REPOSITORY WORKFLOWS
router.get(
  "/repositories/:owner/:repo/actions/workflows",
  getRepositoryWorkflows
);
// GET WORKFLOW DETAILS
router.get(
  "/repositories/:owner/:repo/actions/workflows/:workflow_id",
  getWorkflowDetails
);
// TRIGGER WORKFLOW DISPATCH
router.post(
  "/repositories/:owner/:repo/actions/workflows/:workflow_id/dispatches",
  triggerWorkflowDispatch
);
// GET WORKFLOW RUNS (FOR REPO OR SPECIFIC WORKFLOW)
router.get("/repositories/:owner/:repo/actions/runs", getWorkflowRuns);
// GET WORKFLOW RUN DETAILS
router.get(
  "/repositories/:owner/:repo/actions/runs/:run_id",
  getWorkflowRunDetails
);
// GET WORKFLOW RUN JOBS
router.get(
  "/repositories/:owner/:repo/actions/runs/:run_id/jobs",
  getWorkflowRunJobs
);
// GET WORKFLOW RUN LOGS
router.get(
  "/repositories/:owner/:repo/actions/runs/:run_id/logs",
  getWorkflowRunLogs
);
// RE-RUN WORKFLOW
router.post(
  "/repositories/:owner/:repo/actions/runs/:run_id/rerun",
  rerunWorkflow
);
// RE-RUN FAILED JOBS
router.post(
  "/repositories/:owner/:repo/actions/runs/:run_id/rerun-failed-jobs",
  rerunFailedJobs
);
// CANCEL WORKFLOW RUN
router.post(
  "/repositories/:owner/:repo/actions/runs/:run_id/cancel",
  cancelWorkflowRun
);
// DELETE WORKFLOW RUN
router.delete(
  "/repositories/:owner/:repo/actions/runs/:run_id",
  deleteWorkflowRun
);
// GET JOB LOGS
router.get("/repositories/:owner/:repo/actions/jobs/:job_id/logs", getJobLogs);
// LIST RELEASES
router.get("/repositories/:owner/:repo/releases", listReleases);
// GET LATEST RELEASE
router.get("/repositories/:owner/:repo/releases/latest", getLatestRelease);
// GENERATE RELEASE NOTES
router.post(
  "/repositories/:owner/:repo/releases/generate-notes",
  generateReleaseNotes
);
// CREATE RELEASE
router.post("/repositories/:owner/:repo/releases", createRelease);
// GET RELEASE DETAILS
router.get(
  "/repositories/:owner/:repo/releases/:release_id",
  getReleaseDetails
);
// UPDATE RELEASE
router.patch("/repositories/:owner/:repo/releases/:release_id", updateRelease);
// DELETE RELEASE
router.delete("/repositories/:owner/:repo/releases/:release_id", deleteRelease);
// LIST TAGS
router.get("/repositories/:owner/:repo/tags", listTags);
// CREATE TAG
router.post("/repositories/:owner/:repo/tags", createTag);
// GET TAG DETAILS
router.get("/repositories/:owner/:repo/tags/:tag", getTagDetails);
// DELETE TAG
router.delete("/repositories/:owner/:repo/tags/:tag", deleteTag);
// LIST ENVIRONMENTS
router.get("/repositories/:owner/:repo/environments", listEnvironments);
// GET ENVIRONMENT
router.get(
  "/repositories/:owner/:repo/environments/:environment_name",
  getEnvironment
);
// LIST DEPLOYMENTS
router.get("/repositories/:owner/:repo/deployments", listDeployments);
// CREATE DEPLOYMENT
router.post("/repositories/:owner/:repo/deployments", createDeployment);
// GET DEPLOYMENT DETAILS
router.get(
  "/repositories/:owner/:repo/deployments/:deployment_id",
  getDeploymentDetails
);
// DELETE DEPLOYMENT
router.delete(
  "/repositories/:owner/:repo/deployments/:deployment_id",
  deleteDeployment
);
// GET DEPLOYMENT STATUSES
router.get(
  "/repositories/:owner/:repo/deployments/:deployment_id/statuses",
  getDeploymentStatuses
);
// CREATE DEPLOYMENT STATUS
router.post(
  "/repositories/:owner/:repo/deployments/:deployment_id/statuses",
  createDeploymentStatus
);
// GET REPOSITORY DETAILS (DYNAMIC ROUTE AFTER SPECIFIC ROUTES)
router.get("/repositories/:owner/:repo", getRepositoryDetails);
// UPDATE REPOSITORY SETTINGS
router.patch("/repositories/:owner/:repo", updateRepository);
// DELETE REPOSITORY
router.delete("/repositories/:owner/:repo", deleteRepository);

export default router;

// <== IMPORTS ==>
import {
  createWorkspace,
  getWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  archiveWorkspace,
  unarchiveWorkspace,
  getWorkspaceMembers,
  updateMemberRole,
  removeMember,
  sendInvitation,
  getInvitations,
  acceptInvitation,
  declineInvitation,
  cancelInvitation,
  getMyInvitations,
  linkRepository,
  unlinkRepository,
  getWorkspaceRepositories,
} from "../controllers/workspace.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET USER'S PENDING INVITATIONS
router.get("/invitations/me", getMyInvitations);
// ACCEPT INVITATION (BY TOKEN)
router.post("/invitations/:token/accept", acceptInvitation);
// DECLINE INVITATION (BY TOKEN)
router.post("/invitations/:token/decline", declineInvitation);
// GET ALL WORKSPACES FOR USER
router.get("/", getWorkspaces);
// CREATE WORKSPACE
router.post("/", createWorkspace);
// GET SINGLE WORKSPACE
router.get("/:id", getWorkspace);
// UPDATE WORKSPACE
router.put("/:id", updateWorkspace);
// DELETE WORKSPACE
router.delete("/:id", deleteWorkspace);
// ARCHIVE WORKSPACE
router.put("/:id/archive", archiveWorkspace);
// UNARCHIVE WORKSPACE
router.put("/:id/unarchive", unarchiveWorkspace);
// GET WORKSPACE MEMBERS
router.get("/:id/members", getWorkspaceMembers);
// UPDATE MEMBER ROLE
router.put("/:id/members/:memberId", updateMemberRole);
// REMOVE MEMBER
router.delete("/:id/members/:memberId", removeMember);
// GET WORKSPACE INVITATIONS
router.get("/:id/invitations", getInvitations);
// SEND INVITATION
router.post("/:id/invitations", sendInvitation);
// CANCEL INVITATION
router.delete("/:id/invitations/:invitationId", cancelInvitation);
// GET WORKSPACE REPOSITORIES
router.get("/:id/repositories", getWorkspaceRepositories);
// LINK REPOSITORY
router.post("/:id/repositories", linkRepository);
// UNLINK REPOSITORY
router.delete("/:id/repositories/:repoId", unlinkRepository);

export default router;

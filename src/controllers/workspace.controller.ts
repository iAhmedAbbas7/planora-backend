// <== IMPORTS ==>
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import expressAsyncHandler from "express-async-handler";
import { Workspace, ILinkedRepository } from "../models/workspace.model.js";
import { createNotification } from "./notification.controller.js";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import { WorkspaceInvitation } from "../models/workspaceInvitation.model.js";

/**
 * CREATE WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE WORKSPACE ==>
export const createWorkspace = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE DATA FROM REQUEST BODY
  const { name, description, visibility, settings } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!name) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace name is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CREATING NEW WORKSPACE
  const workspace = await Workspace.create({
    name,
    description: description || "",
    visibility: visibility || "private",
    ownerId: userId,
    settings: settings || {},
  });
  // CREATING OWNER MEMBERSHIP
  await WorkspaceMember.create({
    workspaceId: workspace._id,
    userId,
    role: "owner",
    invitedBy: null,
    status: "active",
  });
  // CREATING NOTIFICATION FOR WORKSPACE CREATION
  await createNotification(
    userId,
    "workspace_created",
    "New Workspace Created",
    `Workspace "${workspace.name}" has been created successfully.`,
    workspace._id.toString(),
    (req as any).app
  );
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Workspace created successfully!",
    success: true,
    data: workspace,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET ALL WORKSPACES FOR USER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKSPACES ==>
export const getWorkspaces = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING USER MEMBERSHIPS
  const memberships = (await WorkspaceMember.find({
    userId,
    status: "active",
  })
    .lean()
    .exec()) as Array<{
    workspaceId: mongoose.Types.ObjectId;
    role: string;
    permissions?: Record<string, boolean>;
  }>;
  // IF NO MEMBERSHIPS FOUND, RETURN EMPTY ARRAY
  if (!memberships || memberships.length === 0) {
    // RETURNING RESPONSE
    res.status(200).json({
      success: true,
      count: 0,
      data: [],
    });
    return;
  }
  // EXTRACTING WORKSPACE IDS
  const workspaceIds = memberships.map((m) => m.workspaceId);
  // GETTING WORKSPACES WITH MEMBER COUNTS
  const workspaces = await Workspace.aggregate([
    // MATCHING WORKSPACE IDS AND NOT ARCHIVED
    {
      $match: {
        _id: { $in: workspaceIds },
        isArchived: false,
      },
    },
    // LOOKING UP MEMBERS
    {
      $lookup: {
        from: "workspacemembers",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
      },
    },
    // ADDING MEMBER COUNT FIELD
    {
      $addFields: {
        memberCount: {
          $size: {
            $filter: {
              input: "$members",
              cond: { $eq: ["$$this.status", "active"] },
            },
          },
        },
      },
    },
    // LOOKING UP OWNER INFO
    {
      $lookup: {
        from: "users",
        localField: "ownerId",
        foreignField: "_id",
        as: "owner",
      },
    },
    // UNWIND OWNER ARRAY
    {
      $unwind: {
        path: "$owner",
        preserveNullAndEmptyArrays: true,
      },
    },
    // PROJECTING FIELDS
    {
      $project: {
        members: 0,
        "owner.password": 0,
        "owner.totpSecret": 0,
        "owner.backupCodes": 0,
        "owner.githubAccessToken": 0,
      },
    },
    // SORTING BY UPDATED AT
    {
      $sort: { updatedAt: -1 },
    },
  ]).exec();
  // ADDING USER ROLE TO EACH WORKSPACE
  const workspacesWithRole = workspaces.map((workspace) => {
    // FINDING MEMBERSHIP FOR WORKSPACE
    const membership = memberships.find(
      (m) => m.workspaceId.toString() === workspace._id.toString()
    );
    // RETURNING WORKSPACE WITH ROLE AND PERMISSIONS
    return {
      ...workspace,
      userRole: membership?.role || "member",
      userPermissions: membership?.permissions || {},
    };
  });
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: workspacesWithRole.length,
    data: workspacesWithRole,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET SINGLE WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKSPACE ==>
export const getWorkspace = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING WORKSPACE ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Invalid Workspace ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER MEMBERSHIP
  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER IS NOT A MEMBER, RETURN 403 ERROR
  if (!membership) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "You are not a member of this workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE WITH DETAILS
  const workspace = await Workspace.aggregate([
    // MATCHING WORKSPACE ID
    {
      $match: { _id: new mongoose.Types.ObjectId(workspaceId) },
    },
    // LOOKING UP MEMBERS
    {
      $lookup: {
        from: "workspacemembers",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
      },
    },
    // LOOKING UP MEMBER USERS
    {
      $lookup: {
        from: "users",
        localField: "members.userId",
        foreignField: "_id",
        as: "memberUsers",
      },
    },
    // LOOKING UP OWNER INFO
    {
      $lookup: {
        from: "users",
        localField: "ownerId",
        foreignField: "_id",
        as: "owner",
      },
    },
    // UNWIND OWNER ARRAY
    {
      $unwind: {
        path: "$owner",
        preserveNullAndEmptyArrays: true,
      },
    },
    // ADDING COMPUTED FIELDS
    {
      $addFields: {
        memberCount: {
          $size: {
            $filter: {
              input: "$members",
              cond: { $eq: ["$$this.status", "active"] },
            },
          },
        },
        repoCount: { $size: "$linkedRepositories" },
      },
    },
    // PROJECTING FIELDS
    {
      $project: {
        "owner.password": 0,
        "owner.totpSecret": 0,
        "owner.backupCodes": 0,
        "owner.githubAccessToken": 0,
        "memberUsers.password": 0,
        "memberUsers.totpSecret": 0,
        "memberUsers.backupCodes": 0,
        "memberUsers.githubAccessToken": 0,
      },
    },
  ]).exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace || workspace.length === 0) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      ...workspace[0],
      userRole: membership.role,
      userPermissions: membership.permissions,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE WORKSPACE ==>
export const updateWorkspace = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING WORKSPACE ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Invalid Workspace ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER IS NOT A MEMBER OR DOESN'T HAVE PERMISSION, RETURN 403 ERROR
  if (!membership || !membership.permissions?.canEditSettings) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "You don't have permission to update this workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING ALLOWED UPDATE FIELDS
  const { name, description, visibility, settings, avatar, avatarPublicId } =
    req.body;
  // BUILDING UPDATE OBJECT WITH VALIDATORS
  const updateData: any = {};
  // UPDATING NAME IF PROVIDED
  if (name !== undefined) updateData.name = name;
  // UPDATING DESCRIPTION IF PROVIDED
  if (description !== undefined) updateData.description = description;
  // UPDATING VISIBILITY IF PROVIDED
  if (visibility !== undefined) updateData.visibility = visibility;
  // UPDATING SETTINGS IF PROVIDED
  if (settings !== undefined) updateData.settings = settings;
  // UPDATING AVATAR IF PROVIDED
  if (avatar !== undefined) updateData.avatar = avatar;
  // UPDATING AVATAR PUBLIC ID IF PROVIDED
  if (avatarPublicId !== undefined) updateData.avatarPublicId = avatarPublicId;
  // UPDATING WORKSPACE WITH VALIDATORS
  const workspace = await Workspace.findByIdAndUpdate(workspaceId, updateData, {
    new: true,
    runValidators: true,
  })
    .lean()
    .exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Workspace updated successfully!",
    success: true,
    data: workspace,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DELETE WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE WORKSPACE ==>
export const deleteWorkspace = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING WORKSPACE ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    res.status(400).json({
      message: "Invalid Workspace ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING WORKSPACE
  const workspace = await Workspace.findById(workspaceId).lean().exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER IS OWNER
  if (workspace.ownerId.toString() !== userId) {
    res.status(403).json({
      message: "Only the workspace owner can delete the workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETING ALL MEMBERSHIPS
  await WorkspaceMember.deleteMany({ workspaceId }).exec();
  // DELETING ALL INVITATIONS
  await WorkspaceInvitation.deleteMany({ workspaceId }).exec();
  // DELETING WORKSPACE
  await Workspace.findByIdAndDelete(workspaceId).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Workspace deleted successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * ARCHIVE WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ARCHIVE WORKSPACE ==>
export const archiveWorkspace = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING WORKSPACE
  const workspace = await Workspace.findById(workspaceId).exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER IS OWNER
  if (workspace.ownerId.toString() !== userId) {
    res.status(403).json({
      message: "Only the workspace owner can archive the workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // ARCHIVING WORKSPACE WITH ARCHIVED AT DATE
  workspace.isArchived = true;
  // SETTING ARCHIVED AT DATE
  workspace.archivedAt = new Date();
  await workspace.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Workspace archived successfully!",
    success: true,
    data: workspace,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UNARCHIVE WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNARCHIVE WORKSPACE ==>
export const unarchiveWorkspace = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING WORKSPACE
  const workspace = await Workspace.findById(workspaceId).exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER IS OWNER
  if (workspace.ownerId.toString() !== userId) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "Only the workspace owner can unarchive the workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // UNARCHIVING WORKSPACE
  workspace.isArchived = false;
  // SETTING ARCHIVED AT DATE TO UNDEFINED
  (workspace as any).archivedAt = null;
  // SAVING WORKSPACE
  await workspace.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Workspace unarchived successfully!",
    success: true,
    data: workspace,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET WORKSPACE MEMBERS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WORKSPACE MEMBERS ==>
export const getWorkspaceMembers = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING WORKSPACE ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    res.status(400).json({
      message: "Invalid Workspace ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER MEMBERSHIP
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER IS NOT A MEMBER, RETURN 403 ERROR
  if (!userMembership) {
    res.status(403).json({
      message: "You are not a member of this workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING MEMBERS WITH USER INFO
  const members = await WorkspaceMember.aggregate([
    // MATCHING WORKSPACE ID AND ACTIVE STATUS
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        status: "active",
      },
    },
    // LOOKING UP USER INFO
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    // UNWIND USER ARRAY
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },
    // LOOKING UP INVITER INFO
    {
      $lookup: {
        from: "users",
        localField: "invitedBy",
        foreignField: "_id",
        as: "inviter",
      },
    },
    // UNWIND INVITER ARRAY
    {
      $unwind: {
        path: "$inviter",
        preserveNullAndEmptyArrays: true,
      },
    },
    // PROJECTING FIELDS
    {
      $project: {
        "user.password": 0,
        "user.totpSecret": 0,
        "user.backupCodes": 0,
        "user.githubAccessToken": 0,
        "inviter.password": 0,
        "inviter.totpSecret": 0,
        "inviter.backupCodes": 0,
        "inviter.githubAccessToken": 0,
      },
    },
    // SORTING BY ROLE PRIORITY
    {
      $addFields: {
        rolePriority: {
          $switch: {
            branches: [
              { case: { $eq: ["$role", "owner"] }, then: 1 },
              { case: { $eq: ["$role", "admin"] }, then: 2 },
              { case: { $eq: ["$role", "member"] }, then: 3 },
              { case: { $eq: ["$role", "viewer"] }, then: 4 },
            ],
            default: 5,
          },
        },
      },
    },
    {
      $sort: { rolePriority: 1, joinedAt: 1 },
    },
    // REMOVE ROLE PRIORITY FROM OUTPUT
    {
      $project: { rolePriority: 0 },
    },
  ]).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: members.length,
    data: members,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE MEMBER ROLE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE MEMBER ROLE ==>
export const updateMemberRole = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID AND MEMBER USER ID FROM PARAMS
  const { id: workspaceId, memberId } = req.params;
  // GETTING ROLE FROM REQUEST BODY
  const { role } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!workspaceId || !memberId || !role) {
    res.status(400).json({
      message: "Workspace ID, Member ID, and Role are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING ROLE
  if (!["admin", "member", "viewer"].includes(role)) {
    res.status(400).json({
      message: "Invalid role! Must be admin, member, or viewer.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER IS NOT A MEMBER OR NOT OWNER/ADMIN, RETURN 403 ERROR
  if (
    !userMembership ||
    !["owner", "admin"].includes(userMembership.role as string)
  ) {
    res.status(403).json({
      message: "You don't have permission to update member roles!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING TARGET MEMBER
  const targetMember = await WorkspaceMember.findOne({
    workspaceId,
    userId: memberId,
    status: "active",
  }).exec();
  // IF TARGET MEMBER NOT FOUND, RETURN 404 ERROR
  if (!targetMember) {
    res.status(404).json({
      message: "Member not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CANNOT CHANGE OWNER'S ROLE
  if (targetMember.role === "owner") {
    res.status(400).json({
      message: "Cannot change the owner's role!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // ADMINS CANNOT CHANGE OTHER ADMINS' ROLES
  if (
    userMembership.role === "admin" &&
    targetMember.role === "admin" &&
    userId !== memberId
  ) {
    res.status(403).json({
      message: "Admins cannot change other admins' roles!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // UPDATING ROLE
  targetMember.role = role;
  await targetMember.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Member role updated successfully!",
    success: true,
    data: targetMember,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * REMOVE MEMBER FROM WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REMOVE MEMBER ==>
export const removeMember = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID AND MEMBER USER ID FROM PARAMS
  const { id: workspaceId, memberId } = req.params;
  // VALIDATING REQUIRED FIELDS
  if (!workspaceId || !memberId) {
    res.status(400).json({
      message: "Workspace ID and Member ID are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // ALLOWING SELF-REMOVAL OR ADMIN/OWNER REMOVAL
  const isSelfRemoval = userId === memberId;
  const canRemove =
    userMembership &&
    (isSelfRemoval ||
      userMembership.role === "owner" ||
      (userMembership.role === "admin" &&
        userMembership.permissions?.canRemove));
  // IF USER DOESN'T HAVE PERMISSION, RETURN 403 ERROR
  if (!canRemove) {
    res.status(403).json({
      message: "You don't have permission to remove members!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING TARGET MEMBER
  const targetMember = await WorkspaceMember.findOne({
    workspaceId,
    userId: memberId,
    status: "active",
  }).exec();
  // IF TARGET MEMBER NOT FOUND, RETURN 404 ERROR
  if (!targetMember) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Member not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CANNOT REMOVE OWNER
  if (targetMember.role === "owner") {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Cannot remove the workspace owner!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // ADMINS CANNOT REMOVE OTHER ADMINS
  if (
    userMembership?.role === "admin" &&
    targetMember.role === "admin" &&
    !isSelfRemoval
  ) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Admins cannot remove other admins!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETING MEMBERSHIP
  await WorkspaceMember.findByIdAndDelete(targetMember._id).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: isSelfRemoval
      ? "You have left the workspace!"
      : "Member removed successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * SEND WORKSPACE INVITATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SEND INVITATION ==>
export const sendInvitation = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS AND INVITATION DATA FROM BODY
  const workspaceId = req.params.id;
  // GETTING INVITATION DATA FROM REQUEST BODY
  const { email, role } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!workspaceId || !email) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID and Email are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATING EMAIL FORMAT
  const emailRegex = /^\S+@\S+\.\S+$/;
  // IF EMAIL FORMAT IS INVALID, RETURN 400 ERROR
  if (!emailRegex.test(email)) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Please provide a valid email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // CHECKING IF USER CAN INVITE
  const workspace = await Workspace.findById(workspaceId).lean().exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING IF USER CAN INVITE
  const canInvite =
    userMembership &&
    (userMembership.permissions?.canInvite ||
      (workspace.settings?.allowInvites && userMembership.role !== "viewer"));
  // IF USER DOESN'T HAVE PERMISSION, RETURN 403 ERROR
  if (!canInvite) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "You don't have permission to invite members!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER WITH EMAIL IS ALREADY A MEMBER
  const existingUser = await User.findOne({ email: email.toLowerCase() })
    .lean()
    .exec();
  // IF USER EXISTS, CHECK IF USER IS ALREADY A MEMBER
  if (existingUser) {
    // CHECK IF USER IS ALREADY A MEMBER
    const existingMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId: existingUser._id,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS ALREADY A MEMBER, RETURN 400 ERROR
    if (existingMembership) {
      // RETURNING RESPONSE
      res.status(400).json({
        message: "User is already a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
  // CHECK FOR EXISTING PENDING INVITATION
  const existingInvitation = await WorkspaceInvitation.findOne({
    workspaceId,
    inviteeEmail: email.toLowerCase(),
    status: "pending",
  })
    .lean()
    .exec();
  // IF EXISTING INVITATION EXISTS, RETURN 400 ERROR
  if (existingInvitation) {
    // RETURNING FROM FUNCTION
    res.status(400).json({
      message: "An invitation has already been sent to this email!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CREATING INVITATION WITH EXPIRATION DATE
  const invitation = await WorkspaceInvitation.create({
    workspaceId,
    inviterId: userId,
    inviteeEmail: email.toLowerCase(),
    role: role || workspace.settings?.defaultRole || "member",
  });
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Invitation sent successfully!",
    success: true,
    data: {
      invitationId: invitation._id,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET WORKSPACE INVITATIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET INVITATIONS ==>
export const getInvitations = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS
  const workspaceId = req.params.id;
  // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
  if (!workspaceId) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER IS NOT A MEMBER OR VIEWER, RETURN 403 ERROR
  if (!userMembership || userMembership.role === "viewer") {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "You don't have permission to view invitations!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING INVITATIONS WITH INVITER INFO
  const invitations = await WorkspaceInvitation.aggregate([
    // MATCHING WORKSPACE ID
    {
      $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) },
    },
    // LOOKING UP INVITER INFO
    {
      $lookup: {
        from: "users",
        localField: "inviterId",
        foreignField: "_id",
        as: "inviter",
      },
    },
    // UNWIND INVITER ARRAY
    {
      $unwind: {
        path: "$inviter",
        preserveNullAndEmptyArrays: true,
      },
    },
    // PROJECTING FIELDS
    {
      $project: {
        "inviter.password": 0,
        "inviter.totpSecret": 0,
        "inviter.backupCodes": 0,
        "inviter.githubAccessToken": 0,
      },
    },
    // SORTING BY CREATED AT
    {
      $sort: { createdAt: -1 },
    },
  ]).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: invitations.length,
    data: invitations,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * ACCEPT WORKSPACE INVITATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ACCEPT INVITATION ==>
export const acceptInvitation = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING TOKEN FROM PARAMS
  const { token } = req.params;
  // IF TOKEN NOT PROVIDED, RETURN 400 ERROR
  if (!token) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Invitation token is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING INVITATION
  const invitation = await WorkspaceInvitation.findOne({ token }).exec();
  // IF INVITATION NOT FOUND, RETURN 404 ERROR
  if (!invitation) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Invitation not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF INVITATION HAS EXPIRED
  if (invitation.status === "expired" || invitation.expiresAt < new Date()) {
    // IF INVITATION HAS NOT EXPIRED, SET STATUS TO EXPIRED
    if (invitation.status !== "expired") {
      // SETTING STATUS TO EXPIRED
      invitation.status = "expired";
      // SAVING INVITATION
      await invitation.save();
    }
    // RETURNING RESPONSE
    res.status(400).json({
      message: "This invitation has expired!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF INVITATION HAS ALREADY BEEN USED
  if (invitation.status !== "pending") {
    // RETURNING RESPONSE
    res.status(400).json({
      message: `This invitation has already been ${invitation.status}!`,
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET USER EMAIL
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF INVITATION EMAIL MATCHES USER EMAIL
  if (user.email.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "This invitation was not sent to your email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER IS ALREADY A MEMBER
  const existingMembership = await WorkspaceMember.findOne({
    workspaceId: invitation.workspaceId,
    userId,
  })
    .lean()
    .exec();
  // IF MEMBERSHIP EXISTS, CHECK IF MEMBER IS ACTIVE
  if (existingMembership) {
    // IF MEMBER IS ACTIVE, RETURN 400 ERROR
    if (existingMembership.status === "active") {
      // RETURNING RESPONSE
      res.status(400).json({
        message: "You are already a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // REACTIVATE SUSPENDED MEMBERSHIP WITH NEW ROLE
    await WorkspaceMember.findByIdAndUpdate(existingMembership._id, {
      status: "active",
      role: invitation.role,
    }).exec();
  } else {
    // CREATE NEW MEMBERSHIP WITH NEW ROLE
    await WorkspaceMember.create({
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
      invitedBy: invitation.inviterId,
      status: "active",
    });
  }
  // UPDATE INVITATION STATUS TO ACCEPTED
  invitation.status = "accepted";
  // SAVING INVITATION
  await invitation.save();
  // RETURNING FROM FUNCTION
  const workspace = await Workspace.findById(invitation.workspaceId)
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Invitation accepted successfully!",
    success: true,
    data: {
      workspaceId: invitation.workspaceId,
      workspaceName: workspace?.name,
      role: invitation.role,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DECLINE WORKSPACE INVITATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DECLINE INVITATION ==>
export const declineInvitation = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING TOKEN FROM PARAMS
  const { token } = req.params;
  // IF TOKEN NOT PROVIDED, RETURN 400 ERROR
  if (!token) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Invitation token is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING INVITATION
  const invitation = await WorkspaceInvitation.findOne({ token }).exec();
  // IF INVITATION NOT FOUND, RETURN 404 ERROR
  if (!invitation) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Invitation not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF INVITATION IS STILL PENDING
  if (invitation.status !== "pending") {
    // RETURNING RESPONSE
    res.status(400).json({
      message: `This invitation has already been ${invitation.status}!`,
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET USER EMAIL
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF INVITATION EMAIL MATCHES USER EMAIL
  if (user.email.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "This invitation was not sent to your email address!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // UPDATE INVITATION STATUS TO DECLINED
  invitation.status = "declined";
  // SAVING INVITATION
  await invitation.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Invitation declined!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * CANCEL/REVOKE WORKSPACE INVITATION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CANCEL INVITATION ==>
export const cancelInvitation = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID AND INVITATION ID FROM PARAMS
  const { id: workspaceId, invitationId } = req.params;
  // VALIDATING REQUIRED FIELDS
  if (!workspaceId || !invitationId) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID and Invitation ID are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER IS NOT AN OWNER OR ADMIN, RETURN 403 ERROR
  if (
    !userMembership ||
    !["owner", "admin"].includes(userMembership.role as string)
  ) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "You don't have permission to cancel invitations!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING AND DELETING INVITATION
  const invitation = await WorkspaceInvitation.findOneAndDelete({
    _id: invitationId,
    workspaceId,
    status: "pending",
  }).exec();
  // IF INVITATION NOT FOUND, RETURN 404 ERROR
  if (!invitation) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Pending invitation not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Invitation cancelled successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET USER'S PENDING INVITATIONS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET MY INVITATIONS ==>
export const getMyInvitations = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET USER EMAIL
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING PENDING INVITATIONS FOR USER'S EMAIL
  const invitations = await WorkspaceInvitation.aggregate([
    // MATCHING USER'S EMAIL AND PENDING STATUS
    {
      $match: {
        inviteeEmail: user.email.toLowerCase(),
        status: "pending",
        expiresAt: { $gt: new Date() },
      },
    },
    // LOOKING UP WORKSPACE INFO
    {
      $lookup: {
        from: "workspaces",
        localField: "workspaceId",
        foreignField: "_id",
        as: "workspace",
      },
    },
    // UNWIND WORKSPACE ARRAY
    {
      $unwind: {
        path: "$workspace",
        preserveNullAndEmptyArrays: true,
      },
    },
    // LOOKING UP INVITER INFO
    {
      $lookup: {
        from: "users",
        localField: "inviterId",
        foreignField: "_id",
        as: "inviter",
      },
    },
    // UNWIND INVITER ARRAY
    {
      $unwind: {
        path: "$inviter",
        preserveNullAndEmptyArrays: true,
      },
    },
    // PROJECTING FIELDS
    {
      $project: {
        "inviter.password": 0,
        "inviter.totpSecret": 0,
        "inviter.backupCodes": 0,
        "inviter.githubAccessToken": 0,
      },
    },
    // SORTING BY CREATED AT
    {
      $sort: { createdAt: -1 },
    },
  ]).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: invitations.length,
    data: invitations,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * LINK REPOSITORY TO WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK REPOSITORY ==>
export const linkRepository = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID FROM PARAMS AND REPO DATA FROM BODY
  const workspaceId = req.params.id;
  // GETTING REPO DATA FROM REQUEST BODY
  const { owner, name, fullName, repoId } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!workspaceId || !owner || !name || !repoId) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID, Repository owner, name, and repoId are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER DOESN'T HAVE PERMISSION, RETURN 403 ERROR
  if (!userMembership || !userMembership.permissions?.canManageRepos) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "You don't have permission to link repositories!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING WORKSPACE
  const workspace = await Workspace.findById(workspaceId).exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF REPOSITORY IS ALREADY LINKED
  const repoFullName = fullName || `${owner}/${name}`;
  // CHECK IF REPOSITORY IS ALREADY LINKED
  const existingRepo = workspace.linkedRepositories?.find(
    (repo: any) => repo.repoId === repoId || repo.fullName === repoFullName
  );
  // IF REPOSITORY IS ALREADY LINKED, RETURN 400 ERROR
  if (existingRepo) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Repository is already linked to this workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // ADDING REPOSITORY
  workspace.linkedRepositories = workspace.linkedRepositories || [];
  // ADDING REPOSITORY TO WORKSPACE
  workspace.linkedRepositories.push({
    owner,
    name,
    fullName: repoFullName,
    repoId,
    linkedAt: new Date(),
  });
  // SAVING WORKSPACE
  await workspace.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Repository linked successfully!",
    success: true,
    data: workspace.linkedRepositories,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UNLINK REPOSITORY FROM WORKSPACE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNLINK REPOSITORY ==>
export const unlinkRepository = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING WORKSPACE ID AND REPO ID FROM PARAMS
  const { id: workspaceId, repoId } = req.params;
  // VALIDATING REQUIRED FIELDS
  if (!workspaceId || !repoId) {
    // RETURNING RESPONSE
    res.status(400).json({
      message: "Workspace ID and Repository ID are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECKING USER PERMISSION
  const userMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
    status: "active",
  })
    .lean()
    .exec();
  // IF USER DOESN'T HAVE PERMISSION, RETURN 403 ERROR
  if (!userMembership || !userMembership.permissions?.canManageRepos) {
    // RETURNING RESPONSE
    res.status(403).json({
      message: "You don't have permission to unlink repositories!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING WORKSPACE
  const workspace = await Workspace.findById(workspaceId).exec();
  // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
  if (!workspace) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Workspace not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FINDING AND REMOVING REPOSITORY
  const repoIndex = workspace.linkedRepositories?.findIndex(
    (repo: any) => repo.repoId === parseInt(repoId)
  );
  // IF REPOSITORY NOT FOUND, RETURN 404 ERROR
  if (repoIndex === undefined || repoIndex === -1) {
    // RETURNING RESPONSE
    res.status(404).json({
      message: "Repository not found in workspace!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // REMOVING REPOSITORY
  workspace.linkedRepositories?.splice(repoIndex, 1);
  // SAVING WORKSPACE
  await workspace.save();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Repository unlinked successfully!",
    success: true,
    data: workspace.linkedRepositories,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET WORKSPACE REPOSITORIES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET REPOSITORIES ==>
export const getWorkspaceRepositories = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as any).id;
    // IF USER ID NOT PROVIDED, RETURN 401 ERROR
    if (!userId) {
      // RETURNING RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GETTING WORKSPACE ID FROM PARAMS
    const workspaceId = req.params.id;
    // IF WORKSPACE ID NOT PROVIDED, RETURN 400 ERROR
    if (!workspaceId) {
      // RETURNING RESPONSE
      res.status(400).json({
        message: "Workspace ID is required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CHECKING USER MEMBERSHIP
    const userMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER, RETURN 403 ERROR
    if (!userMembership) {
      // RETURNING RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FINDING WORKSPACE
    const workspace = (await Workspace.findById(workspaceId)
      .select("linkedRepositories")
      .lean()
      .exec()) as { linkedRepositories?: ILinkedRepository[] } | null;
    // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
    if (!workspace) {
      // RETURNING RESPONSE
      res.status(404).json({
        message: "Workspace not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURNING RESPONSE
    res.status(200).json({
      success: true,
      count: workspace.linkedRepositories?.length || 0,
      data: workspace.linkedRepositories || [],
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

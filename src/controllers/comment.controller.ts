// <== IMPORTS ==>
import { Comment } from "../models/comment.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * GET COMMENTS BY PROJECT ID
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET COMMENTS BY PROJECT ID ==>
export const getCommentsByProjectId = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM THE FUNCTION
    return;
  }
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const { projectId } = req.params;
  // CHECKING IF PROJECT EXISTS AND BELONGS TO USER
  const project = await Project.findOne({
    _id: projectId,
    userId,
  })
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found or unauthorized!",
      success: false,
    });
    // RETURN FROM THE FUNCTION
    return;
  }
  // GETTING COMMENTS FOR PROJECT
  const comments = await Comment.find({ projectId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Comments retrieved successfully!",
    success: true,
    data: comments,
  });
  // RETURN FROM THE FUNCTION
  return;
});

/**
 * CREATE COMMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE COMMENT ==>
export const createComment = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM THE FUNCTION
    return;
  }
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const { projectId } = req.params;
  // GETTING COMMENT TEXT FROM REQUEST BODY
  const { text } = req.body;
  // VALIDATING REQUIRED FIELDS
  if (!text || !projectId) {
    res.status(400).json({
      message: "Text and Project ID are Required!",
      success: false,
    });
    // RETURN FROM THE FUNCTION
    return;
  }
  // CHECKING IF PROJECT EXISTS AND BELONGS TO USER
  const project = await Project.findOne({
    _id: projectId,
    userId,
  })
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found or unauthorized!",
      success: false,
    });
    // RETURN FROM THE FUNCTION
    return;
  }
  // CREATING NEW COMMENT
  const comment = await Comment.create({
    text: text.trim(),
    projectId,
    userId,
  });
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Comment created successfully!",
    success: true,
    data: comment,
  });
  // RETURN FROM THE FUNCTION
  return;
});

/**
 * DELETE COMMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE COMMENT ==>
export const deleteComment = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURN FROM THE FUNCTION
    return;
  }
  // GETTING COMMENT ID FROM REQUEST PARAMS
  const { commentId } = req.params;
  // FINDING COMMENT
  const comment = await Comment.findOne({
    _id: commentId,
    userId,
  })
    .lean()
    .exec();
  // IF COMMENT NOT FOUND, RETURN 404 ERROR
  if (!comment) {
    res.status(404).json({
      message: "Comment not found or unauthorized!",
      success: false,
    });
    // RETURN FROM THE FUNCTION
    return;
  }
  // DELETING COMMENT
  await Comment.deleteOne({ _id: commentId });
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Comment deleted successfully!",
    success: true,
  });
  // RETURN FROM THE FUNCTION
  return;
});

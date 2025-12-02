// <== IMPORTS ==>
import mongoose from "mongoose";

// <== COMMENT SCHEMA ==>
const commentSchema = new mongoose.Schema(
  {
    // TEXT FIELD
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    // PROJECT ID FIELD
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR PROJECT AND USER QUERIES
 */
//<== COMPOUND INDEX FOR PROJECT AND USER QUERIES ==>
commentSchema.index({ projectId: 1, userId: 1 });

// <== EXPORTING THE COMMENT MODEL ==>
export const Comment = mongoose.model("Comment", commentSchema);


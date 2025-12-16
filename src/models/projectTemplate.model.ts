// <== IMPORTS ==>
import mongoose, { Schema } from "mongoose";

// <== TEMPLATE TASK INTERFACE ==>
interface ITemplateTask {
  // <== TITLE ==>
  title: string;
  // <== DESCRIPTION ==>
  description: string;
  // <== PRIORITY ==>
  priority: "low" | "medium" | "high";
  // <== RELATIVE DUE DATE ==>
  relativeDueDate: number | null;
  // <== ORDER ==>
  order: number;
  // <== PHASE ==>
  phase: string;
}

// <== PROJECT TEMPLATE INTERFACE ==>
export interface IProjectTemplate {
  // <== ID ==>
  _id: mongoose.Types.ObjectId;
  // <== NAME ==>
  name: string;
  // <== DESCRIPTION ==>
  description: string;
  // <== CATEGORY ==>
  category: string;
  // <== ICON ==>
  icon: string;
  // <== COLOR ==>
  color: string;
  // <== TASKS ==>
  tasks: ITemplateTask[];
  // <== IS SYSTEM ==>
  isSystem: boolean;
  // <== CREATED BY ==>
  createdBy: mongoose.Types.ObjectId | null;
  // <== IS PUBLIC ==>
  isPublic: boolean;
  // <== USAGE COUNT ==>
  usageCount: number;
  // <== TAGS ==>
  tags: string[];
  // <== ESTIMATED DURATION ==>
  estimatedDuration: number | null;
  // <== CREATED AT ==>
  createdAt: Date;
  // <== UPDATED AT ==>
  updatedAt: Date;
}

// <== TEMPLATE TASK SCHEMA ==>
const templateTaskSchema = new Schema(
  {
    // TASK TITLE
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // TASK DESCRIPTION
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    // TASK PRIORITY
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    // RELATIVE DUE DATE (IN DAYS FROM PROJECT START)
    relativeDueDate: {
      type: Number,
      default: null,
    },
    // TASK ORDER
    order: {
      type: Number,
      default: 0,
    },
    // TASK CATEGORY/PHASE
    phase: {
      type: String,
      default: "General",
    },
  },
  { _id: true }
);

// <== PROJECT TEMPLATE SCHEMA DEFINITION ==>
const projectTemplateSchemaDefinition = {
  // TEMPLATE NAME
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true,
  },
  // TEMPLATE DESCRIPTION
  description: {
    type: String,
    default: "",
    maxlength: 500,
  },
  // TEMPLATE CATEGORY
  category: {
    type: String,
    required: true,
    enum: [
      "Web Development",
      "Mobile Development",
      "Backend Development",
      "DevOps",
      "Data Science",
      "Design",
      "Marketing",
      "Business",
      "Personal",
      "Other",
    ],
    index: true,
  },
  // TEMPLATE ICON (EMOJI OR ICON NAME)
  icon: {
    type: String,
    default: "📁",
  },
  // TEMPLATE COLOR
  color: {
    type: String,
    default: "#6366f1",
  },
  // DEFAULT TASKS FOR THIS TEMPLATE
  tasks: [templateTaskSchema],
  // IS SYSTEM TEMPLATE (PRE-SEEDED, CANNOT BE DELETED BY USERS)
  isSystem: {
    type: Boolean,
    default: false,
    index: true,
  },
  // CREATED BY USER (NULL FOR SYSTEM TEMPLATES)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },
  // IS PUBLIC (CAN BE USED BY OTHER USERS)
  isPublic: {
    type: Boolean,
    default: false,
    index: true,
  },
  // USAGE COUNT (HOW MANY TIMES THIS TEMPLATE HAS BEEN USED)
  usageCount: {
    type: Number,
    default: 0,
  },
  // TAGS FOR SEARCHING
  tags: {
    type: [String],
    default: [],
  },
  // ESTIMATED DURATION (IN DAYS)
  estimatedDuration: {
    type: Number,
    default: null,
  },
};

// <== PROJECT TEMPLATE SCHEMA ==>
// @ts-expect-error - Mongoose schema complexity exceeds TypeScript's union limit
const projectTemplateSchema = new Schema(projectTemplateSchemaDefinition, {
  timestamps: true,
});

// <== INDEXES ==>
/**
 * TEXT INDEX FOR SEARCH FUNCTIONALITY
 */
//<== TEXT INDEX FOR SEARCH FUNCTIONALITY ==>
projectTemplateSchema.index({
  name: "text",
  description: "text",
  tags: "text",
});
/**
 * COMPOUND INDEX FOR CATEGORY AND IS SYSTEM QUERIES
 */
//<== COMPOUND INDEX FOR CATEGORY AND IS SYSTEM QUERIES ==>
projectTemplateSchema.index({ category: 1, isSystem: 1 });
/**
 * COMPOUND INDEX FOR CREATED BY AND IS PUBLIC QUERIES
 */
//<== COMPOUND INDEX FOR CREATED BY AND IS PUBLIC QUERIES ==>
projectTemplateSchema.index({ createdBy: 1, isPublic: 1 });

// <== EXPORTING THE PROJECT TEMPLATE MODEL ==>
export const ProjectTemplate = mongoose.model<IProjectTemplate>(
  "ProjectTemplate",
  projectTemplateSchema
);

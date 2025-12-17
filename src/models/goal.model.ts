// <== IMPORTS ==>
import mongoose from "mongoose";

// <== GOAL TYPE ENUM ==>
export type GoalType = "objective" | "key_result" | "milestone";

// <== GOAL STATUS ENUM ==>
export type GoalStatus =
  | "not_started"
  | "on_track"
  | "at_risk"
  | "behind"
  | "completed"
  | "cancelled";

// <== GOAL INTERFACE ==>
export interface IGoal {
  // <== OBJECT ID ==>
  _id: mongoose.Types.ObjectId;
  // <== USER ID ==>
  userId: mongoose.Types.ObjectId;
  // <== WORKSPACE ID (OPTIONAL - FOR TEAM GOALS) ==>
  workspaceId?: mongoose.Types.ObjectId;
  // <== TITLE ==>
  title: string;
  // <== DESCRIPTION (OPTIONAL) ==>
  description?: string;
  // <== TYPE (OBJECTIVE, KEY RESULT, OR MILESTONE) ==>
  type: GoalType;
  // <== PARENT GOAL (FOR OKR HIERARCHY) ==>
  parentGoal?: mongoose.Types.ObjectId;
  // <== LINKED PROJECTS ==>
  linkedProjects: mongoose.Types.ObjectId[];
  // <== LINKED TASKS ==>
  linkedTasks: mongoose.Types.ObjectId[];
  // <== TARGET VALUE (FOR MEASURABLE GOALS) ==>
  targetValue: number;
  // <== CURRENT VALUE (FOR TRACKING PROGRESS) ==>
  currentValue: number;
  // <== UNIT (E.G., '%', 'COUNT', 'HOURS', ETC.) ==>
  unit: string;
  // <== START DATE (OPTIONAL) ==>
  startDate?: Date;
  // <== DEADLINE (OPTIONAL) ==>
  deadline?: Date;
  // <== STATUS (NOT_STARTED, ON_TRACK, AT_RISK, BEHIND, COMPLETED, OR CANCELLED) ==>
  status: GoalStatus;
  // <== PROGRESS (0-100%) ==>
  progress: number;
  // <== COLOR (FOR UI CUSTOMIZATION) ==>
  color?: string;
  // <== ICON (FOR UI CUSTOMIZATION) ==>
  icon?: string;
  // <== QUARTER (E.G., 'Q1', 'Q2', 'Q3', 'Q4') ==>
  quarter?: string;
  // <== YEAR ==>
  year?: number;
  // <== IS ARCHIVED ==>
  isArchived: boolean;
  // <== CREATED AT ==>
  createdAt: Date;
  // <== UPDATED AT ==>
  updatedAt: Date;
}

// <== GOAL SCHEMA ==>
const goalSchema = new mongoose.Schema(
  {
    // USER ID FIELD (OWNER OF THE GOAL)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // WORKSPACE ID FIELD (OPTIONAL - FOR TEAM GOALS)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      index: true,
      default: null,
    },
    // TITLE FIELD
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // DESCRIPTION FIELD
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    // TYPE FIELD (OBJECTIVE, KEY RESULT, OR MILESTONE)
    type: {
      type: String,
      enum: ["objective", "key_result", "milestone"],
      default: "objective",
      index: true,
    },
    // PARENT GOAL FIELD (FOR OKR HIERARCHY)
    parentGoal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      default: null,
      index: true,
    },
    // LINKED PROJECTS ARRAY
    linkedProjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
      },
    ],
    // LINKED TASKS ARRAY
    linkedTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    // TARGET VALUE FIELD (FOR MEASURABLE GOALS)
    targetValue: {
      type: Number,
      default: 100,
      min: 0,
    },
    // CURRENT VALUE FIELD (FOR TRACKING PROGRESS)
    currentValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    // UNIT FIELD (E.G., '%', 'COUNT', 'HOURS', ETC.)
    unit: {
      type: String,
      default: "%",
      trim: true,
      maxlength: 20,
    },
    // START DATE FIELD
    startDate: {
      type: Date,
      default: null,
    },
    // DEADLINE FIELD
    deadline: {
      type: Date,
      default: null,
    },
    // STATUS FIELD
    status: {
      type: String,
      enum: [
        "not_started",
        "on_track",
        "at_risk",
        "behind",
        "completed",
        "cancelled",
      ],
      default: "not_started",
      index: true,
    },
    // PROGRESS FIELD (COMPUTED FROM CURRENT/TARGET OR LINKED TASKS)
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // COLOR FIELD (FOR UI CUSTOMIZATION)
    color: {
      type: String,
      default: "#6366f1",
      trim: true,
    },
    // ICON FIELD (FOR UI CUSTOMIZATION)
    icon: {
      type: String,
      default: "target",
      trim: true,
    },
    // QUARTER FIELD (E.G., 'Q1', 'Q2', 'Q3', 'Q4')
    quarter: {
      type: String,
      trim: true,
      default: null,
    },
    // YEAR FIELD
    year: {
      type: Number,
      default: null,
    },
    // IS ARCHIVED FIELD
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    // TIMESTAMPS
    timestamps: true,
  }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER GOALS
 */
// COMPOUND INDEX FOR USER GOALS
goalSchema.index({ userId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR WORKSPACE GOALS
 */
// COMPOUND INDEX FOR WORKSPACE GOALS
goalSchema.index({ workspaceId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR PARENT-CHILD RELATIONSHIP
 */
// COMPOUND INDEX FOR PARENT-CHILD RELATIONSHIP
goalSchema.index({ parentGoal: 1, type: 1 });
/**
 * COMPOUND INDEX FOR QUARTER/YEAR FILTERING
 */
// COMPOUND INDEX FOR QUARTER/YEAR FILTERING
goalSchema.index({ userId: 1, year: 1, quarter: 1 });
/**
 * TEXT INDEX FOR SEARCH
 */
// TEXT INDEX FOR SEARCH
goalSchema.index({ title: "text", description: "text" });

// <== PRE-SAVE MIDDLEWARE TO CALCULATE PROGRESS ==>
goalSchema.pre("save", function (next) {
  // CALCULATE PROGRESS FROM CURRENT VALUE AND TARGET VALUE
  if (this.targetValue > 0) {
    // CALCULATE PROGRESS FROM CURRENT VALUE AND TARGET VALUE
    this.progress = Math.min(
      100,
      Math.round((this.currentValue / this.targetValue) * 100)
    );
  }
  // AUTO-UPDATE STATUS BASED ON PROGRESS
  if (this.progress >= 100 && this.status !== "completed") {
    // AUTO-UPDATE STATUS BASED ON PROGRESS
    this.status = "completed";
  }
  next();
});

// <== EXPORTING THE GOAL MODEL ==>
export const Goal = mongoose.model<IGoal>("Goal", goalSchema);

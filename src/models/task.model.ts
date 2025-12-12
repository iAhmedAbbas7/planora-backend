// <== IMPORTS ==>
import mongoose from "mongoose";

// <== LINKED COMMIT SCHEMA ==>
const linkedCommitSchema = new mongoose.Schema(
  {
    // COMMIT SHA
    sha: {
      type: String,
      required: true,
    },
    // COMMIT MESSAGE
    message: {
      type: String,
      required: true,
    },
    // COMMIT URL
    url: {
      type: String,
      required: true,
    },
    // AUTHOR
    author: {
      name: { type: String },
      email: { type: String },
      username: { type: String },
      avatarUrl: { type: String },
    },
    // REPOSITORY
    repository: {
      owner: { type: String, required: true },
      name: { type: String, required: true },
      fullName: { type: String, required: true },
    },
    // COMMITTED AT
    committedAt: {
      type: Date,
      required: true,
    },
    // LINKED AT
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// <== LINKED PULL REQUEST SCHEMA ==>
const linkedPullRequestSchema = new mongoose.Schema(
  {
    // PR NUMBER
    number: {
      type: Number,
      required: true,
    },
    // PR TITLE
    title: {
      type: String,
      required: true,
    },
    // PR URL
    url: {
      type: String,
      required: true,
    },
    // PR STATE
    state: {
      type: String,
      enum: ["open", "closed", "merged"],
      required: true,
    },
    // AUTHOR
    author: {
      username: { type: String },
      avatarUrl: { type: String },
    },
    // REPOSITORY
    repository: {
      owner: { type: String, required: true },
      name: { type: String, required: true },
      fullName: { type: String, required: true },
    },
    // CREATED AT
    createdAt: {
      type: Date,
      required: true,
    },
    // MERGED AT
    mergedAt: {
      type: Date,
      default: null,
    },
    // LINKED AT
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// <== LINKED FILE SCHEMA ==>
const linkedFileSchema = new mongoose.Schema(
  {
    // FILE PATH
    path: {
      type: String,
      required: true,
    },
    // REPOSITORY
    repository: {
      owner: { type: String, required: true },
      name: { type: String, required: true },
      fullName: { type: String, required: true },
    },
    // FILE URL
    url: {
      type: String,
    },
    // LINKED AT
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// <== LINKED BRANCH SCHEMA ==>
const linkedBranchSchema = new mongoose.Schema(
  {
    // BRANCH NAME
    name: {
      type: String,
      required: true,
    },
    // REPOSITORY
    repository: {
      owner: { type: String, required: true },
      name: { type: String, required: true },
      fullName: { type: String, required: true },
    },
    // BRANCH URL
    url: {
      type: String,
    },
    // LINKED AT
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// <== TASK DEPENDENCY SCHEMA ==>
const taskDependencySchema = new mongoose.Schema(
  {
    // TASK ID REFERENCE
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    // DEPENDENCY TYPE: BLOCKS (THIS TASK BLOCKS ANOTHER), BLOCKED_BY (THIS TASK IS BLOCKED BY ANOTHER), RELATES_TO (RELATED TASKS)
    type: {
      type: String,
      enum: ["blocks", "blocked_by", "relates_to"],
      required: true,
    },
    // LINKED AT DATE
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// <== TIME SESSION SCHEMA ==>
const timeSessionSchema = new mongoose.Schema(
  {
    // STARTED AT
    startedAt: {
      type: Date,
      required: true,
    },
    // ENDED AT
    endedAt: {
      type: Date,
      default: null,
    },
    // DURATION IN MINUTES
    duration: {
      type: Number,
      default: 0,
    },
    // NOTE
    note: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  { _id: true }
);

// <== TASK SCHEMA ==>
const taskSchema = new mongoose.Schema(
  {
    // TITLE FIELD
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    // DESCRIPTION FIELD
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    // TASK KEY (UNIQUE IDENTIFIER FOR COMMIT LINKING e.g., "TASK-123")
    taskKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    // COMPLETED AT FIELD
    completedAt: {
      type: Date,
      default: null,
    },
    // PROJECT ID FIELD
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    // WORKSPACE ID FIELD (OPTIONAL - FOR WORKSPACE TASKS)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    // ASSIGNEE ID FIELD (OPTIONAL - WHO IS ASSIGNED TO THIS TASK)
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // STATUS FIELD
    status: {
      type: String,
      enum: ["to do", "in progress", "completed"],
      lowercase: true,
      trim: true,
      default: "to do",
      index: true,
      set: (val: string) => val.replace("inprogress", "in progress"),
    },
    // PRIORITY FIELD
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      lowercase: true,
      trim: true,
      default: "medium",
      index: true,
    },
    // DUE DATE FIELD
    dueDate: {
      type: Date,
      index: true,
    },
    // USER ID FIELD (CREATOR)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // IS TRASHED FIELD
    isTrashed: {
      type: Boolean,
      default: false,
      index: true,
    },
    // DELETED ON FIELD
    deletedOn: {
      type: Date,
      default: null,
    },
    // ORIGINAL STATUS FIELD (STORED BEFORE TRASHING)
    originalStatus: {
      type: String,
      default: null,
    },
    // LINKED CODE FIELD
    linkedCode: {
      // LINKED COMMITS
      commits: {
        type: [linkedCommitSchema],
        default: [],
      },
      // LINKED PULL REQUESTS
      pullRequests: {
        type: [linkedPullRequestSchema],
        default: [],
      },
      // LINKED FILES
      files: {
        type: [linkedFileSchema],
        default: [],
      },
      // LINKED BRANCHES
      branches: {
        type: [linkedBranchSchema],
        default: [],
      },
    },
    // TIME TRACKING FIELD
    timeTracking: {
      // ESTIMATED TIME IN MINUTES
      estimated: {
        type: Number,
        default: null,
      },
      // TOTAL LOGGED TIME IN MINUTES
      logged: {
        type: Number,
        default: 0,
      },
      // TIME SESSIONS
      sessions: {
        type: [timeSessionSchema],
        default: [],
      },
      // ACTIVE SESSION (IF TIMER IS RUNNING)
      activeSession: {
        startedAt: {
          type: Date,
          default: null,
        },
        note: {
          type: String,
          default: "",
        },
      },
    },
    // TASK DEPENDENCIES FIELD
    dependencies: {
      type: [taskDependencySchema],
      default: [],
    },
    // SUBTASKS FIELD (CHILD TASKS)
    subtasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    // PARENT TASK FIELD (IF THIS IS A SUBTASK)
    parentTask: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR USER AND STATUS QUERIES ==>
taskSchema.index({ userId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND IS TRASHED QUERIES
 */
//<== COMPOUND INDEX FOR USER AND IS TRASHED QUERIES ==>
taskSchema.index({ userId: 1, isTrashed: 1 });
/**
 * COMPOUND INDEX FOR PROJECT AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR PROJECT AND STATUS QUERIES ==>
taskSchema.index({ projectId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND PRIORITY QUERIES
 */
//<== COMPOUND INDEX FOR USER AND PRIORITY QUERIES ==>
taskSchema.index({ userId: 1, priority: 1 });
/**
 * COMPOUND INDEX FOR USER AND DUE DATE QUERIES
 */
//<== COMPOUND INDEX FOR USER AND DUE DATE QUERIES ==>
taskSchema.index({ userId: 1, dueDate: 1 });
/**
 * TEXT INDEX FOR SEARCH FUNCTIONALITY
 */
//<== TEXT INDEX FOR SEARCH FUNCTIONALITY ==>
taskSchema.index({ title: "text", description: "text" });
/**
 * INDEX FOR WORKSPACE QUERIES
 */
//<== INDEX FOR WORKSPACE QUERIES ==>
taskSchema.index({ workspaceId: 1, status: 1 });
/**
 * INDEX FOR ASSIGNEE QUERIES
 */
//<== INDEX FOR ASSIGNEE QUERIES ==>
taskSchema.index({ assigneeId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR WORKSPACE AND ASSIGNEE QUERIES
 */
//<== COMPOUND INDEX FOR WORKSPACE AND ASSIGNEE QUERIES ==>
taskSchema.index({ workspaceId: 1, assigneeId: 1 });
/**
 * INDEX FOR LINKED CODE COMMIT SHA QUERIES
 */
//<== INDEX FOR LINKED CODE COMMIT SHA QUERIES ==>
taskSchema.index({ "linkedCode.commits.sha": 1 }, { sparse: true });
/**
 * INDEX FOR LINKED CODE PR NUMBER QUERIES
 */
//<== INDEX FOR LINKED CODE PR NUMBER QUERIES ==>
taskSchema.index({ "linkedCode.pullRequests.number": 1 }, { sparse: true });
/**
 * INDEX FOR ACTIVE TIME TRACKING SESSIONS
 */
//<== INDEX FOR ACTIVE TIME TRACKING SESSIONS ==>
taskSchema.index(
  { userId: 1, "timeTracking.activeSession.startedAt": 1 },
  { sparse: true }
);
/**
 * INDEX FOR DEPENDENCIES
 */
//<== INDEX FOR DEPENDENCIES ==>
taskSchema.index({ "dependencies.taskId": 1 }, { sparse: true });
/**
 * INDEX FOR SUBTASKS
 */
//<== INDEX FOR SUBTASKS ==>
taskSchema.index({ subtasks: 1 }, { sparse: true });

// <== VIRTUAL FIELD FOR IS BLOCKED ==>
taskSchema.virtual("isBlocked").get(function () {
  // TASK IS BLOCKED IF IT HAS ANY "blocked_by" DEPENDENCIES
  return (
    this.dependencies &&
    this.dependencies.some((dep: { type: string }) => dep.type === "blocked_by")
  );
});

// <== ENSURE VIRTUALS ARE INCLUDED IN JSON OUTPUT ==>
taskSchema.set("toJSON", { virtuals: true });

// <== ENSURE VIRTUALS ARE INCLUDED IN OBJECT OUTPUT ==>
taskSchema.set("toObject", { virtuals: true });

// <== PRE-SAVE HOOK TO GENERATE TASK KEY ==>
taskSchema.pre("save", async function (next) {
  // IF TASK KEY IS NOT SET AND THIS IS A NEW DOCUMENT
  if (!this.taskKey && this.isNew) {
    // GET THE LAST TASK WITH A TASK KEY
    const TaskModel = mongoose.model("Task");
    // GET THE LAST TASK WITH A TASK KEY AND SORT BY CREATED AT IN DESCENDING ORDER
    const lastTask = (await TaskModel.findOne({
      taskKey: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .select("taskKey")
      .lean()
      .exec()) as { taskKey?: string } | null;
    // GENERATE NEW TASK KEY NUMBER
    let nextNumber = 1;
    // IF THE LAST TASK HAS A TASK KEY, GET THE LAST TASK KEY NUMBER
    if (lastTask?.taskKey) {
      // GET THE LAST TASK KEY NUMBER
      const match = lastTask.taskKey.match(/TASK-(\d+)/);
      // IF THE LAST TASK KEY NUMBER IS A NUMBER, INCREASE THE NUMBER BY 1
      if (match && match[1]) {
        // INCREASE THE NUMBER BY 1
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    // SET TASK KEY WITH THE NEW TASK KEY NUMBER AND THE TASK KEY PREFIX
    this.taskKey = `TASK-${nextNumber}`;
  }
  // CONTINUE
  next();
});

// <== EXPORTING THE TASK MODEL ==>
export const Task = mongoose.model("Task", taskSchema);

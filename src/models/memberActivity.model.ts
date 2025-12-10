// <== IMPORTS ==>
import mongoose from "mongoose";

// <== MEMBER ACTIVITY STATS INTERFACE ==>
export interface IMemberActivityStats {
  // <== COMMITS COUNT ==>
  commits: number;
  // <== PRS OPENED COUNT ==>
  prsOpened: number;
  // <== PRS MERGED COUNT ==>
  prsMerged: number;
  // <== PRS REVIEWED COUNT ==>
  prsReviewed: number;
  // <== ISSUES CLOSED COUNT ==>
  issuesClosed: number;
  // <== TASKS COMPLETED COUNT ==>
  tasksCompleted: number;
  // <== TASKS CREATED COUNT ==>
  tasksCreated: number;
  // <== LINES ADDED COUNT ==>
  linesAdded: number;
  // <== LINES REMOVED COUNT ==>
  linesRemoved: number;
  // <== CODE REVIEW COMMENTS COUNT ==>
  codeReviewComments: number;
  // <== ACTIVE TIME (MINUTES) ==>
  activeMinutes: number;
}

// <== MEMBER ACTIVITY INTERFACE ==>
export interface IMemberActivity {
  // <== USER ID ==>
  userId: mongoose.Types.ObjectId;
  // <== WORKSPACE ID ==>
  workspaceId: mongoose.Types.ObjectId;
  // <== DATE ==>
  date: Date;
  // <== STATS ==>
  stats: IMemberActivityStats;
  // <== CREATED AT ==>
  createdAt: Date;
  // <== UPDATED AT ==>
  updatedAt: Date;
}

// <== MEMBER ACTIVITY SCHEMA ==>
const memberActivitySchema = new mongoose.Schema(
  {
    // USER ID FIELD (REF TO USER)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // WORKSPACE ID FIELD (REF TO WORKSPACE)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    // DATE FIELD (DATE OF ACTIVITY - NO TIME COMPONENT)
    date: {
      type: Date,
      required: true,
      index: true,
    },
    // STATS FIELD
    stats: {
      // COMMITS COUNT
      commits: {
        type: Number,
        default: 0,
        min: 0,
      },
      // PRS OPENED COUNT
      prsOpened: {
        type: Number,
        default: 0,
        min: 0,
      },
      // PRS MERGED COUNT
      prsMerged: {
        type: Number,
        default: 0,
        min: 0,
      },
      // PRS REVIEWED COUNT
      prsReviewed: {
        type: Number,
        default: 0,
        min: 0,
      },
      // ISSUES CLOSED COUNT
      issuesClosed: {
        type: Number,
        default: 0,
        min: 0,
      },
      // TASKS COMPLETED COUNT
      tasksCompleted: {
        type: Number,
        default: 0,
        min: 0,
      },
      // TASKS CREATED COUNT
      tasksCreated: {
        type: Number,
        default: 0,
        min: 0,
      },
      // LINES ADDED COUNT
      linesAdded: {
        type: Number,
        default: 0,
        min: 0,
      },
      // LINES REMOVED COUNT
      linesRemoved: {
        type: Number,
        default: 0,
        min: 0,
      },
      // CODE REVIEW COMMENTS COUNT
      codeReviewComments: {
        type: Number,
        default: 0,
        min: 0,
      },
      // ACTIVE TIME (MINUTES)
      activeMinutes: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND UNIQUE INDEX FOR USER, WORKSPACE, AND DATE (ONE RECORD PER DAY)
 */
//<== COMPOUND UNIQUE INDEX FOR USER, WORKSPACE, AND DATE ==>
memberActivitySchema.index(
  { userId: 1, workspaceId: 1, date: 1 },
  { unique: true }
);
/**
 * COMPOUND INDEX FOR WORKSPACE AND DATE QUERIES (FOR TEAM REPORTS)
 */
//<== COMPOUND INDEX FOR WORKSPACE AND DATE QUERIES ==>
memberActivitySchema.index({ workspaceId: 1, date: -1 });
/**
 * COMPOUND INDEX FOR USER AND DATE QUERIES (FOR INDIVIDUAL REPORTS)
 */
//<== COMPOUND INDEX FOR USER AND DATE QUERIES ==>
memberActivitySchema.index({ userId: 1, date: -1 });
/**
 * COMPOUND INDEX FOR WORKSPACE DATE RANGE QUERIES
 */
//<== COMPOUND INDEX FOR WORKSPACE DATE RANGE QUERIES ==>
memberActivitySchema.index({ workspaceId: 1, date: 1, userId: 1 });

// <== STATIC METHOD TO GET OR CREATE ACTIVITY RECORD ==>
memberActivitySchema.statics.getOrCreate = async function (
  userId: mongoose.Types.ObjectId,
  workspaceId: mongoose.Types.ObjectId,
  date: Date
): Promise<IMemberActivity> {
  // NORMALIZE DATE TO START OF DAY (UTC)
  const normalizedDate = new Date(date);
  // SET HOURS TO 0
  normalizedDate.setUTCHours(0, 0, 0, 0);
  // FIND OR CREATE RECORD
  let record = await this.findOne({
    userId,
    workspaceId,
    date: normalizedDate,
  });
  // IF NOT FOUND, CREATE NEW RECORD
  if (!record) {
    record = await this.create({
      userId,
      workspaceId,
      date: normalizedDate,
      stats: {
        commits: 0,
        prsOpened: 0,
        prsMerged: 0,
        prsReviewed: 0,
        issuesClosed: 0,
        tasksCompleted: 0,
        tasksCreated: 0,
        linesAdded: 0,
        linesRemoved: 0,
        codeReviewComments: 0,
        activeMinutes: 0,
      },
    });
  }
  // RETURN RECORD
  return record;
};

// <== STATIC METHOD TO INCREMENT STAT ==>
memberActivitySchema.statics.incrementStat = async function (
  userId: mongoose.Types.ObjectId,
  workspaceId: mongoose.Types.ObjectId,
  stat: keyof IMemberActivityStats,
  value: number = 1
): Promise<void> {
  // NORMALIZE DATE TO START OF DAY (UTC)
  const today = new Date();
  // SET HOURS TO 0
  today.setUTCHours(0, 0, 0, 0);
  // UPDATE OR CREATE RECORD
  await this.updateOne(
    { userId, workspaceId, date: today },
    {
      $inc: { [`stats.${stat}`]: value },
      $setOnInsert: { userId, workspaceId, date: today },
    },
    { upsert: true }
  );
};

// <== EXPORTING THE MEMBER ACTIVITY MODEL ==>
export const MemberActivity = mongoose.model(
  "MemberActivity",
  memberActivitySchema
);

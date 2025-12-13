// <== IMPORTS ==>
import mongoose from "mongoose";

// <== BREAK SCHEMA ==>
const breakSchema = new mongoose.Schema(
  {
    // BREAK STARTED AT
    startedAt: {
      type: Date,
      required: true,
    },
    // BREAK ENDED AT
    endedAt: {
      type: Date,
      default: null,
    },
    // BREAK DURATION IN MINUTES
    duration: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

// <== POMODORO SETTINGS SCHEMA ==>
const pomodoroSettingsSchema = new mongoose.Schema(
  {
    // WORK DURATION IN MINUTES
    workDuration: {
      type: Number,
      default: 25,
    },
    // BREAK DURATION IN MINUTES
    breakDuration: {
      type: Number,
      default: 5,
    },
    // LONG BREAK DURATION IN MINUTES
    longBreakDuration: {
      type: Number,
      default: 15,
    },
    // SESSIONS BEFORE LONG BREAK
    sessionsBeforeLongBreak: {
      type: Number,
      default: 4,
    },
  },
  { _id: false }
);

// <== FOCUS SESSION SCHEMA ==>
const focusSessionSchema = new mongoose.Schema(
  {
    // USER ID
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // TASK ID (OPTIONAL)
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
      index: true,
    },
    // SESSION TITLE (OPTIONAL)
    title: {
      type: String,
      maxlength: 200,
      default: null,
    },
    // SESSION STARTED AT
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // SESSION ENDED AT
    endedAt: {
      type: Date,
      default: null,
    },
    // TOTAL DURATION IN MINUTES (EXCLUDING BREAKS)
    duration: {
      type: Number,
      default: 0,
    },
    // PLANNED DURATION IN MINUTES (0 = NO LIMIT)
    plannedDuration: {
      type: Number,
      default: 0,
    },
    // SESSION STATUS
    status: {
      type: String,
      enum: ["active", "paused", "completed", "abandoned"],
      default: "active",
      index: true,
    },
    // BREAKS ARRAY
    breaks: {
      type: [breakSchema],
      default: [],
    },
    // SESSION NOTES
    notes: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    // POMODORO MODE
    isPomodoroMode: {
      type: Boolean,
      default: false,
    },
    // POMODORO SETTINGS
    pomodoroSettings: {
      type: pomodoroSettingsSchema,
      default: () => ({}),
    },
    // CURRENT POMODORO NUMBER
    currentPomodoro: {
      type: Number,
      default: 1,
    },
    // TOTAL POMODOROS COMPLETED
    pomodorosCompleted: {
      type: Number,
      default: 0,
    },
    // IS ON BREAK (FOR POMODORO MODE)
    isOnBreak: {
      type: Boolean,
      default: false,
    },
    // AUTO-LINKED COMMITS DURING SESSION
    commits: {
      type: [
        {
          sha: { type: String, required: true },
          message: { type: String },
          url: { type: String },
          committedAt: { type: Date },
        },
      ],
      default: [],
    },
    // PAUSED AT (FOR TRACKING PAUSE TIME)
    pausedAt: {
      type: Date,
      default: null,
    },
    // TOTAL PAUSE DURATION IN MINUTES
    totalPauseDuration: {
      type: Number,
      default: 0,
    },
  },
  {
    // TIMESTAMPS
    timestamps: true,
  }
);

/**
 * COMPOUND INDEX FOR USER AND STATUS QUERIES
 */
//<== COMPOUND INDEX FOR USER AND STATUS QUERIES ==>
focusSessionSchema.index({ userId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND STARTED AT QUERIES
 */
//<== COMPOUND INDEX FOR USER AND STARTED AT QUERIES ==>
focusSessionSchema.index({ userId: 1, startedAt: -1 });
/**
 * COMPOUND INDEX FOR USER AND TASK ID QUERIES
 */
//<== COMPOUND INDEX FOR USER AND TASK ID QUERIES ==>
focusSessionSchema.index({ userId: 1, taskId: 1 });

// <== VIRTUAL: ELAPSED TIME ==>
focusSessionSchema.virtual("elapsedMinutes").get(function () {
  // IF STARTED AT IS NOT PROVIDED, RETURN 0
  if (!this.startedAt) return 0;
  // GET END TIME
  const endTime = this.endedAt || new Date();
  // CALCULATE ELAPSED TIME
  const elapsed = (endTime.getTime() - this.startedAt.getTime()) / 1000 / 60;
  // RETURN ELAPSED TIME
  return Math.max(0, elapsed - (this.totalPauseDuration || 0));
});

// <== VIRTUAL: IS ACTIVE ==>
focusSessionSchema.virtual("isActive").get(function () {
  // RETURN IF STATUS IS ACTIVE
  return this.status === "active";
});

// <== VIRTUAL: PROGRESS PERCENTAGE ==>
focusSessionSchema.virtual("progressPercent").get(function () {
  // IF PLANNED DURATION IS NOT PROVIDED OR IS 0, RETURN 0
  if (!this.plannedDuration || this.plannedDuration === 0) return 0;
  // GET ELAPSED MINUTES
  const elapsed = this.get("elapsedMinutes") || 0;
  // RETURN PROGRESS PERCENTAGE
  return Math.min(100, Math.round((elapsed / this.plannedDuration) * 100));
});

// <== ENSURE VIRTUALS ARE INCLUDED IN JSON OUTPUT ==>
focusSessionSchema.set("toJSON", { virtuals: true });
// <== ENSURE VIRTUALS ARE INCLUDED IN OBJECT OUTPUT ==>
focusSessionSchema.set("toObject", { virtuals: true });

// <== MODEL EXPORT ==>
export const FocusSession = mongoose.model("FocusSession", focusSessionSchema);

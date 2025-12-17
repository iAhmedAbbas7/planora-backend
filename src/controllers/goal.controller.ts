// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";
import { Goal, GoalStatus, GoalType } from "../models/goal.model.js";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest {
  // <== USER ID ==>
  id?: string;
}
/**
 *  CREATE A NEW GOAL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE GOAL CONTROLLER ==>
export const createGoal = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // DESTRUCTURE REQUEST BODY
  const {
    title,
    description,
    type,
    parentGoal,
    linkedProjects,
    linkedTasks,
    targetValue,
    currentValue,
    unit,
    startDate,
    deadline,
    status,
    color,
    icon,
    quarter,
    year,
    workspaceId,
  } = req.body as {
    title: string;
    description?: string;
    type?: GoalType;
    parentGoal?: string;
    linkedProjects?: string[];
    linkedTasks?: string[];
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    startDate?: string;
    deadline?: string;
    status?: GoalStatus;
    color?: string;
    icon?: string;
    quarter?: string;
    year?: number;
    workspaceId?: string;
  };
  // VALIDATE TITLE
  if (!title || title.trim().length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Title is required!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF PARENT GOAL PROVIDED, VALIDATE IT EXISTS AND BELONGS TO USER
  if (parentGoal) {
    // FIND PARENT GOAL
    const parent = await Goal.findOne({ _id: parentGoal, userId });
    // IF PARENT GOAL NOT FOUND, RETURN 404
    if (!parent) {
      // RETURNING ERROR RESPONSE
      res
        .status(404)
        .json({ message: "Parent goal not found!", success: false });
      // RETURNING FROM FUNCTION
      return;
    }
    // ENSURE PARENT IS AN OBJECTIVE (KEY RESULTS CAN'T HAVE CHILDREN)
    if (parent.type === "key_result") {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Key results cannot have child goals!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
  // CREATE NEW GOAL
  const goal = await Goal.create({
    userId,
    title: title.trim(),
    description: description?.trim(),
    type: type || "objective",
    parentGoal: parentGoal || null,
    linkedProjects: linkedProjects || [],
    linkedTasks: linkedTasks || [],
    targetValue: targetValue ?? 100,
    currentValue: currentValue ?? 0,
    unit: unit || "%",
    startDate: startDate ? new Date(startDate) : null,
    deadline: deadline ? new Date(deadline) : null,
    status: status || "not_started",
    color: color || "#6366f1",
    icon: icon || "target",
    quarter: quarter || null,
    year: year || null,
    workspaceId: workspaceId || null,
  });
  // RETURN SUCCESS RESPONSE
  res.status(201).json({
    message: "Goal created successfully!",
    success: true,
    data: goal,
  });
});

/**
 * GET ALL GOALS FOR A USER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GOALS CONTROLLER ==>
export const getGoals = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET QUERY PARAMETERS
  const {
    status,
    type,
    quarter,
    year,
    workspaceId,
    includeArchived,
    parentGoal,
  } = req.query as {
    status?: GoalStatus;
    type?: GoalType;
    quarter?: string;
    year?: string;
    workspaceId?: string;
    includeArchived?: string;
    parentGoal?: string;
  };
  // BUILD QUERY
  const query: Record<string, unknown> = { userId };
  // ADD STATUS FILTER
  if (status) {
    // ADD STATUS FILTER
    query.status = status;
  }
  // ADD TYPE FILTER
  if (type) {
    // ADD TYPE FILTER
    query.type = type;
  }
  // ADD QUARTER FILTER
  if (quarter) {
    // ADD QUARTER FILTER
    query.quarter = quarter;
  }
  // ADD YEAR FILTER
  if (year) {
    // ADD YEAR FILTER
    query.year = parseInt(year);
  }
  // ADD WORKSPACE FILTER
  if (workspaceId) {
    // ADD WORKSPACE FILTER
    query.workspaceId = workspaceId;
  } else {
    // ADD WORKSPACE FILTER
    query.workspaceId = null;
  }
  // ADD PARENT GOAL FILTER
  if (parentGoal === "null") {
    // ADD PARENT GOAL FILTER
    query.parentGoal = null;
  } else if (parentGoal) {
    // ADD PARENT GOAL FILTER
    query.parentGoal = parentGoal;
  }
  // ADD ARCHIVED FILTER
  if (includeArchived !== "true") {
    // ADD ARCHIVED FILTER
    query.isArchived = false;
  }
  // FETCH GOALS
  const goals = await Goal.find(query)
    .populate("linkedProjects", "title status")
    .populate("linkedTasks", "title status priority")
    .populate("parentGoal", "title type status")
    .sort({ createdAt: -1 })
    .lean();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Goals fetched successfully!",
    success: true,
    data: goals,
  });
});

/**
 * GET A SINGLE GOAL BY ID
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GOAL BY ID CONTROLLER ==>
export const getGoalById = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    return;
  }
  // GET GOAL ID
  const { id } = req.params;
  // VALIDATE GOAL ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND GOAL
  const goal = await Goal.findOne({ _id: id, userId })
    .populate("linkedProjects", "title description status dueDate")
    .populate("linkedTasks", "title description status priority dueDate")
    .populate("parentGoal", "title type status progress")
    .lean();
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH CHILD GOALS (KEY RESULTS/MILESTONES)
  const childGoals = await Goal.find({ parentGoal: id, userId })
    .select("title type status progress currentValue targetValue unit")
    .lean();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Goal fetched successfully!",
    success: true,
    data: { ...goal, childGoals },
  });
});

/**
 * UPDATE A GOAL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE GOAL CONTROLLER ==>
export const updateGoal = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID
  const { id } = req.params;
  // VALIDATE GOAL ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND GOAL
  const goal = await Goal.findOne({ _id: id, userId });
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // DESTRUCTURE REQUEST BODY
  const {
    title,
    description,
    type,
    parentGoal,
    targetValue,
    currentValue,
    unit,
    startDate,
    deadline,
    status,
    color,
    icon,
    quarter,
    year,
    isArchived,
  } = req.body as {
    title?: string;
    description?: string;
    type?: GoalType;
    parentGoal?: string | null;
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    startDate?: string | null;
    deadline?: string | null;
    status?: GoalStatus;
    color?: string;
    icon?: string;
    quarter?: string | null;
    year?: number | null;
    isArchived?: boolean;
  };
  // UPDATE TITLE IF PROVIDED
  if (title !== undefined) goal.title = title.trim();
  // UPDATE DESCRIPTION IF PROVIDED
  if (description !== undefined) goal.description = description?.trim() || "";
  // UPDATE TYPE IF PROVIDED
  if (type !== undefined) goal.type = type;
  // UPDATE PARENT GOAL IF PROVIDED
  if (parentGoal !== undefined) {
    // IF PARENT GOAL IS NULL, USE SET TO CLEAR THE FIELD
    if (parentGoal === null) {
      // USE SET TO CLEAR THE FIELD
      goal.set("parentGoal", null);
    } else {
      // FIND PARENT GOAL
      const parent = await Goal.findOne({ _id: parentGoal, userId });
      // IF PARENT GOAL NOT FOUND, RETURN 404
      if (!parent) {
        // RETURNING ERROR RESPONSE
        res
          .status(404)
          .json({ message: "Parent goal not found!", success: false });
        // RETURNING FROM FUNCTION
        return;
      }
      // PREVENT CIRCULAR REFERENCE
      if (parentGoal === id) {
        // RETURNING ERROR RESPONSE
        res.status(400).json({
          message: "A goal cannot be its own parent!",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // SET PARENT GOAL
      goal.parentGoal = new mongoose.Types.ObjectId(parentGoal);
    }
  }
  // UPDATE TARGET VALUE IF PROVIDED
  if (targetValue !== undefined) goal.targetValue = targetValue;
  // UPDATE CURRENT VALUE IF PROVIDED
  if (currentValue !== undefined) goal.currentValue = currentValue;
  // UPDATE UNIT IF PROVIDED
  if (unit !== undefined) goal.unit = unit;
  // UPDATE START DATE IF PROVIDED
  if (startDate !== undefined) {
    // USE SET TO HANDLE NULL/UNDEFINED PROPERLY
    goal.set("startDate", startDate ? new Date(startDate) : null);
  }
  // UPDATE DEADLINE IF PROVIDED
  if (deadline !== undefined) {
    // USE SET TO HANDLE NULL/UNDEFINED PROPERLY
    goal.set("deadline", deadline ? new Date(deadline) : null);
  }
  // UPDATE STATUS IF PROVIDED
  if (status !== undefined) goal.status = status;
  // UPDATE COLOR IF PROVIDED
  if (color !== undefined) goal.color = color;
  // UPDATE ICON IF PROVIDED
  if (icon !== undefined) goal.icon = icon;
  // UPDATE QUARTER IF PROVIDED
  if (quarter !== undefined) goal.set("quarter", quarter || null);
  // UPDATE YEAR IF PROVIDED
  if (year !== undefined) goal.set("year", year || null);
  // UPDATE IS ARCHIVED IF PROVIDED
  if (isArchived !== undefined) goal.isArchived = isArchived;
  // SAVE GOAL
  await goal.save();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Goal updated successfully!",
    success: true,
    data: goal,
  });
});

/**
 * DELETE A GOAL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE GOAL CONTROLLER ==>
export const deleteGoal = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID
  const { id } = req.params;
  // VALIDATE GOAL ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND AND DELETE GOAL
  const goal = await Goal.findOneAndDelete({ _id: id, userId });
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETE ALL CHILD GOALS (CASCADE DELETE)
  await Goal.deleteMany({ parentGoal: id, userId });
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Goal deleted successfully!",
    success: true,
  });
});

/**
 * LINK A TASK TO A GOAL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK TASK TO GOAL CONTROLLER ==>
export const linkTaskToGoal = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID
  const { id } = req.params;
  // GET TASK ID FROM BODY
  const { taskId } = req.body as { taskId: string };
  // VALIDATE IDS
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF TASK ID IS NOT VALID, RETURN 400
  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid task ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND GOAL
  const goal = await Goal.findOne({ _id: id, userId });
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // VERIFY TASK EXISTS AND BELONGS TO USER
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Task not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF TASK IS ALREADY LINKED
  if (goal.linkedTasks.some((t) => t.toString() === taskId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Task is already linked to this goal!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // ADD TASK TO LINKED TASKS
  goal.linkedTasks.push(new mongoose.Types.ObjectId(taskId));
  // SAVE GOAL
  await goal.save();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Task linked to goal successfully!",
    success: true,
    data: goal,
  });
});

/**
 * UNLINK A TASK FROM A GOAL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNLINK TASK FROM GOAL CONTROLLER ==>
export const unlinkTaskFromGoal = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID AND TASK ID
  const { id, taskId } = req.params;
  // VALIDATE IDS
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF TASK ID IS NOT VALID, RETURN 400
  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid task ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND GOAL
  const goal = await Goal.findOne({ _id: id, userId });
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // REMOVE TASK FROM LINKED TASKS
  goal.linkedTasks = goal.linkedTasks.filter((t) => t.toString() !== taskId);
  // SAVE GOAL
  await goal.save();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Task unlinked from goal successfully!",
    success: true,
    data: goal,
  });
});

/**
 * LINK A PROJECT TO A GOAL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK PROJECT TO GOAL CONTROLLER ==>
export const linkProjectToGoal = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID
  const { id } = req.params;
  // GET PROJECT ID FROM BODY
  const { projectId } = req.body as { projectId: string };
  // VALIDATE IDS
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF PROJECT ID IS NOT VALID, RETURN 400
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid project ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND GOAL
  const goal = await Goal.findOne({ _id: id, userId });
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // VERIFY PROJECT EXISTS AND BELONGS TO USER
  const project = await Project.findOne({ _id: projectId, userId });
  // IF PROJECT NOT FOUND, RETURN 404
  if (!project) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Project not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF PROJECT IS ALREADY LINKED
  if (goal.linkedProjects.some((p) => p.toString() === projectId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Project is already linked to this goal!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // ADD PROJECT TO LINKED PROJECTS
  goal.linkedProjects.push(new mongoose.Types.ObjectId(projectId));
  // SAVE GOAL
  await goal.save();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Project linked to goal successfully!",
    success: true,
    data: goal,
  });
});

/**
 * UNLINK A PROJECT FROM A GOAL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNLINK PROJECT FROM GOAL CONTROLLER ==>
export const unlinkProjectFromGoal = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID AND PROJECT ID
  const { id, projectId } = req.params;
  // VALIDATE IDS
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF PROJECT ID IS NOT VALID, RETURN 400
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid project ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND GOAL
  const goal = await Goal.findOne({ _id: id, userId });
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // REMOVE PROJECT FROM LINKED PROJECTS
  goal.linkedProjects = goal.linkedProjects.filter(
    (p) => p.toString() !== projectId
  );
  // SAVE GOAL
  await goal.save();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Project unlinked from goal successfully!",
    success: true,
    data: goal,
  });
});

/**
 * CALCULATE AND UPDATE GOAL PROGRESS BASED ON LINKED TASKS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CALCULATE PROGRESS CONTROLLER ==>
export const calculateProgress = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID
  const { id } = req.params;
  // VALIDATE GOAL ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({ message: "Invalid goal ID!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND GOAL
  const goal = await Goal.findOne({ _id: id, userId });
  // IF GOAL NOT FOUND, RETURN 404
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF GOAL HAS CHILD GOALS, CALCULATE PROGRESS FROM CHILDREN
  const childGoals = await Goal.find({ parentGoal: id, userId });
  // IF CHILD GOALS FOUND, CALCULATE PROGRESS FROM CHILDREN
  if (childGoals.length > 0) {
    // CALCULATE AVERAGE PROGRESS OF CHILD GOALS
    const totalProgress = childGoals.reduce(
      (sum, child) => sum + child.progress,
      0
    );
    // SET CURRENT VALUE TO AVERAGE PROGRESS OF CHILD GOALS
    goal.currentValue = Math.round(totalProgress / childGoals.length);
    // SET TARGET VALUE TO 100
    goal.targetValue = 100;
  } else if (goal.linkedTasks.length > 0) {
    // CALCULATE PROGRESS FROM LINKED TASKS
    const tasks = await Task.find({
      _id: { $in: goal.linkedTasks },
      userId,
    });
    // COUNT COMPLETED TASKS
    let completedTasksCount = 0;
    // LOOP THROUGH TASKS
    for (const t of tasks) {
      // IF TASK IS COMPLETED, INCREMENT COMPLETED TASKS COUNT
      if (t.status === "completed") {
        // INCREMENT COMPLETED TASKS COUNT
        completedTasksCount++;
      }
    }
    // SET TOTAL TASKS COUNT
    const totalTasks = tasks.length;
    // SET CURRENT VALUE TO COMPLETED TASKS COUNT
    goal.currentValue = totalTasks > 0 ? completedTasksCount : 0;
    // SET TARGET VALUE TO TOTAL TASKS COUNT
    goal.targetValue = totalTasks;
    // SET UNIT TO "tasks"
    goal.unit = "tasks";
  }
  // SAVE GOAL (PRE-SAVE MIDDLEWARE WILL CALCULATE PERCENTAGE)
  await goal.save();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Goal progress calculated successfully!",
    success: true,
    data: goal,
  });
});

/**
 * GET GOALS HIERARCHY (OKR TREE)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GOALS HIERARCHY CONTROLLER ==>
export const getGoalsHierarchy = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET QUERY PARAMETERS
  const { quarter, year, workspaceId, includeArchived } = req.query as {
    quarter?: string;
    year?: string;
    workspaceId?: string;
    includeArchived?: string;
  };
  // BUILD QUERY FOR ROOT GOALS (OBJECTIVES WITH NO PARENT)
  const query: Record<string, unknown> = {
    userId,
    parentGoal: null,
    type: "objective",
  };
  // ADD QUARTER FILTER
  if (quarter) query.quarter = quarter;
  // ADD YEAR FILTER
  if (year) query.year = parseInt(year);
  // ADD WORKSPACE ID FILTER
  if (workspaceId) {
    // ADD WORKSPACE ID FILTER
    query.workspaceId = workspaceId;
  } else {
    // ADD NULL WORKSPACE ID FILTER
    query.workspaceId = null;
  }
  // ADD ARCHIVED FILTER
  if (includeArchived !== "true") {
    // ADD ARCHIVED FILTER
    query.isArchived = false;
  }
  // FETCH ROOT OBJECTIVES
  const objectives = await Goal.find(query)
    .populate("linkedProjects", "title status")
    .populate("linkedTasks", "title status priority")
    .sort({ createdAt: -1 })
    .lean();
  // FOR EACH OBJECTIVE, FETCH ITS KEY RESULTS
  const hierarchy = await Promise.all(
    // LOOP THROUGH OBJECTIVES
    objectives.map(async (objective) => {
      // FETCH KEY RESULTS FOR THIS OBJECTIVE
      const keyResults = await Goal.find({
        parentGoal: objective._id,
        userId,
        isArchived: includeArchived === "true" ? { $in: [true, false] } : false,
      })
        .populate("linkedTasks", "title status priority")
        .sort({ createdAt: 1 })
        .lean();
      // RETURN OBJECTIVE WITH KEY RESULTS
      return {
        ...objective,
        keyResults,
      };
    })
  );
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Goals hierarchy fetched successfully!",
    success: true,
    data: hierarchy,
  });
});

/**
 * GET GOAL STATISTICS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET GOAL STATS CONTROLLER ==>
export const getGoalStats = expressAsyncHandler(async (req, res) => {
  // GET USER ID
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET QUERY PARAMETERS
  const { quarter, year, workspaceId } = req.query as {
    quarter?: string;
    year?: string;
    workspaceId?: string;
  };
  // BUILD BASE QUERY
  const baseQuery: Record<string, unknown> = { userId, isArchived: false };
  // ADD QUARTER FILTER
  if (quarter) baseQuery.quarter = quarter;
  // ADD YEAR FILTER
  if (year) baseQuery.year = parseInt(year);
  // ADD WORKSPACE ID FILTER
  if (workspaceId) {
    // ADD WORKSPACE ID FILTER
    baseQuery.workspaceId = workspaceId;
  } else {
    // ADD NULL WORKSPACE ID FILTER
    baseQuery.workspaceId = null;
  }
  // GET TOTAL GOALS
  const totalGoals = await Goal.countDocuments(baseQuery);
  // GET GOALS BY STATUS
  const byStatus = await Goal.aggregate([
    { $match: baseQuery },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  // GET GOALS BY TYPE
  const byType = await Goal.aggregate([
    { $match: baseQuery },
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);
  // GET AVERAGE PROGRESS
  const avgProgressResult = await Goal.aggregate([
    { $match: baseQuery },
    { $group: { _id: null, avgProgress: { $avg: "$progress" } } },
  ]);
  // GET AVERAGE PROGRESS
  const avgProgress = avgProgressResult[0]?.avgProgress || 0;
  // GET COMPLETED GOALS COUNT
  const completedGoals = await Goal.countDocuments({
    ...baseQuery,
    status: "completed",
  });
  // GET AT RISK GOALS COUNT
  const atRiskGoals = await Goal.countDocuments({
    ...baseQuery,
    status: { $in: ["at_risk", "behind"] },
  });
  // FORMAT STATS
  const stats = {
    totalGoals,
    completedGoals,
    atRiskGoals,
    avgProgress: Math.round(avgProgress),
    completionRate:
      totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0,
    byStatus: byStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>),
    byType: byType.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>),
  };
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    message: "Goal statistics fetched successfully!",
    success: true,
    data: stats,
  });
});

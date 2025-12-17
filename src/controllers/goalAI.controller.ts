// <== IMPORTS ==>
import mongoose from "mongoose";
import { Goal } from "../models/goal.model.js";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";
import { GoogleGenerativeAI } from "@google/generative-ai";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest {
  // <== USER ID ==>
  id?: string;
}

// <== GEMINI CLIENT ==>
const getGeminiClient = (): GoogleGenerativeAI | null => {
  // CHECK IF GEMINI API KEY IS SET
  if (!process.env.GEMINI_API_KEY) {
    // RETURN NULL
    return null;
  }
  // CREATE AND RETURN GEMINI CLIENT
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

// <== GET GEMINI MODEL ==>
const getGeminiModel = () => {
  // GET GEMINI CLIENT
  const genAI = getGeminiClient();
  // IF NOT CONFIGURED, RETURN NULL
  if (!genAI) return null;
  // RETURN GEMINI 2.0 FLASH MODEL (FREE TIER)
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
};

/**
 * SUGGEST KEY RESULTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SUGGEST KEY RESULTS ==>
export const suggestKeyResults = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OBJECTIVE ID FROM REQUEST BODY
  const {
    objectiveTitle,
    objectiveDescription,
    count = 3,
  } = req.body as {
    objectiveTitle?: string;
    objectiveDescription?: string;
    count?: number;
  };
  // VALIDATE INPUT
  if (!objectiveTitle) {
    // RETURNING ERROR RESPONSE
    res
      .status(400)
      .json({
        message: "Objective title is required for suggestions!",
        success: false,
      });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF NOT CONFIGURED, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res
      .status(500)
      .json({
        message:
          "AI service is not configured. Please check server configuration.",
        success: false,
      });
    // RETURNING FROM FUNCTION
    return;
  }
  // BUILD THE PROMPT
  const prompt = `You are a strategic planning expert helping to define measurable Key Results for an OKR (Objectives and Key Results) framework.
  Given the following Objective:
  - Title: "${objectiveTitle}"
  ${objectiveDescription ? `- Description: "${objectiveDescription}"` : ""}
  Generate ${count} specific, measurable Key Results that would indicate successful achievement of this objective.
  Each Key Result should:
  1. Be measurable with a specific target number or percentage
  2. Be time-bound (achievable within a quarter)
  3. Be ambitious but realistic
  4. Have a clear unit of measurement (number, percentage, or currency)
  Respond with a JSON array of key results. Each key result should have:
  - title: A clear, action-oriented title
  - description: Brief explanation of what this measures
  - targetValue: The target number to achieve
  - unit: "number", "percentage", or "currency"
  - priority: "low", "medium", or "high" based on impact
  Example response format:
  [
    {
      "title": "Increase customer satisfaction score to 90%",
      "description": "Measure through quarterly NPS surveys",
      "targetValue": 90,
      "unit": "percentage",
      "priority": "high"
    }
  ]
  Respond ONLY with the JSON array, no additional text or markdown formatting.`;
  // TRY TO GENERATE CONTENT
  try {
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE TEXT
    const responseText = result.response.text();
    // PARSE JSON RESPONSE
    let suggestions;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      suggestions = JSON.parse(cleanedText);
    } catch {
      // IF PARSING FAILS, RETURN ERROR
      res
        .status(500)
        .json({
          message: "Failed to parse AI response. Please try again.",
          success: false,
        });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATE SUGGESTIONS
    if (!Array.isArray(suggestions)) {
      // RETURNING ERROR RESPONSE
      res
        .status(500)
        .json({
          message: "Invalid AI response format. Please try again.",
          success: false,
        });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Key results suggested successfully!",
      success: true,
      data: suggestions,
    });
  } catch (error: any) {
    // HANDLE AI ERRORS
    if (
      error.message?.includes("AI service") ||
      error.message?.includes("parse")
    ) {
      // RETURNING ERROR RESPONSE
      res
        .status(500)
        .json({
          message: "Failed to generate suggestions. Please try again later.",
          success: false,
        });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURNING ERROR RESPONSE
    res
      .status(500)
      .json({
        message: "Failed to generate suggestions. Please try again later.",
        success: false,
      });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * ANALYZE GOAL PROGRESS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== ANALYZE GOAL PROGRESS ==>
export const analyzeGoalProgress = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH USER'S GOALS
  const goals = await Goal.find({ userId, isArchived: false })
    .populate("linkedProjects", "title status")
    .populate("linkedTasks", "title status")
    .lean();
  // IF NO GOALS FOUND
  if (!goals || goals.length === 0) {
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "No goals found for analysis.",
      success: true,
      data: {
        summary:
          "No goals to analyze yet. Start by creating your first objective!",
        insights: [],
        recommendations: [],
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF NOT CONFIGURED, PROVIDE BASIC ANALYSIS
  if (!model) {
    // GET OBJECTIVES
    const objectives = goals.filter((g) => g.type === "objective");
    // GET KEY RESULTS
    const keyResults = goals.filter((g) => g.type === "key_result");
    // GET COMPLETED GOALS
    const completedGoals = goals.filter((g) => g.status === "completed");
    // GET AT RISK GOALS
    const atRiskGoals = goals.filter((g) => g.status === "at_risk");
    // CALCULATE AVERAGE PROGRESS
    const avgProgress =
      goals.reduce((sum, g) => sum + g.progress, 0) / goals.length;
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Goal progress analyzed (basic).",
      success: true,
      data: {
        summary: `You have ${objectives.length} objectives and ${
          keyResults.length
        } key results. Average progress: ${Math.round(avgProgress)}%.`,
        insights: [
          `${completedGoals.length} goals completed`,
          `${atRiskGoals.length} goals at risk`,
          `Average progress across all goals: ${Math.round(avgProgress)}%`,
        ],
        recommendations: [
          "Focus on at-risk goals first",
          "Review key results that are below 50% progress",
          "Consider breaking down large objectives into smaller key results",
        ],
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // BUILD CONTEXT FOR AI
  const goalsContext = goals.map((g) => ({
    title: g.title,
    type: g.type,
    status: g.status,
    progress: g.progress,
    deadline: g.deadline,
    targetValue: g.targetValue,
    currentValue: g.currentValue,
    linkedProjectsCount: g.linkedProjects?.length || 0,
    linkedTasksCount: g.linkedTasks?.length || 0,
  }));
  // BUILD THE PROMPT
  const prompt = `You are an OKR coach analyzing a user's goals and providing actionable insights.
  Here are the user's current goals and their progress:
  ${JSON.stringify(goalsContext, null, 2)}
  Analyze this data and provide:
  1. A brief summary (2-3 sentences) of overall goal progress
  2. 3-5 specific insights about their goal performance
  3. 3-5 actionable recommendations for improvement
  Consider:
  - Progress patterns across objectives vs key results
  - Goals that are at risk or behind schedule
  - Alignment between goals and projects/tasks
  - Balance between different priorities
  Respond with a JSON object:
  {
    "summary": "Brief overall summary",
    "insights": ["insight 1", "insight 2", ...],
    "recommendations": ["recommendation 1", "recommendation 2", ...]
  }
  Respond ONLY with the JSON object, no additional text or markdown formatting.`;
  // TRY TO GENERATE CONTENT
  try {
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE TEXT
    const responseText = result.response.text();
    // PARSE JSON RESPONSE
    let analysis;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      analysis = JSON.parse(cleanedText);
    } catch {
      // IF PARSING FAILS, RETURN BASIC ANALYSIS
      const avgProgress =
        goals.reduce((sum, g) => sum + g.progress, 0) / goals.length;
      analysis = {
        summary: `You have ${
          goals.length
        } goals with an average progress of ${Math.round(avgProgress)}%.`,
        insights: ["AI analysis temporarily unavailable"],
        recommendations: ["Continue tracking your progress regularly"],
      };
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Goal progress analyzed successfully!",
      success: true,
      data: analysis,
    });
  } catch (error) {
    // CALCULATE AVERAGE PROGRESS
    const avgProgress =
      goals.reduce((sum, g) => sum + g.progress, 0) / goals.length;
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Goal progress analyzed (basic).",
      success: true,
      data: {
        summary: `You have ${
          goals.length
        } goals with an average progress of ${Math.round(avgProgress)}%.`,
        insights: ["Continue working towards your objectives"],
        recommendations: ["Focus on high-priority goals first"],
      },
    });
  }
});

/**
 * SUGGEST GOAL ALIGNMENT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SUGGEST GOAL ALIGNMENT ==>
export const suggestGoalAlignment = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GOAL ID FROM REQUEST PARAMETERS
  const { goalId } = req.params as { goalId: string };
  // VALIDATE GOAL ID
  if (!goalId || !mongoose.Types.ObjectId.isValid(goalId)) {
    // RETURNING ERROR RESPONSE
    res
      .status(400)
      .json({ message: "Invalid goal ID provided!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND THE GOAL
  const goal = await Goal.findById(goalId).lean();
  // IF GOAL NOT FOUND
  if (!goal) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({ message: "Goal not found!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK OWNERSHIP
  if (goal.userId.toString() !== userId?.toString()) {
    // RETURNING ERROR RESPONSE
    res
      .status(403)
      .json({ message: "Not authorized to access this goal!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH USER'S PROJECTS (NOT ALREADY LINKED)
  const projects = await Project.find({
    userId,
    isDeleted: { $ne: true },
    _id: { $nin: goal.linkedProjects },
  })
    .select("title description status")
    .lean();
  // FETCH USER'S TASKS (NOT ALREADY LINKED)
  const tasks = await Task.find({
    userId,
    isDeleted: { $ne: true },
    _id: { $nin: goal.linkedTasks },
  })
    .select("title description status priority")
    .lean();
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF NOT CONFIGURED, RETURN SIMPLE MATCHING
  if (!model) {
    // SIMPLE KEYWORD MATCHING
    const goalKeywords = goal.title.toLowerCase().split(" ");
    // FILTER PROJECTS WITH KEYWORD MATCHING
    const matchedProjects: typeof projects = [];
    // LOOP THROUGH PROJECTS
    for (const p of projects) {
      // GET PROJECT TEXT
      const text = `${p.title} ${p.description || ""}`.toLowerCase();
      // CHECK IF PROJECT HAS KEYWORD MATCHING
      const hasMatch = goalKeywords.some(
        (keyword) => keyword.length > 3 && text.includes(keyword)
      );
      // IF PROJECT HAS KEYWORD MATCHING, ADD TO MATCHED PROJECTS
      if (hasMatch) {
        // ADD PROJECT TO MATCHED PROJECTS
        matchedProjects.push(p);
        // IF MATCHED PROJECTS COUNT IS 5, BREAK LOOP
        if (matchedProjects.length >= 5) break;
      }
    }
    // FILTER TASKS WITH KEYWORD MATCHING
    const matchedTasks: typeof tasks = [];
    // LOOP THROUGH TASKS
    for (const t of tasks) {
      // GET TASK TEXT
      const text = `${t.title} ${t.description || ""}`.toLowerCase();
      // CHECK IF TASK HAS KEYWORD MATCHING
      const hasMatch = goalKeywords.some(
        (keyword) => keyword.length > 3 && text.includes(keyword)
      );
      // IF TASK HAS KEYWORD MATCHING, ADD TO MATCHED TASKS
      if (hasMatch) {
        // ADD TASK TO MATCHED TASKS
        matchedTasks.push(t);
        // IF MATCHED TASKS COUNT IS 5, BREAK LOOP
        if (matchedTasks.length >= 5) break;
      }
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Alignment suggestions generated (basic).",
      success: true,
      data: {
        suggestedProjects: matchedProjects,
        suggestedTasks: matchedTasks,
        reasoning: "Suggestions based on keyword matching.",
      },
    });
    return;
  }
  // BUILD AVAILABLE PROJECTS LIST
  const availableProjects: {
    id: string;
    title: string;
    description?: string;
  }[] = [];
  // LOOP THROUGH PROJECTS
  const projectsToProcess = projects.slice(0, 20);
  // LOOP THROUGH PROJECTS TO PROCESS
  for (const p of projectsToProcess) {
    // ADD PROJECT TO AVAILABLE PROJECTS
    availableProjects.push({
      id: p._id.toString(),
      title: p.title,
      description: p.description,
    });
  }
  // BUILD AVAILABLE TASKS LIST
  const availableTasks: { id: string; title: string; description?: string }[] =
    [];
  // SLICE TASKS TO PROCESS
  const tasksToProcess = tasks.slice(0, 30);
  // LOOP THROUGH TASKS TO PROCESS
  for (const t of tasksToProcess) {
    // ADD TASK TO AVAILABLE TASKS
    availableTasks.push({
      id: t._id.toString(),
      title: t.title,
      description: t.description,
    });
  }
  // BUILD CONTEXT FOR AI
  const context = {
    goal: {
      title: goal.title,
      description: goal.description,
      type: goal.type,
    },
    availableProjects,
    availableTasks,
  };
  // BUILD THE PROMPT
  const prompt = `You are helping align projects and tasks to an OKR goal.
  Goal:
  - Title: "${context.goal.title}"
  - Description: "${context.goal.description || "No description"}"
  - Type: ${context.goal.type}
  Available Projects:
  ${JSON.stringify(context.availableProjects, null, 2)}
  Available Tasks:
  ${JSON.stringify(context.availableTasks, null, 2)}
  Identify which projects and tasks would contribute to achieving this goal.
  Respond with a JSON object:
  {
    "projectIds": ["id1", "id2", ...],
    "taskIds": ["id1", "id2", ...],
    "reasoning": "Brief explanation of why these items align with the goal"
  }
  Select only items that have a clear connection to the goal. Limit to 5 projects and 10 tasks maximum.
  Respond ONLY with the JSON object, no additional text or markdown formatting.`;
  // TRY TO GENERATE CONTENT
  try {
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE TEXT
    const responseText = result.response.text();
    // DEFINE SUGGESTIONS TYPE
    interface AlignmentSuggestions {
      projectIds?: string[];
      taskIds?: string[];
      reasoning?: string;
    }
    // TRY TO PARSE AS JSON
    let suggestions: AlignmentSuggestions | null = null;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      suggestions = JSON.parse(cleanedText) as AlignmentSuggestions;
    } catch {
      // IF PARSING FAILS, RETURN BASIC ANALYSIS
      res.status(200).json({
        message: "Alignment suggestions generated (basic).",
        success: true,
        data: {
          suggestedProjects: projects.slice(0, 3),
          suggestedTasks: tasks.slice(0, 5),
          reasoning: "Showing recent items for review.",
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // MAP IDS TO FULL OBJECTS
    const suggestedProjects: typeof projects = [];
    // LOOP THROUGH PROJECTS
    const suggestedProjectIds = suggestions?.projectIds || [];
    // LOOP THROUGH PROJECTS
    for (const p of projects) {
      // CHECK IF PROJECT ID IS IN SUGGESTED PROJECT IDs
      if (suggestedProjectIds.includes(p._id.toString())) {
        // ADD PROJECT TO SUGGESTED PROJECTS
        suggestedProjects.push(p);
      }
    }
    // LOOP THROUGH TASKS
    const suggestedTasks: typeof tasks = [];
    // LOOP THROUGH TASKS
    const suggestedTaskIds = suggestions?.taskIds || [];
    // LOOP THROUGH TASKS
    for (const t of tasks) {
      // CHECK IF TASK ID IS IN SUGGESTED TASK IDs
      if (suggestedTaskIds.includes(t._id.toString())) {
        // ADD TASK TO SUGGESTED TASKS
        suggestedTasks.push(t);
      }
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Alignment suggestions generated successfully!",
      success: true,
      data: {
        suggestedProjects,
        suggestedTasks,
        reasoning:
          suggestions?.reasoning || "AI-powered alignment suggestions.",
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error) {
    // IF ERROR, RETURN BASIC ANALYSIS
    res.status(200).json({
      message: "Alignment suggestions generated (basic).",
      success: true,
      data: {
        suggestedProjects: projects.slice(0, 3),
        suggestedTasks: tasks.slice(0, 5),
        reasoning: "Showing recent items for review.",
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GENERATE OBJECTIVE FROM DESCRIPTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GENERATE OBJECTIVE FROM DESCRIPTION ==>
export const generateObjective = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF NO USER ID, RETURN UNAUTHORIZED
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({ message: "Unauthorized!", success: false });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET INPUT FROM REQUEST BODY
  const { description, context } = req.body as {
    description?: string;
    context?: string;
  };
  // IF NO DESCRIPTION, RETURN ERROR
  if (!description) {
    // RETURNING ERROR RESPONSE
    res
      .status(400)
      .json({
        message: "Description is required to generate an objective!",
        success: false,
      });
    // RETURNING FROM FUNCTION
    return;
  }
  // IF NO CONTEXT, RETURN ERROR
  if (!context) {
    // RETURNING ERROR RESPONSE
    res
      .status(400)
      .json({
        message: "Context is required to generate an objective!",
        success: false,
      });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF NOT CONFIGURED, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res
      .status(500)
      .json({
        message:
          "AI service is not configured. Please check server configuration.",
        success: false,
      });
    // RETURNING FROM FUNCTION
    return;
  }
  // BUILD THE PROMPT
  const prompt = `You are an OKR expert helping to create well-formed objectives.
  User's rough description: "${description}"
  ${context ? `Additional context: "${context}"` : ""}
  Create a well-formed Objective that is:
  1. Inspiring and qualitative (not a metric)
  2. Action-oriented (starts with a verb)
  3. Time-bound (achievable within a quarter)
  4. Ambitious but achievable
  5. Clear and concise
  Also suggest 3 potential key results that could measure success.
  Respond with a JSON object:
  {
    "objective": {
      "title": "Well-formed objective title",
      "description": "Brief description explaining the objective"
    },
    "suggestedKeyResults": [
      {
        "title": "Key result title",
        "targetValue": 100,
        "unit": "percentage"
      }
    ]
  }
  Respond ONLY with the JSON object, no additional text or markdown formatting.`;
  // TRY TO GENERATE CONTENT
  try {
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE TEXT
    const responseText = result.response.text();
    // TRY TO PARSE AS JSON
    let generated;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      generated = JSON.parse(cleanedText);
    } catch {
      // RETURNING ERROR RESPONSE
      res
        .status(500)
        .json({
          message: "Failed to parse AI response. Please try again.",
          success: false,
        });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Objective generated successfully!",
      success: true,
      data: generated,
    });
  } catch (error: any) {
    // IF ERROR, RETURN ERROR
    if (
      error.message?.includes("AI service") ||
      error.message?.includes("parse")
    ) {
      // RETURNING ERROR RESPONSE
      res
        .status(500)
        .json({
          message: "Failed to generate objective. Please try again later.",
          success: false,
        });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURNING ERROR RESPONSE
    res
      .status(500)
      .json({
        message: "Failed to generate objective. Please try again later.",
        success: false,
      });
    // RETURNING FROM FUNCTION
    return;
  }
});

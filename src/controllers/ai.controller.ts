// <== IMPORTS ==>
import mongoose from "mongoose";
import { Octokit } from "@octokit/rest";
import { Task } from "../models/task.model.js";
import { User } from "../models/user.model.js";
import { Project } from "../models/project.model.js";
import { decryptSecret } from "../utils/encryption.js";
import expressAsyncHandler from "express-async-handler";
import { GoogleGenerativeAI } from "@google/generative-ai";

// <== GEMINI CLIENT ==>
const getGeminiClient = (): GoogleGenerativeAI | null => {
  // CHECK IF GEMINI API KEY IS SET
  if (!process.env.GEMINI_API_KEY) {
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

// <== GENERATED TASK TYPE ==>
interface GeneratedTask {
  // <== TITLE ==>
  title: string;
  // <== DESCRIPTION ==>
  description: string;
  // <== PRIORITY ==>
  priority: "low" | "medium" | "high";
  // <== STATUS ==>
  status: "to do" | "in progress" | "completed";
}

// <== GITHUB USER DATA TYPE ==>
interface GitHubUserData {
  // <== GITHUB ACCESS TOKEN ==>
  githubAccessToken?: string;
  // <== GITHUB USERNAME ==>
  githubUsername?: string;
}

/**
 * GET OCTOKIT INSTANCE FOR USER
 * @param userId - User ID
 * @returns Object With Octokit Instance or Error
 */
// <== GET OCTOKIT INSTANCE ==>
const getOctokitForUser = async (
  userId: string
): Promise<{
  octokit: Octokit | null;
  error: { status: number; message: string } | null;
}> => {
  // FIND USER BY ID WITH GITHUB TOKEN
  const user = await User.findById(userId)
    .select("+githubAccessToken githubUsername")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN ERROR
  if (!user) {
    return {
      octokit: null,
      error: { status: 404, message: "User not found!" },
    };
  }
  // CAST USER TO GITHUB USER DATA TYPE
  const githubUser = user as unknown as GitHubUserData;
  // CHECK IF GITHUB IS CONNECTED
  if (!githubUser.githubAccessToken || !githubUser.githubUsername) {
    return {
      octokit: null,
      error: {
        status: 400,
        message: "GitHub is not connected to your account.",
      },
    };
  }
  // DECRYPT ACCESS TOKEN
  let decryptedToken: string;
  try {
    // DECRYPTING ACCESS TOKEN
    decryptedToken = decryptSecret(githubUser.githubAccessToken);
  } catch (error) {
    return {
      octokit: null,
      error: {
        status: 500,
        message:
          "Error processing GitHub token. Please reconnect your account.",
      },
    };
  }
  // CREATE AND RETURN OCTOKIT INSTANCE
  const octokit = new Octokit({ auth: decryptedToken });
  return { octokit, error: null };
};

/**
 * PARSE AI RESPONSE TO EXTRACT TASKS
 * @param response - AI Response String
 * @returns Array of Generated Tasks
 */
// <== PARSE AI RESPONSE ==>
const parseAIResponse = (response: string): GeneratedTask[] => {
  // TRY TO PARSE JSON FROM RESPONSE
  try {
    // FIND JSON ARRAY IN RESPONSE
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      // PARSE JSON
      const tasks = JSON.parse(jsonMatch[0]);
      // VALIDATE AND RETURN TASKS
      return tasks
        .filter(
          (task: any) =>
            task.title && typeof task.title === "string" && task.title.trim()
        )
        .map((task: any) => ({
          title: task.title.trim().substring(0, 200),
          description: (task.description || "").trim().substring(0, 2000),
          priority: ["low", "medium", "high"].includes(
            task.priority?.toLowerCase()
          )
            ? task.priority.toLowerCase()
            : "medium",
          status: "to do" as const,
        }));
    }
    return [];
  } catch (error) {
    return [];
  }
};

/**
 * GET AI STATUS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET AI STATUS ==>
export const getAIStatus = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF GEMINI IS CONFIGURED
  const isAIConfigured = !!process.env.GEMINI_API_KEY;
  // CHECK IF USER HAS GITHUB CONNECTED
  const user = await User.findById(userId)
    .select("githubUsername githubConnectedAt")
    .lean()
    .exec();
  // IF USER NOT FOUND, RETURN 404 ERROR
  if (!user) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "User not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF GITHUB IS CONNECTED
  const isGitHubConnected = !!(user.githubUsername && user.githubConnectedAt);
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message: "AI status retrieved successfully!",
    success: true,
    data: {
      isAIConfigured,
      isGitHubConnected,
      canGenerateTasks: isAIConfigured && isGitHubConnected,
      aiProvider: "Google Gemini",
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GENERATE TASKS FROM README
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GENERATE TASKS FROM README ==>
export const generateTasksFromReadme = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF GEMINI NOT CONFIGURED, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI service is not configured. Please contact administrator.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET REQUEST BODY
  const { owner, repo, projectId, maxTasks = 10 } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Repository owner and name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE PROJECT ID IF PROVIDED
  if (projectId && !mongoose.Types.ObjectId.isValid(projectId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid Project ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH README
  let readmeContent: string;
  try {
    // GET REPOSITORY README
    const { data: readme } = await octokit.repos.getReadme({
      owner,
      repo,
      mediaType: {
        format: "raw",
      },
    });
    // SET README CONTENT
    readmeContent = readme as unknown as string;
  } catch (error: any) {
    // README NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository does not have a README file.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // TOKEN EXPIRED
    if (error.status === 401) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching README. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // TRUNCATE README IF TOO LONG
  const truncatedReadme = readmeContent.substring(0, 8000);
  // GENERATE TASKS USING GEMINI
  try {
    // CREATE PROMPT
    const prompt = `
    You are a project management assistant that analyzes README files and generates actionable development tasks. Your task is to analyze the README content and generate practical, specific development tasks that would help implement or improve the project.
    Rules:
    - Generate between 3 and ${maxTasks} tasks maximum
    - Each task should be specific and actionable
    - Focus on implementation tasks, not documentation
    - Assign priority based on importance (low, medium, high)
    - Return ONLY a valid JSON array of tasks, no other text
    Output format (JSON array only):
    [
      {
        "title": "Task title (max 200 chars)",
        "description": "Detailed description of what needs to be done (max 2000 chars)",
        "priority": "low" | "medium" | "high"
      }
    ]
    README Content: ${truncatedReadme} Generate development tasks based on this README:`;
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE CONTENT
    const responseContent = result.response.text();
    // PARSE TASKS FROM RESPONSE
    const generatedTasks = parseAIResponse(responseContent);
    // IF NO TASKS GENERATED, RETURN ERROR
    if (generatedTasks.length === 0) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message:
          "Could not generate tasks from README. Try a different repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Tasks generated successfully from README!",
      success: true,
      data: {
        tasks: generatedTasks,
        source: "readme",
        repository: `${owner}/${repo}`,
        projectId: projectId || null,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error generating tasks from README:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error generating tasks. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * GENERATE TASKS FROM COMMITS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GENERATE TASKS FROM COMMITS ==>
export const generateTasksFromCommits = expressAsyncHandler(
  async (req, res) => {
    // GET USER ID FROM REQUEST
    const userId = (req as any).id;
    // IF USER ID NOT PROVIDED, RETURN 401 ERROR
    if (!userId) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET GEMINI MODEL
    const model = getGeminiModel();
    // IF GEMINI NOT CONFIGURED, RETURN ERROR
    if (!model) {
      // RETURNING ERROR RESPONSE
      res.status(503).json({
        message: "AI service is not configured. Please contact administrator.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET REQUEST BODY
    const {
      owner,
      repo,
      projectId,
      maxTasks = 10,
      commitCount = 20,
    } = req.body;
    // VALIDATE REQUIRED FIELDS
    if (!owner || !repo) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Repository owner and name are required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // VALIDATE PROJECT ID IF PROVIDED
    if (projectId && !mongoose.Types.ObjectId.isValid(projectId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Invalid Project ID format!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET OCTOKIT INSTANCE
    const { octokit, error } = await getOctokitForUser(userId);
    // IF ERROR, RETURN ERROR RESPONSE
    if (error || !octokit) {
      // RETURNING ERROR RESPONSE
      res.status(error?.status || 500).json({
        message: error?.message || "Error connecting to GitHub.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FETCH RECENT COMMITS
    let commits: any[];
    try {
      // GET REPOSITORY COMMITS
      const { data: commitData } = await octokit.repos.listCommits({
        owner,
        repo,
        per_page: Math.min(commitCount, 50),
      });
      // SET COMMITS
      commits = commitData;
    } catch (error: any) {
      // TOKEN EXPIRED
      if (error.status === 401) {
        // RETURNING ERROR RESPONSE
        res.status(401).json({
          message: "GitHub token has expired. Please reconnect your account.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // REPOSITORY NOT FOUND
      if (error.status === 404) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "Repository not found or you don't have access to it.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // OTHER ERROR
      res.status(500).json({
        message: "Error fetching commits. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // IF NO COMMITS, RETURN ERROR
    if (commits.length === 0) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "No commits found in this repository.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FORMAT COMMITS FOR AI
    const commitMessages = commits
      .map((commit) => `- ${commit.commit.message.split("\n")[0]}`)
      .join("\n");
    // GENERATE TASKS USING GEMINI
    try {
      // CREATE PROMPT
      const prompt = `You are a project management assistant that analyzes commit history and suggests follow-up tasks. Your task is to analyze recent commit messages and generate tasks for:
      - Bug fixes that might be needed
      - Features that seem incomplete
      - Refactoring opportunities
      - Testing requirements
      - Documentation updates
      Rules:
      - Generate between 3 and ${maxTasks} tasks maximum
      - Each task should be specific and actionable
      - Focus on logical next steps based on the commits
      - Assign priority based on urgency (low, medium, high)
      - Return ONLY a valid JSON array of tasks, no other text
      Output format (JSON array only):
      [
        {
          "title": "Task title (max 200 chars)",
          "description": "Detailed description of what needs to be done (max 2000 chars)",
          "priority": "low" | "medium" | "high"
        }
      ]
      Recent Commits: ${commitMessages} Generate follow-up tasks based on these commits:`;
      // GENERATE CONTENT
      const result = await model.generateContent(prompt);
      // GET RESPONSE CONTENT
      const responseContent = result.response.text();
      // PARSE TASKS FROM RESPONSE
      const generatedTasks = parseAIResponse(responseContent);
      // IF NO TASKS GENERATED, RETURN ERROR
      if (generatedTasks.length === 0) {
        // RETURNING ERROR RESPONSE
        res.status(400).json({
          message:
            "Could not generate tasks from commits. Try a different repository.",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // RETURNING SUCCESS RESPONSE
      res.status(200).json({
        message: "Tasks generated successfully from commits!",
        success: true,
        data: {
          tasks: generatedTasks,
          source: "commits",
          repository: `${owner}/${repo}`,
          projectId: projectId || null,
          analyzedCommits: commits.length,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR
      console.error("Error generating tasks from commits:", error);
      // RETURNING ERROR RESPONSE
      res.status(500).json({
        message: "Error generating tasks. Please try again later.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
  }
);

/**
 * SUGGEST NEXT TASKS FOR PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SUGGEST NEXT TASKS ==>
export const suggestNextTasks = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF GEMINI NOT CONFIGURED, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI service is not configured. Please contact administrator.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET PROJECT ID FROM PARAMS
  const projectId = req.params.projectId;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE PROJECT ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid Project ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET MAX TASKS FROM QUERY
  const maxTasks = parseInt(req.query.maxTasks as string) || 5;
  // FIND PROJECT BY ID AND USER ID
  const project = await Project.findOne({
    _id: projectId,
    userId,
    isTrashed: false,
  })
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET EXISTING TASKS FOR PROJECT
  const existingTasks = await Task.find({
    projectId,
    userId,
    isTrashed: false,
  })
    .select("title description status priority")
    .lean()
    .exec();
  // FORMAT EXISTING TASKS FOR AI
  const taskContext =
    existingTasks.length > 0
      ? existingTasks
          .map(
            (task: { title: string; description?: string; status: string }) =>
              `- [${task.status}] ${task.title}${
                task.description
                  ? `: ${task.description.substring(0, 100)}`
                  : ""
              }`
          )
          .join("\n")
      : "No existing tasks";
  // GET GITHUB CONTEXT IF LINKED
  let githubContext = "";
  if (project.githubRepo && project.githubRepo.fullName) {
    // GET OCTOKIT INSTANCE
    const { octokit } = await getOctokitForUser(userId);
    // IF OCTOKIT AVAILABLE, FETCH GITHUB DATA
    if (octokit) {
      try {
        // FETCH RECENT COMMITS AND OPEN ISSUES
        const [commitsResponse, issuesResponse] = await Promise.all([
          octokit.repos.listCommits({
            owner: project.githubRepo.owner,
            repo: project.githubRepo.name,
            per_page: 10,
          }),
          octokit.issues.listForRepo({
            owner: project.githubRepo.owner,
            repo: project.githubRepo.name,
            state: "open",
            per_page: 10,
          }),
        ]);
        // FORMAT COMMITS
        const recentCommits = commitsResponse.data
          .map((c) => `- ${c.commit.message.split("\n")[0]}`)
          .join("\n");
        // FORMAT ISSUES
        const openIssues = issuesResponse.data
          .filter((i) => !i.pull_request)
          .map((i) => `- #${i.number}: ${i.title}`)
          .join("\n");
        // SET GITHUB CONTEXT
        githubContext = `\n\nGitHub Repository: ${
          project.githubRepo.fullName
        }\n\nRecent Commits:\n${recentCommits || "None"}\n\nOpen Issues:\n${
          openIssues || "None"
        }`;
      } catch (error) {
        // IGNORE GITHUB ERRORS
      }
    }
  }
  // GENERATE TASKS USING GEMINI
  try {
    // CREATE PROMPT
    const prompt = `You are a project management assistant that suggests next tasks for a project based on its current state. Your task is to analyze the project context and suggest logical next tasks that would help move the project forward.
    Rules:
    - Generate between 3 and ${maxTasks} tasks maximum
    - Each task should be specific and actionable
    - Consider existing tasks to avoid duplicates
    - Suggest tasks that complement existing work
    - Assign priority based on importance (low, medium, high)
    - Return ONLY a valid JSON array of tasks, no other text
    Output format (JSON array only):
    [
      {
        "title": "Task title (max 200 chars)",
        "description": "Detailed description of what needs to be done (max 2000 chars)",
        "priority": "low" | "medium" | "high"
      }
    ]
    Project: ${project.title}
    Description: ${project.description || "No description"}
    Status: ${project.status}
    Priority: ${project.priority}
    Existing Tasks: ${taskContext}${githubContext} Based on this context, suggest the next tasks for this project:`;
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE CONTENT
    const responseContent = result.response.text();
    // PARSE TASKS FROM RESPONSE
    const suggestedTasks = parseAIResponse(responseContent);
    // IF NO TASKS GENERATED, RETURN ERROR
    if (suggestedTasks.length === 0) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Could not generate task suggestions. Please try again.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Task suggestions generated successfully!",
      success: true,
      data: {
        tasks: suggestedTasks,
        projectId,
        projectTitle: project.title,
        existingTaskCount: existingTasks.length,
        hasGitHubContext: !!githubContext,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error suggesting tasks:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error generating suggestions. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * SUMMARIZE REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SUMMARIZE REPOSITORY ==>
export const summarizeRepository = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF GEMINI NOT CONFIGURED, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI service is not configured. Please contact administrator.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET REQUEST BODY
  const { owner, repo } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Repository owner and name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 500).json({
      message: error?.message || "Error connecting to GitHub.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH REPOSITORY DATA
  let repoData: any;
  let readmeContent: string | null = null;
  let languages: Record<string, number> = {};
  try {
    // GET REPOSITORY DETAILS
    const [repoResponse, languagesResponse] = await Promise.all([
      octokit.repos.get({ owner, repo }),
      octokit.repos.listLanguages({ owner, repo }),
    ]);
    // SET REPO DATA
    repoData = repoResponse.data;
    languages = languagesResponse.data;
    // TRY TO GET README
    try {
      const { data: readme } = await octokit.repos.getReadme({
        owner,
        repo,
        mediaType: { format: "raw" },
      });
      readmeContent = (readme as unknown as string).substring(0, 4000);
    } catch (error) {
      // README NOT FOUND - IGNORE
    }
  } catch (error: any) {
    // TOKEN EXPIRED
    if (error.status === 401) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching repository data. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FORMAT LANGUAGES
  const languageList = Object.keys(languages).join(", ") || "Unknown";
  // GENERATE SUMMARY USING GEMINI
  try {
    // CREATE PROMPT
    const prompt = `You are a technical analyst that summarizes GitHub repositories. Your task is to provide a concise, informative summary of the repository.
    Include in your summary:
    - What the project does
    - Key technologies used
    - Project maturity/activity level
    - Notable features or characteristics
    Return ONLY a JSON object with the following format, no other text:
    {
      "summary": "A 2-3 sentence overview of the project",
      "purpose": "The main purpose or goal of the project",
      "technologies": ["tech1", "tech2"],
      "projectType": "web app | library | cli tool | api | mobile app | other",
      "complexity": "simple | moderate | complex",
      "keyFeatures": ["feature1", "feature2", "feature3"]
    }
    Repository: ${repoData.full_name}
    Description: ${repoData.description || "No description"}
    Languages: ${languageList}
    Stars: ${repoData.stargazers_count}
    Forks: ${repoData.forks_count}
    Open Issues: ${repoData.open_issues_count}
    Created: ${repoData.created_at}
    Last Updated: ${repoData.updated_at}
    Topics: ${repoData.topics?.join(", ") || "None"}
    ${
      readmeContent
        ? `README (excerpt):\n${readmeContent}`
        : "No README available"
    }
    Provide a summary of this repository:`;
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE CONTENT
    const responseContent = result.response.text();
    // TRY TO PARSE JSON
    let summary: any;
    try {
      // FIND JSON OBJECT IN RESPONSE
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summary = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (error) {
      // USE DEFAULT SUMMARY
      summary = {
        summary: repoData.description || "No summary available",
        purpose: "Unknown",
        technologies: Object.keys(languages).slice(0, 5),
        projectType: "other",
        complexity: "moderate",
        keyFeatures: [],
      };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository summary generated successfully!",
      success: true,
      data: {
        repository: {
          fullName: repoData.full_name,
          htmlUrl: repoData.html_url,
          stars: repoData.stargazers_count,
          forks: repoData.forks_count,
          openIssues: repoData.open_issues_count,
        },
        summary,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error summarizing repository:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error generating summary. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * SAVE GENERATED TASKS TO PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SAVE GENERATED TASKS ==>
export const saveGeneratedTasks = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET REQUEST BODY
  const { projectId, tasks } = req.body;
  // VALIDATE PROJECT ID
  if (!projectId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Project ID is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE PROJECT ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid Project ID format!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE TASKS ARRAY
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Tasks array is required and must not be empty!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VERIFY PROJECT EXISTS AND BELONGS TO USER
  const project = await Project.findOne({
    _id: projectId,
    userId,
    isTrashed: false,
  })
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // PREPARE TASKS FOR INSERTION
  const tasksToInsert = tasks.map((task: GeneratedTask) => ({
    title: task.title.substring(0, 200),
    description: (task.description || "").substring(0, 2000),
    priority: ["low", "medium", "high"].includes(task.priority)
      ? task.priority
      : "medium",
    status: "to do",
    projectId,
    userId,
    dueDate: null,
    isTrashed: false,
  }));
  // INSERT TASKS
  try {
    // INSERT MANY TASKS
    const insertedTasks = await Task.insertMany(tasksToInsert);
    // TASK WORD (SINGULAR OR PLURAL)
    const taskWord = insertedTasks.length === 1 ? "task" : "tasks";
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: `${insertedTasks.length} ${taskWord} created successfully!`,
      success: true,
      data: {
        savedCount: insertedTasks.length,
        projectId,
        tasks: insertedTasks,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error saving tasks:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error saving tasks. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * AI CATEGORIZE REPOSITORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== AI CATEGORIZE REPOSITORY ==>
export const aiCategorizeRepository = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF AI IS CONFIGURED
  const model = getGeminiModel();
  // IF MODEL NOT CONFIGURED, RETURN ERROR RESPONSE
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI service is not configured.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 400).json({
      message: error?.message || "GitHub is not connected.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH REPOSITORY DATA
  try {
    // GET REPOSITORY DETAILS
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    // GET REPOSITORY LANGUAGES
    const { data: languages } = await octokit.repos.listLanguages({
      owner,
      repo,
    });
    // TRY TO GET README
    let readme = "";
    try {
      // GET README DATA
      const { data: readmeData } = await octokit.repos.getReadme({
        owner,
        repo,
        mediaType: { format: "raw" },
      });
      // SET README CONTENT
      readme = (readmeData as unknown as string).substring(0, 3000);
    } catch {
      // NO README AVAILABLE
      readme = "No README available";
    }
    // GET TOPICS
    const topics = repoData.topics || [];
    // BUILD LANGUAGE LIST
    const languageList = Object.keys(languages).slice(0, 10).join(", ");
    // BUILD AI PROMPT
    const prompt = `Analyze this GitHub repository and provide categorization:
    - The category of the project (frontend, backend, fullstack, library, cli, mobile, devops, data-science, machine-learning, documentation, other)
    - The subcategory of the project (more specific category like: react-app, express-api, npm-package, etc)
    - The main technologies used
    - The frameworks used
    - The purpose of the project
    - The project type (application, library, tool, template, learning, documentation)
    - The complexity of the project (beginner, intermediate, advanced)
    - The suggested tags for the project
    Repository: ${repoData.full_name}
    Description: ${repoData.description || "No description"}
    Languages: ${languageList || "Unknown"}
    Topics: ${topics.join(", ") || "None"}
    Stars: ${repoData.stargazers_count}
    Is Fork: ${repoData.fork}
    README (first 3000 chars): ${readme}
    Provide a JSON response with the following structure (no markdown, just pure JSON):
    {
      "category": "One of: frontend, backend, fullstack, library, cli, mobile, devops, data-science, machine-learning, documentation, other",
      "subcategory": "More specific category like: react-app, express-api, npm-package, etc",
      "techStack": ["Array of main technologies detected"],
      "frameworks": ["Array of frameworks detected"],
      "purpose": "Brief one-sentence description of what this project does",
      "projectType": "One of: application, library, tool, template, learning, documentation",
      "complexity": "One of: beginner, intermediate, advanced",
      "suggestedTags": ["Array of 3-5 suggested tags for this repo"]
    }`;
    // GENERATE CONTENT
    const result = await model.generateContent(prompt);
    // GET RESPONSE CONTENT
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // PARSE JSON FROM RESPONSE
    let categorization;
    try {
      // TRY TO PARSE JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      // IF JSON FOUND, PARSE IT
      if (jsonMatch) {
        // PARSE JSON
        categorization = JSON.parse(jsonMatch[0]);
      } else {
        // NO JSON FOUND, THROW ERROR
        throw new Error("No JSON found in response");
      }
    } catch {
      // DEFAULT CATEGORIZATION IF PARSING FAILS
      categorization = {
        category: repoData.language?.toLowerCase() || "other",
        subcategory: "general",
        techStack: Object.keys(languages).slice(0, 5),
        frameworks: [],
        purpose: repoData.description || "Repository purpose not determined",
        projectType: "application",
        complexity: "intermediate",
        suggestedTags: topics.slice(0, 5),
      };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository categorized successfully!",
      success: true,
      data: {
        repository: {
          fullName: repoData.full_name,
          description: repoData.description,
          language: repoData.language,
          topics: repoData.topics,
        },
        categorization,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error categorizing repository:", error);
    // TOKEN EXPIRED
    if (error.status === 401) {
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      return;
    }
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      return;
    }
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error categorizing repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * AI REPOSITORY HEALTH SCORE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== AI REPOSITORY HEALTH SCORE ==>
export const aiRepositoryHealthScore = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OWNER AND REPO FROM PARAMS
  const { owner, repo } = req.params;
  // VALIDATE OWNER AND REPO
  if (!owner || !repo) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Owner and repository name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF AI IS CONFIGURED
  const model = getGeminiModel();
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI service is not configured.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET OCTOKIT INSTANCE
  const { octokit, error } = await getOctokitForUser(userId);
  // IF ERROR, RETURN ERROR RESPONSE
  if (error || !octokit) {
    // RETURNING ERROR RESPONSE
    res.status(error?.status || 400).json({
      message: error?.message || "GitHub is not connected.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH REPOSITORY DATA
  try {
    // GET REPOSITORY DETAILS
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    // GET RECENT COMMITS (LAST 30)
    let recentCommits = 0;
    let lastCommitDate = null;
    try {
      const { data: commits } = await octokit.repos.listCommits({
        owner,
        repo,
        per_page: 30,
      });
      recentCommits = commits.length;
      lastCommitDate = commits[0]?.commit?.author?.date || null;
    } catch {
      recentCommits = 0;
    }
    // GET OPEN ISSUES COUNT
    const openIssues = repoData.open_issues_count;
    // GET PULL REQUESTS
    let openPRs = 0;
    try {
      const { data: prs } = await octokit.pulls.list({
        owner,
        repo,
        state: "open",
        per_page: 100,
      });
      openPRs = prs.length;
    } catch {
      openPRs = 0;
    }
    // CHECK FOR README
    let hasReadme = false;
    try {
      await octokit.repos.getReadme({ owner, repo });
      hasReadme = true;
    } catch {
      hasReadme = false;
    }
    // CHECK FOR LICENSE
    const hasLicense = repoData.license !== null;
    // CHECK FOR DESCRIPTION
    const hasDescription =
      repoData.description !== null && repoData.description.length > 0;
    // CHECK FOR TOPICS
    const hasTopics = (repoData.topics?.length || 0) > 0;
    // CALCULATE DAYS SINCE LAST UPDATE
    const lastUpdate = new Date(repoData.pushed_at);
    const daysSinceUpdate = Math.floor(
      (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
    );
    // CALCULATE METRICS
    const metrics = {
      // DOCUMENTATION SCORE (0-100)
      documentation: {
        score:
          (hasReadme ? 40 : 0) +
          (hasDescription ? 30 : 0) +
          (hasTopics ? 30 : 0),
        hasReadme,
        hasDescription,
        hasTopics,
      },
      // MAINTENANCE SCORE (0-100)
      maintenance: {
        score: Math.max(0, 100 - daysSinceUpdate * 2),
        daysSinceUpdate,
        lastCommitDate,
        recentCommits,
      },
      // COMMUNITY SCORE (0-100)
      community: {
        score: Math.min(
          100,
          repoData.stargazers_count + repoData.forks_count * 2
        ),
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        watchers: repoData.watchers_count,
      },
      // ISSUES SCORE (0-100) - LOWER OPEN ISSUES = BETTER
      issues: {
        score: Math.max(0, 100 - openIssues * 2),
        openIssues,
        openPRs,
      },
      // BEST PRACTICES SCORE (0-100)
      bestPractices: {
        score:
          (hasLicense ? 50 : 0) +
          (hasReadme ? 25 : 0) +
          (hasDescription ? 25 : 0),
        hasLicense,
        licenseName: repoData.license?.name || null,
      },
    };
    // CALCULATE OVERALL HEALTH SCORE
    const overallScore = Math.round(
      (metrics.documentation.score +
        metrics.maintenance.score +
        metrics.community.score +
        metrics.issues.score +
        metrics.bestPractices.score) /
        5
    );
    // DETERMINE HEALTH GRADE
    let grade: string;
    // IF OVERALL SCORE IS 90 OR HIGHER, GRADE IS A+
    if (overallScore >= 90) grade = "A+";
    // IF OVERALL SCORE IS 80 OR HIGHER, GRADE IS A
    else if (overallScore >= 80) grade = "A";
    // IF OVERALL SCORE IS 70 OR HIGHER, GRADE IS B
    else if (overallScore >= 70) grade = "B";
    // IF OVERALL SCORE IS 60 OR HIGHER, GRADE IS C
    else if (overallScore >= 60) grade = "C";
    // IF OVERALL SCORE IS 50 OR HIGHER, GRADE IS D
    else if (overallScore >= 50) grade = "D";
    // IF OVERALL SCORE IS BELOW 50, GRADE IS F
    else grade = "F";
    // BUILD AI PROMPT FOR SUGGESTIONS
    const prompt = `Based on this repository health analysis, provide 3-5 specific, actionable suggestions to improve the repository:
    Repository: ${repoData.full_name}
    Overall Health Score: ${overallScore}/100 (Grade: ${grade})
    Current Status:
    - Has README: ${hasReadme}
    - Has Description: ${hasDescription}
    - Has License: ${hasLicense}
    - Has Topics: ${hasTopics}
    - Days Since Last Update: ${daysSinceUpdate}
    - Open Issues: ${openIssues}
    - Open Pull Requests: ${openPRs}
    - Stars: ${repoData.stargazers_count}
    - Forks: ${repoData.forks_count}
    Provide a JSON response with suggestions (no markdown, just pure JSON):
    {
      "suggestions": [
        {
          "title": "Short title",
          "description": "Detailed suggestion",
          "priority": "high/medium/low",
          "category": "documentation/maintenance/community/security/other"
        }
      ]
    }`;
    // GET AI SUGGESTIONS
    let suggestions: any[] = [];
    // TRY TO GET AI SUGGESTIONS
    try {
      // GENERATE CONTENT
      const result = await model.generateContent(prompt);
      // GET RESPONSE CONTENT
      const response = result.response;
      // GET RESPONSE TEXT
      const text = response.text();
      // FIND JSON IN RESPONSE
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      // IF JSON FOUND, PARSE IT
      if (jsonMatch) {
        // PARSE JSON
        const parsed = JSON.parse(jsonMatch[0]);
        // SET SUGGESTIONS
        suggestions = parsed.suggestions || [];
      }
    } catch {
      // DEFAULT SUGGESTIONS IF AI FAILS
      suggestions = [];
      // IF README IS NOT PRESENT, ADD SUGGESTION TO ADD README
      if (!hasReadme) {
        suggestions.push({
          title: "Add a README",
          description:
            "Create a comprehensive README.md file to help users understand your project.",
          priority: "high",
          category: "documentation",
        });
      }
      // IF LICENSE IS NOT PRESENT, ADD SUGGESTION TO ADD LICENSE
      if (!hasLicense) {
        suggestions.push({
          title: "Add a License",
          description:
            "Add a license file to clarify how others can use your code.",
          priority: "medium",
          category: "documentation",
        });
      }
      // IF DESCRIPTION IS NOT PRESENT, ADD SUGGESTION TO ADD DESCRIPTION
      if (!hasDescription) {
        suggestions.push({
          title: "Add a Description",
          description:
            "Add a short description to help users discover your repository.",
          priority: "medium",
          category: "documentation",
        });
      }
      // IF DAYS SINCE LAST UPDATE IS GREATER THAN 30, ADD SUGGESTION TO UPDATE REPOSITORY
      if (daysSinceUpdate > 30) {
        suggestions.push({
          title: "Update Repository",
          description:
            "Consider making updates to show the project is actively maintained.",
          priority: "medium",
          category: "maintenance",
        });
      }
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Repository health score calculated successfully!",
      success: true,
      data: {
        repository: {
          fullName: repoData.full_name,
          description: repoData.description,
          language: repoData.language,
        },
        healthScore: {
          overall: overallScore,
          grade,
          metrics,
        },
        suggestions,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error calculating health score:", error);
    // TOKEN EXPIRED
    if (error.status === 401) {
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      return;
    }
    // REPOSITORY NOT FOUND
    if (error.status === 404) {
      res.status(404).json({
        message: "Repository not found or you don't have access to it.",
        success: false,
      });
      return;
    }
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error calculating health score. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * AI CODE EXPLAINER
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== AI CODE EXPLAINER ==>
export const aiCodeExplainer = expressAsyncHandler(async (req, res) => {
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF MODEL NOT AVAILABLE, RETURN ERROR
  if (!model) {
    res.status(503).json({
      message: "AI service is not configured. Please set GEMINI_API_KEY.",
      success: false,
    });
    return;
  }
  // GET CODE AND OPTIONS FROM BODY
  const { code, language, fileName, explainType } = req.body;
  // VALIDATE CODE
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    res.status(400).json({
      message: "Code content is required!",
      success: false,
    });
    return;
  }
  // DETERMINE EXPLAIN TYPE (DEFAULT TO "general")
  const type = explainType || "general";
  // BUILD PROMPT BASED ON EXPLAIN TYPE
  let prompt = "";
  switch (type) {
    case "general":
      prompt = `You are an expert code explainer. Analyze the following ${
        language || "code"
      } file${
        fileName ? ` (${fileName})` : ""
      } and provide a clear, concise explanation.
      CODE: \`\`\`${language || ""}  ${code} \`\`\`
      Provide your response in the following JSON format:
      {
        "summary": "A 1-2 sentence summary of what this code does",
        "purpose": "The main purpose of this code",
        "keyComponents": [
          {
            "name": "Component/Function/Class name",
            "description": "What it does",
            "lineRange": "e.g., lines 1-20"
          }
        ],
        "complexity": "low|medium|high",
        "suggestions": ["Optional improvement suggestions"],
        "dependencies": ["List of imports/dependencies used"],
        "patterns": ["Design patterns or coding patterns used"]
      }
      Return ONLY valid JSON, no additional text.`;
      break;
    case "line-by-line":
      prompt = `You are an expert code explainer. Provide a line-by-line explanation of the following ${
        language || "code"
      } file${fileName ? ` (${fileName})` : ""}.
      CODE: \`\`\`${language || ""} ${code} \`\`\`
      Provide your response in the following JSON format:
      {
        "explanations": [
          {
            "lineNumber": 1,
            "code": "The actual line of code",
            "explanation": "Clear explanation of what this line does"
          }
        ],
        "summary": "Brief overall summary"
      }
      Focus on non-trivial lines. Group related lines together when appropriate.
      Return ONLY valid JSON, no additional text.`;
      break;
    case "function":
      prompt = `You are an expert code explainer. Analyze the functions/methods in the following ${
        language || "code"
      } file${fileName ? ` (${fileName})` : ""}.
      CODE: \`\`\`${language || ""} ${code} \`\`\`
      Provide your response in the following JSON format:
      {
        "functions": [
          {
            "name": "Function name",
            "parameters": [{"name": "param1", "type": "type", "description": "what it's for"}],
            "returnType": "What it returns",
            "purpose": "What this function does",
            "example": "Optional usage example",
            "complexity": "low|medium|high"
          }
        ],
        "relationships": "How functions relate to each other"
      }
      Return ONLY valid JSON, no additional text.`;
      break;
    case "security":
      prompt = `You are a security expert. Analyze the following ${
        language || "code"
      } file${
        fileName ? ` (${fileName})` : ""
      } for potential security issues.   
      CODE: \`\`\`${language || ""} ${code} \`\`\`
      Provide your response in the following JSON format:
      {
        "securityLevel": "low|medium|high|critical",
        "issues": [
          {
            "severity": "low|medium|high|critical",
            "type": "e.g., SQL Injection, XSS, etc.",
            "description": "What the issue is",
            "location": "Where in the code",
            "recommendation": "How to fix it"
          }
        ],
        "goodPractices": ["Security practices already implemented"],
        "recommendations": ["General security recommendations"]
      }
      Return ONLY valid JSON, no additional text.`;
      break;
    case "performance":
      prompt = `You are a performance optimization expert. Analyze the following ${
        language || "code"
      } file${fileName ? ` (${fileName})` : ""} for performance issues.
      CODE: \`\`\`${language || ""} ${code} \`\`\`
      Provide your response in the following JSON format:
      {
        "performanceRating": "poor|fair|good|excellent",
        "issues": [
          {
            "severity": "low|medium|high",
            "type": "e.g., N+1 queries, Memory leak, etc.",
            "description": "What the issue is",
            "location": "Where in the code",
            "recommendation": "How to optimize"
          }
        ],
        "optimizations": [
          {
            "title": "Optimization name",
            "description": "What to optimize",
            "impact": "Expected improvement"
          }
        ],
        "bigO": "Time complexity analysis if applicable"
      }
      Return ONLY valid JSON, no additional text.`;
      break;
    default:
      prompt = `Explain this code: \`\`\`${language || ""}\n${code}\n\`\`\``;
  }
  // TRY TO GENERATE EXPLANATION
  try {
    // GENERATE EXPLANATION
    const result = await model.generateContent(prompt);
    // GET RESPONSE
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // TRY TO PARSE AS JSON
    let explanation;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      explanation = JSON.parse(cleanedText);
    } catch {
      // IF NOT VALID JSON, RETURN AS TEXT
      explanation = { rawExplanation: text };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Code explained successfully!",
      success: true,
      data: {
        type,
        language: language || "unknown",
        fileName: fileName || null,
        explanation,
      },
    });
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error explaining code:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error explaining code. Please try again later.",
      success: false,
    });
    return;
  }
});

/**
 * GENERATE COMMIT MESSAGE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GENERATE COMMIT MESSAGE ==>
export const generateCommitMessage = expressAsyncHandler(async (req, res) => {
  // GET CHANGES FROM REQUEST BODY
  const { changes, type, context } = req.body;
  // VALIDATE CHANGES
  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "File changes are required!",
      success: false,
    });
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF NOT CONFIGURED, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI is not configured. Please set up your GEMINI_API_KEY.",
      success: false,
    });
    return;
  }
  // FORMAT CHANGES FOR PROMPT
  const changesText = changes
    .map(
      (change: {
        filename: string;
        status: string;
        additions?: number;
        deletions?: number;
        patch?: string;
      }) => {
        let text = `File: ${change.filename} (${change.status})`;
        if (change.additions !== undefined || change.deletions !== undefined) {
          text += ` - +${change.additions || 0}/-${
            change.deletions || 0
          } lines`;
        }
        if (change.patch) {
          // LIMIT PATCH TO 500 CHARS TO AVOID TOKEN LIMITS
          const patchPreview = change.patch.slice(0, 500);
          text += `\nChanges:\n${patchPreview}${
            change.patch.length > 500 ? "..." : ""
          }`;
        }
        return text;
      }
    )
    .join("\n\n");
  // BUILD PROMPT BASED ON TYPE
  let promptType = "conventional commit";
  let formatInstructions = "";
  // SET FORMAT BASED ON TYPE
  switch (type) {
    case "conventional":
      promptType = "conventional commit";
      formatInstructions = `Use the format: <type>(<scope>): <subject>
      Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
      Example: feat(auth): add login functionality`;
      break;
    case "descriptive":
      promptType = "descriptive";
      formatInstructions = `Write a clear, descriptive message explaining what changes were made and why.
      Keep it concise but informative.`;
      break;
    case "simple":
      promptType = "simple";
      formatInstructions = `Write a short, simple message summarizing the changes in 5-10 words.`;
      break;
    case "semantic":
      promptType = "semantic version";
      formatInstructions = `Use semantic versioning format: <type>: <description>
      Types: BREAKING CHANGE, feat, fix, docs, style, refactor, perf, test, chore
      Include body if needed for breaking changes.`;
      break;
    default:
      promptType = "conventional commit";
      formatInstructions = `Use the format: <type>(<scope>): <subject>
      Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci`;
  }
  // BUILD PROMPT
  const prompt = `You are an expert at writing ${promptType} messages for Git.  
  ${formatInstructions} 
  ${context ? `Context: ${context}` : ""}
  Based on the following file changes, generate an appropriate commit message:
  ${changesText}
  Respond with a JSON object in this format:
  {
    "subject": "The main commit message (50-72 chars max)",
    "body": "Optional longer description explaining why (can be null)",
    "type": "The commit type (e.g., feat, fix, etc.)",
    "scope": "The scope of changes (can be null)",
    "breaking": false,
    "alternatives": ["2-3 alternative commit message subjects"]
  }
  Return ONLY valid JSON, no additional text.`;
  // TRY TO GENERATE COMMIT MESSAGE
  try {
    // GENERATE COMMIT MESSAGE
    const result = await model.generateContent(prompt);
    // GET RESPONSE
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // PARSE JSON
    let commitMessage;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      commitMessage = JSON.parse(cleanedText);
    } catch {
      // IF NOT VALID JSON, CREATE SIMPLE MESSAGE
      commitMessage = {
        subject: text.trim().split("\n")[0]?.slice(0, 72) || "",
        body: null,
        type: "chore",
        scope: null,
        breaking: false,
        alternatives: [],
      };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commit message generated successfully!",
      success: true,
      data: commitMessage,
    });
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error generating commit message:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error generating commit message. Please try again later.",
      success: false,
    });
    return;
  }
});

/**
 * SUMMARIZE COMMIT HISTORY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SUMMARIZE COMMIT HISTORY ==>
export const summarizeCommitHistory = expressAsyncHandler(async (req, res) => {
  // GET COMMITS FROM REQUEST BODY
  const { commits, includeStats } = req.body;
  // VALIDATE COMMITS
  if (!commits || !Array.isArray(commits) || commits.length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Commits array is required!",
      success: false,
    });
    return;
  }
  // GET GEMINI MODEL
  const model = getGeminiModel();
  // IF NOT CONFIGURED, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI is not configured. Please set up your GEMINI_API_KEY.",
      success: false,
    });
    return;
  }
  // FORMAT COMMITS FOR PROMPT
  const commitsText = commits
    .map(
      (
        commit: {
          sha: string;
          message: string;
          author?: { name?: string; date?: string };
          stats?: { additions?: number; deletions?: number; total?: number };
        },
        index: number
      ) => {
        // BUILD COMMIT TEXT
        let text = `${index + 1}. ${commit.sha.slice(0, 7)} - ${
          commit.message.split("\n")[0]
        }`;
        // CHECK IF AUTHOR NAME EXISTS
        if (commit.author?.name) {
          // ADD AUTHOR NAME TO TEXT
          text += ` (by ${commit.author.name})`;
        }
        // CHECK IF AUTHOR DATE EXISTS
        if (commit.author?.date) {
          // ADD AUTHOR DATE TO TEXT
          text += ` on ${new Date(commit.author.date).toLocaleDateString()}`;
        }
        // CHECK IF INCLUDE STATS AND STATS EXISTS
        if (includeStats && commit.stats) {
          // ADD STATS TO TEXT
          text += ` [+${commit.stats.additions || 0}/-${
            commit.stats.deletions || 0
          }]`;
        }
        // RETURN TEXT
        return text;
      }
    )
    .join("\n");
  // BUILD PROMPT
  const prompt = `You are an expert at analyzing Git commit history.
  Analyze the following ${commits.length} commits and provide a comprehensive summary:
  ${commitsText}
  Respond with a JSON object in this format:
  {
    "summary": "A 2-3 sentence high-level summary of what these commits accomplished",
    "mainChanges": ["List of main features/changes introduced"],
    "categories": {
      "features": ["New features added"],
      "fixes": ["Bug fixes"],
      "refactoring": ["Code improvements"],
      "documentation": ["Doc changes"],
      "other": ["Other changes"]
    },
    "contributors": ["List of unique contributors"],
    "timeline": {
      "startDate": "Date of first commit",
      "endDate": "Date of last commit",
      "duration": "Human readable duration"
    },
    "highlights": ["2-3 most significant commits or changes"],
    "suggestedReleaseNotes": "A concise release notes summary for these changes"
  }
  Return ONLY valid JSON, no additional text.`;
  // TRY TO SUMMARIZE COMMITS
  try {
    // GENERATE SUMMARY
    const result = await model.generateContent(prompt);
    // GET RESPONSE
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // PARSE JSON
    let summary;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      summary = JSON.parse(cleanedText);
    } catch {
      // IF NOT VALID JSON, RETURN RAW TEXT
      summary = { rawSummary: text };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Commit history summarized successfully!",
      success: true,
      data: {
        commitCount: commits.length,
        summary,
      },
    });
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error summarizing commits:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error summarizing commit history. Please try again later.",
      success: false,
    });
    return;
  }
});

/**
 * AI CODE REVIEW FOR PULL REQUEST
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== AI CODE REVIEW ==>
export const aiCodeReview = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET REQUEST DATA
  const { files, pullRequestInfo, reviewType = "comprehensive" } = req.body;
  // VALIDATE INPUT
  if (!files || !Array.isArray(files) || files.length === 0) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Files array is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET AI MODEL
  const model = getGeminiModel();
  // IF MODEL NOT AVAILABLE, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI is not configured. Please set up your GEMINI_API_KEY.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FORMAT FILES FOR PROMPT
  const filesContext = files
    .slice(0, 10)
    .map(
      (file: {
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
      }) => {
        let text = `\n--- File: ${file.filename} (${file.status}) ---`;
        text += `\nChanges: +${file.additions}/-${file.deletions} lines`;
        if (file.patch) {
          // LIMIT PATCH TO 1500 CHARS PER FILE
          const patchPreview = file.patch.slice(0, 1500);
          text += `\n\nDiff:\n\`\`\`\n${patchPreview}${
            file.patch.length > 1500 ? "\n..." : ""
          }\n\`\`\``;
        }
        return text;
      }
    )
    .join("\n");
  // DETERMINE REVIEW TYPE PROMPT
  let reviewTypePrompt = "";
  // SET REVIEW TYPE PROMPT
  switch (reviewType) {
    case "security":
      reviewTypePrompt = `Focus primarily on security issues:
      - SQL injection, XSS, CSRF vulnerabilities
      - Authentication/authorization issues
      - Sensitive data exposure
      - Input validation problems
      - Dependency vulnerabilities`;
      break;
    case "performance":
      reviewTypePrompt = `Focus primarily on performance issues:
      - N+1 queries and database optimization
      - Memory leaks and resource management
      - Unnecessary computations or loops
      - Caching opportunities
      - Algorithm complexity`;
      break;
    case "best-practices":
      reviewTypePrompt = `Focus primarily on code quality and best practices:
      - Code readability and maintainability
      - Design patterns and architecture
      - DRY principle violations
      - SOLID principles
      - Error handling`;
      break;
    default:
      reviewTypePrompt = `Provide a comprehensive review covering:
      - Code quality and readability
      - Potential bugs and logic errors
      - Security concerns
      - Performance issues
      - Best practices and suggestions`;
  }
  // BUILD PROMPT
  const prompt = `You are an expert code reviewer. Analyze the following pull request changes and provide a detailed code review.
  ${
    pullRequestInfo
      ? `\nPull Request: ${pullRequestInfo.title}\nDescription: ${
          pullRequestInfo.body || "No description provided"
        }\nBranches: ${pullRequestInfo.head} → ${pullRequestInfo.base}`
      : ""
  }
  ${reviewTypePrompt}
  Files Changed (${files.length} total, showing first ${Math.min(
    files.length,
    10
  )}):
  ${filesContext}
  Respond with a JSON object in this exact format:
  {
    "summary": "A 2-3 sentence overall assessment of the PR",
    "overallRating": "approve" | "request_changes" | "comment",
    "ratingReason": "Brief explanation of the overall rating",
    "issues": [
      {
        "severity": "critical" | "warning" | "suggestion" | "nitpick",
        "file": "filename where issue was found",
        "line": "approximate line number or range (e.g., '15-20')",
        "title": "Short issue title",
        "description": "Detailed description of the issue",
        "suggestion": "How to fix or improve (can include code snippet)"
      }
    ],
    "positives": ["List of good practices or well-written code found"],
    "suggestions": [
      {
        "category": "refactoring" | "testing" | "documentation" | "performance" | "security",
        "description": "General suggestion for improvement"
      }
    ],
    "testingRecommendations": ["Specific test cases that should be added"],
    "securityNotes": ["Any security-related observations"]
  }
  Be thorough but fair. Highlight both issues and positive aspects.
  Return ONLY valid JSON, no additional text.`;
  // TRY TO GENERATE REVIEW
  try {
    // GENERATE REVIEW
    const result = await model.generateContent(prompt);
    // GET RESPONSE
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // PARSE JSON
    let review;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      review = JSON.parse(cleanedText);
    } catch {
      // IF NOT VALID JSON, RETURN RAW TEXT
      review = {
        summary: "Unable to parse review. Please try again.",
        overallRating: "comment",
        ratingReason: "Review generation encountered an issue",
        issues: [],
        positives: [],
        suggestions: [],
        testingRecommendations: [],
        securityNotes: [],
        rawReview: text,
      };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "AI code review generated successfully!",
      success: true,
      data: {
        filesReviewed: Math.min(files.length, 10),
        totalFiles: files.length,
        reviewType,
        review,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error generating AI code review:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error generating AI code review. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * AI ISSUE ANALYZER (AUTO-LABEL, DUPLICATES, SOLUTIONS)
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== AI ISSUE ANALYZER ==>
export const aiIssueAnalyzer = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as any).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET REQUEST DATA
  const {
    issue,
    existingIssues,
    availableLabels,
    analysisType = "full",
  } = req.body;
  // VALIDATE INPUT
  if (!issue || !issue.title) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Issue data with title is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET AI MODEL
  const model = getGeminiModel();
  // IF MODEL NOT AVAILABLE, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI is not configured. Please set up your GEMINI_API_KEY.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // BUILD CONTEXT FOR EXISTING ISSUES
  const existingIssuesContext =
    existingIssues && existingIssues.length > 0
      ? existingIssues
          .slice(0, 20)
          .map(
            (i: {
              number: number;
              title: string;
              labels?: string[];
              state: string;
            }) =>
              `#${i.number}: ${i.title} [${i.state}]${
                i.labels?.length ? ` (${i.labels.join(", ")})` : ""
              }`
          )
          .join("\n")
      : "No existing issues provided";
  // BUILD CONTEXT FOR AVAILABLE LABELS
  const labelsContext =
    availableLabels && availableLabels.length > 0
      ? availableLabels
          .map(
            (l: { name: string; description?: string }) =>
              `- ${l.name}${l.description ? `: ${l.description}` : ""}`
          )
          .join("\n")
      : "bug, enhancement, documentation, question, help wanted, good first issue";
  // BUILD PROMPT BASED ON ANALYSIS TYPE
  let prompt = "";
  // FULL ANALYSIS
  if (analysisType === "full" || analysisType === "labels") {
    prompt += `You are an expert at triaging GitHub issues. Analyze the following issue and provide appropriate labels.
  Available Labels:
  ${labelsContext}
  Issue Title: ${issue.title}
  Issue Body: ${issue.body || "No description provided"}
  `;
  }
  // DUPLICATE DETECTION
  if (analysisType === "full" || analysisType === "duplicates") {
    prompt += `
  Existing Issues in Repository:
  ${existingIssuesContext}
  `;
  }
  // BUILD FINAL PROMPT
  prompt += `Analyze this issue and provide:
  1. Suggested labels (from the available labels list)
  2. Potential duplicate issues (from existing issues, if any seem related)
  3. A suggested solution or next steps
  4. Priority assessment (critical, high, medium, low)
  5. Issue category (bug, feature, question, documentation, other)
  Respond with a JSON object in this exact format:
  {
    "suggestedLabels": ["label1", "label2"],
    "labelReasons": {
      "label1": "Why this label applies"
    },
    "potentialDuplicates": [
      {
        "issueNumber": 123,
        "title": "Similar issue title",
        "similarity": "high" | "medium" | "low",
        "reason": "Why it might be a duplicate"
      }
    ],
    "suggestedSolution": {
      "summary": "Brief summary of suggested approach",
      "steps": ["Step 1", "Step 2"],
      "additionalContext": "Any additional helpful information"
    },
    "priority": "critical" | "high" | "medium" | "low",
    "priorityReason": "Why this priority level",
    "category": "bug" | "feature" | "question" | "documentation" | "other",
    "categoryReason": "Why this category",
    "estimatedEffort": "small" | "medium" | "large",
    "suggestedAssigneeType": "maintainer" | "contributor" | "new-contributor" | null
  }
  Return ONLY valid JSON, no additional text.`;
  // TRY TO GENERATE ANALYSIS
  try {
    // GENERATE ANALYSIS
    const result = await model.generateContent(prompt);
    // GET RESPONSE
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // PARSE JSON
    let analysis;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      analysis = JSON.parse(cleanedText);
    } catch {
      // IF NOT VALID JSON, RETURN DEFAULT
      analysis = {
        suggestedLabels: [],
        labelReasons: {},
        potentialDuplicates: [],
        suggestedSolution: {
          summary: "Unable to analyze. Please review manually.",
          steps: [],
          additionalContext: null,
        },
        priority: "medium",
        priorityReason: "Default priority",
        category: "other",
        categoryReason: "Unable to categorize",
        estimatedEffort: "medium",
        suggestedAssigneeType: null,
        rawAnalysis: text,
      };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Issue analysis completed successfully!",
      success: true,
      data: {
        issueTitle: issue.title,
        analysisType,
        analysis,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error analyzing issue:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error analyzing issue. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * AI GENERATE ISSUE FROM DESCRIPTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== AI GENERATE ISSUE ==>
export const aiGenerateIssue = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as any).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET REQUEST DATA
  const { description, issueType = "bug", context } = req.body;
  // VALIDATE INPUT
  if (!description || typeof description !== "string" || !description.trim()) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Description is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET AI MODEL
  const model = getGeminiModel();
  // IF MODEL NOT AVAILABLE, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI is not configured. Please set up your GEMINI_API_KEY.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // BUILD PROMPT
  const prompt = `You are an expert technical writer helping to create well-structured GitHub issues.
  User Description: ${description}
  Issue Type: ${issueType}
  ${context ? `Additional Context: ${context}` : ""}
  Generate a well-formatted GitHub issue with:
  1. A clear, concise title
  2. A detailed description with proper markdown formatting
  3. Steps to reproduce (if bug)
  4. Expected vs actual behavior (if bug)
  5. Suggested labels
  Respond with a JSON object in this exact format:
  {
    "title": "Clear issue title",
    "body": "Full markdown-formatted issue body with sections",
    "suggestedLabels": ["label1", "label2"],
    "priority": "high" | "medium" | "low",
    "type": "bug" | "feature" | "documentation" | "question"
  }
  Return ONLY valid JSON, no additional text.`;
  // TRY TO GENERATE ISSUE
  try {
    // GENERATE ISSUE
    const result = await model.generateContent(prompt);
    // GET RESPONSE
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // PARSE JSON
    let generatedIssue;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      generatedIssue = JSON.parse(cleanedText);
    } catch {
      // IF NOT VALID JSON, CREATE SIMPLE ISSUE
      generatedIssue = {
        title: description.slice(0, 100),
        body: description,
        suggestedLabels: [],
        priority: "medium",
        type: issueType,
      };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Issue generated successfully!",
      success: true,
      data: generatedIssue,
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error generating issue:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error generating issue. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * SUGGEST BRANCH STRATEGY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== SUGGEST BRANCH STRATEGY ==>
export const suggestBranchStrategy = expressAsyncHandler(async (req, res) => {
  // GET USER ID FROM REQUEST (SET BY `isAuthenticated` MIDDLEWARE)
  const userId = (req as any).id;
  // IF USER ID NOT FOUND, RETURN ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET REQUEST DATA
  const { branches, repoInfo, teamSize, projectType } = req.body;
  // VALIDATE INPUT
  if (!branches || !Array.isArray(branches)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Branches array is required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET AI MODEL
  const model = getGeminiModel();
  // IF MODEL NOT AVAILABLE, RETURN ERROR
  if (!model) {
    // RETURNING ERROR RESPONSE
    res.status(503).json({
      message: "AI is not configured. Please set up your GEMINI_API_KEY.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // BUILD PROMPT
  const prompt = `You are a Git expert and DevOps consultant. Analyze the following repository information and suggest an optimal branching strategy.
  Repository Information:
  - Repository: ${repoInfo?.name || "Unknown"}
  - Default Branch: ${repoInfo?.defaultBranch || "main"}
  - Team Size: ${teamSize || "Unknown"}
  - Project Type: ${projectType || "Unknown"}
  - Current Branches: ${branches
    .map(
      (b: { name: string; protected?: boolean }) =>
        `${b.name}${b.protected ? " (protected)" : ""}`
    )
    .join(", ")}
  Analyze the current branch setup and provide recommendations. Consider:
  1. Git Flow, GitHub Flow, or GitLab Flow based on project needs
  2. Branch naming conventions
  3. Protection rules recommendations
  4. Merge strategies
  5. Release management
  Respond with a JSON object in this exact format:
  {
    "recommendedStrategy": "Name of recommended strategy (e.g., Git Flow, GitHub Flow, Trunk-Based Development)",
    "strategyDescription": "Brief description of why this strategy fits",
    "branchStructure": {
      "mainBranches": ["List of main branches recommended"],
      "supportingBranches": ["List of supporting branch types (feature/, bugfix/, etc.)"]
    },
    "namingConventions": [
      {"type": "feature", "pattern": "feature/<ticket-id>-<description>", "example": "feature/PROJ-123-user-auth"},
      {"type": "bugfix", "pattern": "bugfix/<ticket-id>-<description>", "example": "bugfix/PROJ-456-login-fix"}
    ],
    "protectionRecommendations": [
      {"branch": "main", "rules": ["Require pull request reviews", "Require status checks"]}
    ],
    "mergeStrategy": {
      "recommended": "squash/merge/rebase",
      "reason": "Why this merge strategy is recommended"
    },
    "workflowSteps": [
      "Step 1: Create feature branch from develop",
      "Step 2: Make changes and commit",
      "Step 3: Create pull request"
    ],
    "additionalTips": ["Tip 1", "Tip 2"]
  }
  Return ONLY valid JSON, no additional text.`;
  // TRY TO GENERATE SUGGESTION
  try {
    // GENERATE SUGGESTION
    const result = await model.generateContent(prompt);
    // GET RESPONSE
    const response = result.response;
    // GET RESPONSE TEXT
    const text = response.text();
    // PARSE JSON
    let suggestion;
    // TRY TO PARSE AS JSON
    try {
      // CLEAN UP RESPONSE (REMOVE MARKDOWN CODE BLOCKS IF PRESENT)
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // PARSE AS JSON
      suggestion = JSON.parse(cleanedText);
    } catch {
      // IF NOT VALID JSON, RETURN RAW TEXT
      suggestion = { rawSuggestion: text };
    }
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "Branch strategy suggestion generated successfully!",
      success: true,
      data: {
        currentBranchCount: branches.length,
        suggestion,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error generating branch strategy:", error);
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error generating branch strategy. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

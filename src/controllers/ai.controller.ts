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
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: `${insertedTasks.length} tasks created successfully!`,
      success: true,
      data: {
        createdCount: insertedTasks.length,
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

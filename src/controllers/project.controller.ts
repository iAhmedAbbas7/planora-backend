// <== IMPORTS ==>
import mongoose from "mongoose";
import { Octokit } from "@octokit/rest";
import { Task } from "../models/task.model.js";
import { User } from "../models/user.model.js";
import { Project } from "../models/project.model.js";
import { decryptSecret } from "../utils/encryption.js";
import expressAsyncHandler from "express-async-handler";
import { createNotification } from "./notification.controller.js";

/**
 * GET PROJECT STATISTICS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PROJECT STATISTICS ==>
export const getProjectsStats = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING CURRENT DATE
  const now = new Date();
  // GETTING START OF DAY
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // GETTING END OF DAY
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  // GETTING STATISTICS IN PARALLEL
  const [
    totalCount,
    completedCount,
    inProgressCount,
    toDoCount,
    dueTodayCount,
  ] = await Promise.all([
    Project.countDocuments({ userId, isTrashed: false }).exec(),
    Project.countDocuments({
      userId,
      status: "Completed",
      isTrashed: false,
    }).exec(),
    Project.countDocuments({
      userId,
      status: "In Progress",
      isTrashed: false,
    }).exec(),
    Project.countDocuments({
      userId,
      status: "To Do",
      isTrashed: false,
    }).exec(),
    Project.countDocuments({
      userId,
      dueDate: { $gte: startOfDay, $lt: endOfDay },
      isTrashed: false,
    }).exec(),
  ]);
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      totalCount,
      completedCount,
      inProgressCount,
      pendingCount: toDoCount,
      dueTodayCount,
    },
  });
  return;
});

/**
 * GET WEEKLY SUMMARY
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET WEEKLY SUMMARY ==>
export const getWeeklySummary = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // FINDING ALL PROJECTS FOR USER
  const projects: any[] = await Project.find({ userId, isTrashed: false })
    .lean()
    .exec();
  // COUNTING COMPLETED PROJECTS
  const completedProjects = projects.filter(
    (p: any) => p.status === "Completed"
  ).length;
  // GETTING TARGET PROJECTS (TOTAL PROJECTS)
  const targetProjects = projects.length;
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: {
      completedProjects,
      targetProjects,
    },
  });
  return;
});

/**
 * GET ALL PROJECTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ALL PROJECTS ==>
export const getProjects = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING PROJECTS WITH TASK COUNTS USING AGGREGATION
  const projectsWithTaskCount = await Project.aggregate([
    // MATCHING USER ID AND NOT TRASHED
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        isTrashed: false,
      },
    },
    // LOOKING UP TASKS
    {
      $lookup: {
        from: "tasks",
        localField: "_id",
        foreignField: "projectId",
        as: "tasks",
      },
    },
    // ADDING TASK COUNT FIELDS
    {
      $addFields: {
        totalTasks: { $size: "$tasks" },
        completedTasks: {
          $size: {
            $filter: {
              input: "$tasks",
              cond: { $eq: ["$$this.status", "completed"] },
            },
          },
        },
      },
    },
    // REMOVING TASKS ARRAY FROM RESPONSE
    {
      $project: { tasks: 0 },
    },
  ]).exec();
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: projectsWithTaskCount?.length || 0,
    data: projectsWithTaskCount || [],
  });
  return;
});

/**
 * CREATE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE PROJECT ==>
export const createProject = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // GETTING PROJECT DATA FROM REQUEST BODY
  const { title, description, priority, inChargeName, role, status, dueDate } =
    req.body;
  // VALIDATING REQUIRED FIELDS
  if (!title || !inChargeName || !role) {
    res.status(400).json({
      message: "Title, In Charge Name, and Role are Required!",
      success: false,
    });
    return;
  }
  // CREATING NEW PROJECT
  const project = await Project.create({
    title,
    description: description || "",
    priority: priority || "medium",
    inChargeName,
    role,
    status: status || "To Do",
    dueDate: dueDate || null,
    userId,
  });
  // CREATING NOTIFICATION FOR PROJECT CREATION
  await createNotification(
    userId,
    "project_created",
    "New Project Created",
    `Project "${project.title}" has been created successfully.`,
    project._id.toString(),
    (req as any).app
  );
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Project created successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * GET SINGLE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET SINGLE PROJECT ==>
export const getOneProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // VALIDATING PROJECT ID FORMAT
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    res.status(400).json({
      message: "Invalid Project ID format!",
      success: false,
    });
    return;
  }
  // GETTING PROJECT WITH TASKS USING AGGREGATION
  const projectWithTasks = await Project.aggregate([
    // MATCHING PROJECT ID
    {
      $match: { _id: new mongoose.Types.ObjectId(projectId) },
    },
    // LOOKING UP TASKS
    {
      $lookup: {
        from: "tasks",
        localField: "_id",
        foreignField: "projectId",
        as: "tasks",
      },
    },
    // ADDING TASK COUNT FIELD
    {
      $addFields: {
        totalTasks: { $size: "$tasks" },
      },
    },
    // REMOVING TASKS ARRAY FROM RESPONSE
    {
      $project: { tasks: 0 },
    },
  ]).exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!projectWithTasks || projectWithTasks.length === 0) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    data: projectWithTasks[0],
  });
  return;
});

/**
 * UPDATE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE PROJECT ==>
export const updateProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND UPDATING PROJECT
  const project = await Project.findByIdAndUpdate(projectId, req.body, {
    new: true,
    runValidators: true,
  })
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // CREATING NOTIFICATION FOR PROJECT UPDATE
  await createNotification(
    project.userId.toString(),
    "project_updated",
    "Project Updated",
    `Project "${project.title}" has been updated.`,
    project._id.toString(),
    (req as any).app
  );
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project updated successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * DELETE PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE PROJECT ==>
export const deleteProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING PROJECT BEFORE DELETION
  const project = await Project.findById(projectId).lean().exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // DELETING ALL TASKS ASSOCIATED WITH PROJECT
  await Task.deleteMany({ projectId }).exec();
  // DELETING PROJECT
  await Project.findByIdAndDelete(projectId).exec();
  // CREATING NOTIFICATION FOR PROJECT DELETION
  await createNotification(
    project.userId.toString(),
    "project_deleted",
    "Project Deleted",
    `Project "${project.title}" has been deleted.`,
    project._id.toString(),
    (req as any).app
  );
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project deleted successfully!",
    success: true,
  });
  return;
});

/**
 * MOVE PROJECT TO TRASH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== MOVE PROJECT TO TRASH ==>
export const moveToTrash = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND UPDATING PROJECT
  const project = await Project.findByIdAndUpdate(
    projectId,
    { isTrashed: true, deletedOn: new Date() },
    { new: true }
  )
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project moved to trash successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * RESTORE PROJECT FROM TRASH
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== RESTORE PROJECT FROM TRASH ==>
export const restoreProject = expressAsyncHandler(async (req, res) => {
  // GETTING PROJECT ID FROM REQUEST PARAMS
  const projectId = req.params.id;
  // IF PROJECT ID NOT PROVIDED, RETURN 400 ERROR
  if (!projectId) {
    res.status(400).json({
      message: "Project ID is Required!",
      success: false,
    });
    return;
  }
  // FINDING AND UPDATING PROJECT
  const project = await Project.findByIdAndUpdate(
    projectId,
    { isTrashed: false, deletedOn: null },
    { new: true }
  )
    .lean()
    .exec();
  // IF PROJECT NOT FOUND, RETURN 404 ERROR
  if (!project) {
    res.status(404).json({
      message: "Project not found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    message: "Project restored successfully!",
    success: true,
    data: project,
  });
  return;
});

/**
 * GET TRASHED PROJECTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET TRASHED PROJECTS ==>
export const getTrashedProjects = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as any).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    return;
  }
  // FINDING TRASHED PROJECTS
  const trashedProjects = await Project.find({
    userId,
    isTrashed: true,
  })
    .sort({ deletedOn: -1 })
    .lean()
    .exec();
  // IF NO TRASHED PROJECTS FOUND, RETURN 404 ERROR
  if (!trashedProjects || trashedProjects.length === 0) {
    res.status(404).json({
      message: "No trashed projects found!",
      success: false,
    });
    return;
  }
  // RETURNING RESPONSE
  res.status(200).json({
    success: true,
    count: trashedProjects.length,
    data: trashedProjects,
  });
  return;
});

/**
 * LINK GITHUB REPOSITORY TO PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== LINK GITHUB REPOSITORY TO PROJECT ==>
export const linkGitHubRepo = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
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
  // GETTING PROJECT ID FROM PARAMS
  const projectId = req.params.id;
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
  // GETTING GITHUB REPO DATA FROM REQUEST BODY
  const { owner, name, fullName, repoId, htmlUrl } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!owner || !name) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Repository owner and name are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND PROJECT BY ID AND USER ID
  const project = await Project.findOne({
    _id: projectId,
    userId,
    isTrashed: false,
  }).exec();
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
  // CHECK IF PROJECT ALREADY HAS A LINKED REPO
  if (project.githubRepo && project.githubRepo.fullName) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Project already has a linked GitHub repository. Please unlink it first.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER HAS GITHUB CONNECTED
  const user = await User.findById(userId)
    .select("+githubAccessToken githubUsername")
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
  if (!user.githubAccessToken || !user.githubUsername) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "GitHub is not connected to your account. Please connect GitHub first.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VERIFY USER HAS ACCESS TO THE REPOSITORY
  let decryptedToken: string;
  try {
    // DECRYPTING ACCESS TOKEN
    decryptedToken = decryptSecret(user.githubAccessToken);
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error processing GitHub token. Please reconnect your account.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CREATE OCTOKIT INSTANCE
  const octokit = new Octokit({ auth: decryptedToken });
  // VERIFY REPOSITORY EXISTS AND USER HAS ACCESS
  try {
    // GET REPOSITORY DETAILS
    const { data: repository } = await octokit.repos.get({
      owner,
      repo: name,
    });
    // UPDATE PROJECT WITH GITHUB REPO DATA
    project.githubRepo = {
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name,
      repoId: repository.id,
      htmlUrl: repository.html_url,
      linkedAt: new Date(),
    };
    // SAVE PROJECT
    await project.save();
    // RETURNING SUCCESS RESPONSE
    res.status(200).json({
      message: "GitHub repository linked successfully!",
      success: true,
      data: {
        projectId: project._id,
        githubRepo: project.githubRepo,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // REPOSITORY NOT FOUND OR NO ACCESS
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
      message: "Error linking GitHub repository. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

/**
 * UNLINK GITHUB REPOSITORY FROM PROJECT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UNLINK GITHUB REPOSITORY FROM PROJECT ==>
export const unlinkGitHubRepo = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
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
  // GETTING PROJECT ID FROM PARAMS
  const projectId = req.params.id;
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
  // FIND PROJECT BY ID AND USER ID
  const project = await Project.findOne({
    _id: projectId,
    userId,
    isTrashed: false,
  }).exec();
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
  // CHECK IF PROJECT HAS A LINKED REPO
  if (!project.githubRepo || !project.githubRepo.fullName) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Project does not have a linked GitHub repository.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // STORE OLD REPO INFO FOR RESPONSE
  const unlinkedRepo = { ...project.githubRepo };
  // CLEAR GITHUB REPO DATA
  project.githubRepo = {
    owner: null as unknown as string,
    name: null as unknown as string,
    fullName: null as unknown as string,
    repoId: null as unknown as number,
    htmlUrl: null as unknown as string,
    linkedAt: null as unknown as Date,
  };
  // SAVE PROJECT
  await project.save();
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message: "GitHub repository unlinked successfully!",
    success: true,
    data: {
      projectId: project._id,
      unlinkedRepo,
    },
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET PROJECT GITHUB DATA
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PROJECT GITHUB DATA ==>
export const getProjectGitHubData = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
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
  // GETTING PROJECT ID FROM PARAMS
  const projectId = req.params.id;
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
  // CHECK IF PROJECT HAS A LINKED REPO
  if (!project.githubRepo || !project.githubRepo.fullName) {
    // RETURNING SUCCESS RESPONSE WITH NO GITHUB DATA
    res.status(200).json({
      message: "Project does not have a linked GitHub repository.",
      success: true,
      data: {
        isLinked: false,
        githubRepo: null,
        repoData: null,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CHECK IF USER HAS GITHUB CONNECTED
  const user = await User.findById(userId)
    .select("+githubAccessToken githubUsername")
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
  if (!user.githubAccessToken || !user.githubUsername) {
    // RETURNING SUCCESS RESPONSE WITH BASIC GITHUB DATA
    res.status(200).json({
      message: "GitHub repository is linked but GitHub is not connected.",
      success: true,
      data: {
        isLinked: true,
        githubRepo: project.githubRepo,
        repoData: null,
        requiresGitHubConnection: true,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DECRYPT ACCESS TOKEN
  let decryptedToken: string;
  try {
    // DECRYPTING ACCESS TOKEN
    decryptedToken = decryptSecret(user.githubAccessToken);
  } catch (error) {
    // RETURNING ERROR RESPONSE
    res.status(500).json({
      message: "Error processing GitHub token. Please reconnect your account.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CREATE OCTOKIT INSTANCE
  const octokit = new Octokit({ auth: decryptedToken });
  // FETCH REPOSITORY DATA
  try {
    // GET REPOSITORY DETAILS
    const [repoResponse, commitsResponse, issuesResponse, pullsResponse] =
      await Promise.all([
        octokit.repos.get({
          owner: project.githubRepo.owner,
          repo: project.githubRepo.name,
        }),
        octokit.repos.listCommits({
          owner: project.githubRepo.owner,
          repo: project.githubRepo.name,
          per_page: 5,
        }),
        octokit.issues.listForRepo({
          owner: project.githubRepo.owner,
          repo: project.githubRepo.name,
          state: "open",
          per_page: 5,
        }),
        octokit.pulls.list({
          owner: project.githubRepo.owner,
          repo: project.githubRepo.name,
          state: "open",
          per_page: 5,
        }),
      ]);
    // MAP RECENT COMMITS
    const recentCommits = commitsResponse.data.map((commit) => ({
      sha: commit.sha.substring(0, 7),
      message: commit.commit.message.split("\n")[0],
      author: commit.commit.author?.name,
      date: commit.commit.author?.date,
      htmlUrl: commit.html_url,
    }));
    // MAP OPEN ISSUES (FILTER OUT PULL REQUESTS)
    const openIssues = issuesResponse.data
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        createdAt: issue.created_at,
        htmlUrl: issue.html_url,
      }));
    // MAP OPEN PULL REQUESTS
    const openPullRequests = pullsResponse.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft,
      createdAt: pr.created_at,
      htmlUrl: pr.html_url,
    }));
    // RETURNING SUCCESS RESPONSE WITH GITHUB DATA
    res.status(200).json({
      message: "Project GitHub data retrieved successfully!",
      success: true,
      data: {
        isLinked: true,
        githubRepo: project.githubRepo,
        repoData: {
          name: repoResponse.data.name,
          fullName: repoResponse.data.full_name,
          description: repoResponse.data.description,
          language: repoResponse.data.language,
          stargazersCount: repoResponse.data.stargazers_count,
          forksCount: repoResponse.data.forks_count,
          openIssuesCount: repoResponse.data.open_issues_count,
          defaultBranch: repoResponse.data.default_branch,
          htmlUrl: repoResponse.data.html_url,
          updatedAt: repoResponse.data.updated_at,
          pushedAt: repoResponse.data.pushed_at,
        },
        recentCommits,
        openIssues,
        openPullRequests,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  } catch (error: any) {
    // TOKEN IS INVALID OR EXPIRED
    if (error.status === 401) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "GitHub token has expired. Please reconnect your account.",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // REPOSITORY NOT FOUND OR NO ACCESS
    if (error.status === 404) {
      // RETURNING SUCCESS RESPONSE WITH BASIC INFO
      res.status(200).json({
        message: "Linked repository not found or access revoked.",
        success: true,
        data: {
          isLinked: true,
          githubRepo: project.githubRepo,
          repoData: null,
          accessRevoked: true,
        },
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // OTHER ERROR
    res.status(500).json({
      message: "Error fetching GitHub data. Please try again later.",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
});

// <== IMPORTS ==>
import mongoose from "mongoose";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";
import { ProjectTemplate } from "../models/projectTemplate.model.js";

/**
 * GET ALL PROJECT TEMPLATES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ALL PROJECT TEMPLATES ==>
export const getProjectTemplates = expressAsyncHandler(async (req, res) => {
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
  // GET QUERY PARAMS
  const { category, search } = req.query;
  // BUILD QUERY
  const query: any = {
    $or: [{ isSystem: true }, { createdBy: userId }, { isPublic: true }],
  };
  // ADD CATEGORY FILTER IF PROVIDED
  if (category && category !== "all") {
    // ADD CATEGORY TO QUERY
    query.category = category;
  }
  // ADD SEARCH FILTER IF PROVIDED
  if (search) {
    // ADD SEARCH TO QUERY
    query.$text = { $search: search as string };
  }
  // FETCH TEMPLATES
  const templates = await ProjectTemplate.find(query)
    .sort({ isSystem: -1, usageCount: -1, createdAt: -1 })
    .lean()
    .exec();
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message: "Templates fetched successfully!",
    success: true,
    data: templates,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET SINGLE PROJECT TEMPLATE BY ID
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET SINGLE PROJECT TEMPLATE ==>
export const getProjectTemplate = expressAsyncHandler(async (req, res) => {
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
  // GET TEMPLATE ID FROM PARAMS
  const { id } = req.params;
  // VALIDATE TEMPLATE ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid template ID!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FETCH TEMPLATE
  const template = await ProjectTemplate.findOne({
    _id: id,
    $or: [{ isSystem: true }, { createdBy: userId }, { isPublic: true }],
  })
    .lean()
    .exec();
  // IF TEMPLATE NOT FOUND
  if (!template) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Template not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message: "Template fetched successfully!",
    success: true,
    data: template,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * CREATE A NEW PROJECT TEMPLATE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE PROJECT TEMPLATE ==>
export const createProjectTemplate = expressAsyncHandler(async (req, res) => {
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
  // GET TEMPLATE DATA FROM BODY
  const {
    name,
    description,
    category,
    icon,
    color,
    tasks,
    isPublic,
    tags,
    estimatedDuration,
  } = req.body;
  // VALIDATE REQUIRED FIELDS
  if (!name || !category) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Name and category are required!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // CREATE TEMPLATE
  const template = await ProjectTemplate.create({
    name,
    description,
    category,
    icon,
    color,
    tasks: tasks || [],
    isSystem: false,
    createdBy: userId,
    isPublic: isPublic || false,
    tags: tags || [],
    estimatedDuration,
  });
  // RETURNING SUCCESS RESPONSE
  res.status(201).json({
    message: "Template created successfully!",
    success: true,
    data: template,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * UPDATE A PROJECT TEMPLATE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== UPDATE PROJECT TEMPLATE ==>
export const updateProjectTemplate = expressAsyncHandler(async (req, res) => {
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
  // GET TEMPLATE ID FROM PARAMS
  const { id } = req.params;
  // VALIDATE TEMPLATE ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid template ID!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND TEMPLATE
  const template = await ProjectTemplate.findOne({
    _id: id,
    createdBy: userId,
    isSystem: false,
  }).exec();
  // IF TEMPLATE NOT FOUND OR IS SYSTEM
  if (!template) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Template not found or cannot be edited!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GET UPDATE DATA FROM BODY
  const {
    name,
    description,
    category,
    icon,
    color,
    tasks,
    isPublic,
    tags,
    estimatedDuration,
  } = req.body;
  // UPDATE NAME IF PROVIDED
  if (name) template.name = name;
  // UPDATE DESCRIPTION IF PROVIDED
  if (description !== undefined) template.description = description;
  // UPDATE CATEGORY IF PROVIDED
  if (category) template.category = category;
  // UPDATE ICON IF PROVIDED
  if (icon) template.icon = icon;
  // UPDATE COLOR IF PROVIDED
  if (color) template.color = color;
  // UPDATE TASKS IF PROVIDED
  if (tasks) template.tasks = tasks;
  // UPDATE IS PUBLIC IF PROVIDED
  if (isPublic !== undefined) template.isPublic = isPublic;
  if (tags) template.tags = tags;
  // UPDATE ESTIMATED DURATION IF PROVIDED
  if (estimatedDuration !== undefined)
    template.estimatedDuration = estimatedDuration;
  // SAVE TEMPLATE
  await template.save();
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message: "Template updated successfully!",
    success: true,
    data: template,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * DELETE A PROJECT TEMPLATE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== DELETE PROJECT TEMPLATE ==>
export const deleteProjectTemplate = expressAsyncHandler(async (req, res) => {
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
  // GET TEMPLATE ID FROM PARAMS
  const { id } = req.params;
  // VALIDATE TEMPLATE ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid template ID!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // DELETE TEMPLATE (ONLY USER'S OWN TEMPLATES, NOT SYSTEM)
  const result = await ProjectTemplate.deleteOne({
    _id: id,
    createdBy: userId,
    isSystem: false,
  });
  // IF TEMPLATE NOT FOUND OR IS SYSTEM
  if (result.deletedCount === 0) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Template not found or cannot be deleted!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURNING SUCCESS RESPONSE
  res.status(200).json({
    message: "Template deleted successfully!",
    success: true,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * CREATE PROJECT FROM TEMPLATE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE PROJECT FROM TEMPLATE ==>
export const createProjectFromTemplate = expressAsyncHandler(
  async (req, res) => {
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
    // GET TEMPLATE ID FROM PARAMS
    const { id: templateId } = req.params;
    // VALIDATE TEMPLATE ID
    if (!templateId || !mongoose.Types.ObjectId.isValid(templateId)) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Invalid template ID!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET PROJECT DATA FROM BODY
    const {
      title,
      description,
      inChargeName,
      role,
      dueDate,
      priority,
      createTasks = true,
    } = req.body;
    // VALIDATE REQUIRED FIELDS
    if (!title || !inChargeName || !role) {
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Title, inChargeName, and role are required!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // FIND TEMPLATE
    const template = await ProjectTemplate.findOne({
      _id: templateId,
      $or: [{ isSystem: true }, { createdBy: userId }, { isPublic: true }],
    })
      .lean()
      .exec();
    // IF TEMPLATE NOT FOUND
    if (!template) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Template not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // CREATE PROJECT
    const project = await Project.create({
      title,
      description: description || template.description,
      inChargeName,
      role,
      dueDate: dueDate || null,
      priority: priority || "medium",
      status: "To Do",
      userId,
    });
    // INITIALIZE CREATED TASKS ARRAY
    let createdTasks: any[] = [];
    // IF CREATE TASKS IS ENABLED AND TEMPLATE HAS TASKS
    if (createTasks && template.tasks && template.tasks.length > 0) {
      // CALCULATE BASE DATE FOR RELATIVE DUE DATES
      const baseDate = new Date();
      // CREATE TASKS
      const tasksToCreate = template.tasks.map((task) => {
        // CALCULATE DUE DATE IF RELATIVE DATE IS SET
        let taskDueDate = null;
        // IF RELATIVE DUE DATE IS SET, CALCULATE DUE DATE
        if (
          task.relativeDueDate !== null &&
          task.relativeDueDate !== undefined
        ) {
          // CREATE DUE DATE
          taskDueDate = new Date(baseDate);
          // ADD RELATIVE DUE DATE TO BASE DATE
          taskDueDate.setDate(taskDueDate.getDate() + task.relativeDueDate);
        }
        // CREATE TASK
        return {
          title: task.title,
          description: task.description || "",
          priority: task.priority || "medium",
          status: "to do",
          dueDate: taskDueDate,
          projectId: project._id,
          userId,
          isTrashed: false,
        };
      });
      // BULK INSERT TASKS
      createdTasks = await Task.insertMany(tasksToCreate);
    }
    // INCREMENT TEMPLATE USAGE COUNT
    await ProjectTemplate.updateOne(
      { _id: templateId },
      { $inc: { usageCount: 1 } }
    );
    // RETURNING SUCCESS RESPONSE
    res.status(201).json({
      message: "Project created from template successfully!",
      success: true,
      data: {
        project,
        tasksCreated: createdTasks.length,
        templateUsed: template.name,
      },
    });
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * SEED SYSTEM TEMPLATES (CALLED ON SERVER START)
 */
// <== SEED SYSTEM TEMPLATES ==>
export const seedSystemTemplates = async () => {
  try {
    // CHECK IF SYSTEM TEMPLATES ALREADY EXIST
    const existingCount = await ProjectTemplate.countDocuments({
      isSystem: true,
    });
    // IF TEMPLATES ALREADY EXIST, SKIP SEEDING
    if (existingCount > 0) {
      // LOGGING SUCCESS MESSAGE
      console.log(`${existingCount} System Templates Already Exist (^_^)`);
      // RETURNING FROM FUNCTION
      return;
    }
    // SYSTEM TEMPLATES TO SEED
    const systemTemplates = [
      {
        name: "Web Application",
        description:
          "Full-stack web application with frontend, backend, and database",
        category: "Web Development",
        icon: "🌐",
        color: "#3b82f6",
        isSystem: true,
        isPublic: true,
        tags: ["web", "fullstack", "frontend", "backend"],
        estimatedDuration: 30,
        tasks: [
          {
            title: "Project Setup & Architecture",
            description:
              "Set up project structure, configure build tools, and define architecture",
            priority: "high",
            relativeDueDate: 2,
            order: 1,
            phase: "Setup",
          },
          {
            title: "Database Design",
            description: "Design database schema and relationships",
            priority: "high",
            relativeDueDate: 4,
            order: 2,
            phase: "Setup",
          },
          {
            title: "Authentication System",
            description:
              "Implement user authentication (login, register, password reset)",
            priority: "high",
            relativeDueDate: 7,
            order: 3,
            phase: "Core Features",
          },
          {
            title: "API Development",
            description: "Build RESTful API endpoints",
            priority: "high",
            relativeDueDate: 14,
            order: 4,
            phase: "Core Features",
          },
          {
            title: "Frontend UI Components",
            description: "Create reusable UI components",
            priority: "medium",
            relativeDueDate: 14,
            order: 5,
            phase: "Frontend",
          },
          {
            title: "State Management",
            description: "Implement global state management",
            priority: "medium",
            relativeDueDate: 16,
            order: 6,
            phase: "Frontend",
          },
          {
            title: "Testing",
            description: "Write unit and integration tests",
            priority: "medium",
            relativeDueDate: 21,
            order: 7,
            phase: "Quality",
          },
          {
            title: "Deployment Setup",
            description: "Configure CI/CD and deployment pipeline",
            priority: "high",
            relativeDueDate: 25,
            order: 8,
            phase: "Deployment",
          },
          {
            title: "Documentation",
            description: "Write technical and user documentation",
            priority: "low",
            relativeDueDate: 28,
            order: 9,
            phase: "Documentation",
          },
          {
            title: "Launch Preparation",
            description: "Final testing, bug fixes, and launch checklist",
            priority: "high",
            relativeDueDate: 30,
            order: 10,
            phase: "Launch",
          },
        ],
      },
      {
        name: "Mobile App",
        description: "Cross-platform mobile application development",
        category: "Mobile Development",
        icon: "📱",
        color: "#10b981",
        isSystem: true,
        isPublic: true,
        tags: ["mobile", "ios", "android", "react-native"],
        estimatedDuration: 45,
        tasks: [
          {
            title: "Project Setup",
            description:
              "Initialize project, configure development environment",
            priority: "high",
            relativeDueDate: 2,
            order: 1,
            phase: "Setup",
          },
          {
            title: "UI/UX Design Review",
            description: "Review and finalize app designs and user flows",
            priority: "high",
            relativeDueDate: 5,
            order: 2,
            phase: "Design",
          },
          {
            title: "Navigation Structure",
            description: "Implement app navigation and routing",
            priority: "high",
            relativeDueDate: 8,
            order: 3,
            phase: "Core",
          },
          {
            title: "Core Features Development",
            description: "Build main app features and screens",
            priority: "high",
            relativeDueDate: 25,
            order: 4,
            phase: "Development",
          },
          {
            title: "API Integration",
            description: "Connect app to backend services",
            priority: "high",
            relativeDueDate: 30,
            order: 5,
            phase: "Integration",
          },
          {
            title: "Offline Support",
            description: "Implement offline data caching",
            priority: "medium",
            relativeDueDate: 35,
            order: 6,
            phase: "Features",
          },
          {
            title: "Push Notifications",
            description: "Set up push notification system",
            priority: "medium",
            relativeDueDate: 38,
            order: 7,
            phase: "Features",
          },
          {
            title: "Testing & QA",
            description: "Test on multiple devices and OS versions",
            priority: "high",
            relativeDueDate: 42,
            order: 8,
            phase: "Quality",
          },
          {
            title: "App Store Submission",
            description: "Prepare and submit to app stores",
            priority: "high",
            relativeDueDate: 45,
            order: 9,
            phase: "Launch",
          },
        ],
      },
      {
        name: "API/Microservice",
        description: "Backend API or microservice development",
        category: "Backend Development",
        icon: "⚡",
        color: "#f59e0b",
        isSystem: true,
        isPublic: true,
        tags: ["api", "backend", "microservice", "rest"],
        estimatedDuration: 21,
        tasks: [
          {
            title: "API Design & Specification",
            description: "Define API endpoints and OpenAPI/Swagger spec",
            priority: "high",
            relativeDueDate: 3,
            order: 1,
            phase: "Design",
          },
          {
            title: "Database Setup",
            description: "Set up database and ORM",
            priority: "high",
            relativeDueDate: 5,
            order: 2,
            phase: "Setup",
          },
          {
            title: "Authentication & Authorization",
            description: "Implement JWT/OAuth authentication",
            priority: "high",
            relativeDueDate: 8,
            order: 3,
            phase: "Security",
          },
          {
            title: "Core Endpoints",
            description: "Develop main API endpoints",
            priority: "high",
            relativeDueDate: 14,
            order: 4,
            phase: "Development",
          },
          {
            title: "Error Handling & Validation",
            description: "Add input validation and error handling",
            priority: "medium",
            relativeDueDate: 16,
            order: 5,
            phase: "Quality",
          },
          {
            title: "Testing",
            description: "Write API tests",
            priority: "high",
            relativeDueDate: 18,
            order: 6,
            phase: "Testing",
          },
          {
            title: "Documentation",
            description: "Generate API documentation",
            priority: "medium",
            relativeDueDate: 20,
            order: 7,
            phase: "Documentation",
          },
          {
            title: "Deployment",
            description: "Deploy to production",
            priority: "high",
            relativeDueDate: 21,
            order: 8,
            phase: "Deployment",
          },
        ],
      },
      {
        name: "Marketing Campaign",
        description: "Digital marketing campaign planning and execution",
        category: "Marketing",
        icon: "📣",
        color: "#ec4899",
        isSystem: true,
        isPublic: true,
        tags: ["marketing", "campaign", "digital", "social"],
        estimatedDuration: 30,
        tasks: [
          {
            title: "Campaign Strategy",
            description: "Define goals, target audience, and key messages",
            priority: "high",
            relativeDueDate: 3,
            order: 1,
            phase: "Planning",
          },
          {
            title: "Content Calendar",
            description: "Create content schedule and topics",
            priority: "high",
            relativeDueDate: 5,
            order: 2,
            phase: "Planning",
          },
          {
            title: "Creative Assets",
            description: "Design graphics and visuals",
            priority: "high",
            relativeDueDate: 10,
            order: 3,
            phase: "Creative",
          },
          {
            title: "Copy Writing",
            description: "Write campaign copy and messaging",
            priority: "high",
            relativeDueDate: 12,
            order: 4,
            phase: "Creative",
          },
          {
            title: "Ad Setup",
            description: "Set up advertising platforms and campaigns",
            priority: "high",
            relativeDueDate: 15,
            order: 5,
            phase: "Execution",
          },
          {
            title: "Launch Campaign",
            description: "Go live with the campaign",
            priority: "high",
            relativeDueDate: 17,
            order: 6,
            phase: "Execution",
          },
          {
            title: "Monitor Performance",
            description: "Track metrics and adjust as needed",
            priority: "medium",
            relativeDueDate: 25,
            order: 7,
            phase: "Optimization",
          },
          {
            title: "Campaign Report",
            description: "Analyze results and create final report",
            priority: "medium",
            relativeDueDate: 30,
            order: 8,
            phase: "Reporting",
          },
        ],
      },
      {
        name: "Personal Project",
        description: "Simple personal project or side project",
        category: "Personal",
        icon: "🎯",
        color: "#8b5cf6",
        isSystem: true,
        isPublic: true,
        tags: ["personal", "side-project", "hobby"],
        estimatedDuration: 14,
        tasks: [
          {
            title: "Define Scope",
            description: "Clarify what you want to build and why",
            priority: "high",
            relativeDueDate: 1,
            order: 1,
            phase: "Planning",
          },
          {
            title: "Research & Learning",
            description: "Learn necessary skills or technologies",
            priority: "medium",
            relativeDueDate: 3,
            order: 2,
            phase: "Research",
          },
          {
            title: "Initial Build",
            description: "Create the first working version",
            priority: "high",
            relativeDueDate: 10,
            order: 3,
            phase: "Building",
          },
          {
            title: "Polish & Refine",
            description: "Improve and add finishing touches",
            priority: "medium",
            relativeDueDate: 13,
            order: 4,
            phase: "Polish",
          },
          {
            title: "Share/Launch",
            description: "Share your work or deploy it",
            priority: "low",
            relativeDueDate: 14,
            order: 5,
            phase: "Launch",
          },
        ],
      },
    ];
    // INSERT SYSTEM TEMPLATES
    await ProjectTemplate.insertMany(systemTemplates);
    // LOGGING SUCCESS MESSAGE
    console.log(`Seeded ${systemTemplates.length} System Templates (^_^)`);
  } catch (error) {
    // LOGGING ERROR MESSAGE
    console.error("Error seeding system templates:", error);
    // RETURNING FROM FUNCTION
    return;
  }
};

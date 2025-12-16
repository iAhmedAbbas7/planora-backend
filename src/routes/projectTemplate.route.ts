// <== IMPORTS ==>
import {
  getProjectTemplates,
  getProjectTemplate,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate,
  createProjectFromTemplate,
} from "../controllers/projectTemplate.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET ALL TEMPLATES
router.get("/", getProjectTemplates);
// GET SINGLE TEMPLATE
router.get("/:id", getProjectTemplate);
// CREATE TEMPLATE
router.post("/", createProjectTemplate);
// UPDATE TEMPLATE
router.put("/:id", updateProjectTemplate);
// DELETE TEMPLATE
router.delete("/:id", deleteProjectTemplate);
// CREATE PROJECT FROM TEMPLATE
router.post("/:id/create-project", createProjectFromTemplate);

export default router;

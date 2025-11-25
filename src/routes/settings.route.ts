// <== IMPORTS ==>
import {
  getAppearance,
  updateAppearance,
} from "../controllers/settings.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET USER APPEARANCE SETTINGS
router.get("/appearance", getAppearance);
// UPDATE USER APPEARANCE SETTINGS
router.put("/appearance", updateAppearance);

export default router;

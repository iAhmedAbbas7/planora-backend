// <== IMPORTS ==>
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "../controllers/notificationSettings.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET USER NOTIFICATION SETTINGS
router.get("/", getNotificationSettings);
// UPDATE USER NOTIFICATION SETTINGS
router.put("/", updateNotificationSettings);

export default router;

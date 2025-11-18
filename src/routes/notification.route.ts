// <== IMPORTS ==>
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
} from "../controllers/notification.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET USER NOTIFICATIONS
router.get("/", getNotifications);
// MARK NOTIFICATION AS READ
router.put("/:id/read", markAsRead);
// MARK ALL NOTIFICATIONS AS READ
router.put("/read-all", markAllAsRead);
// DELETE NOTIFICATION
router.delete("/:id", deleteNotification);
// GET UNREAD NOTIFICATION COUNT
router.get("/unread-count", getUnreadCount);

export default router;

// <== IMPORTS ==>
import {
  globalSearch,
  getRecentItems,
  getQuickActions,
} from "../controllers/search.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GLOBAL SEARCH
router.get("/", globalSearch);
// GET RECENT ITEMS
router.get("/recent", getRecentItems);
// GET QUICK ACTIONS
router.get("/actions", getQuickActions);

export default router;

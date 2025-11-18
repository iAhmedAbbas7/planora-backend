// <== IMPORTS ==>
import {
  getAllTrashedItems,
  bulkRestore,
  bulkPermanentDelete,
  emptyTrash,
} from "../controllers/trash.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// EMPTY TRASH
router.delete("/empty", emptyTrash);
// GET ALL TRASHED ITEMS
router.get("/", getAllTrashedItems);
// BULK RESTORE ITEMS
router.post("/bulk-restore", bulkRestore);
// BULK PERMANENT DELETE ITEMS
router.post("/bulk-delete", bulkPermanentDelete);

export default router;

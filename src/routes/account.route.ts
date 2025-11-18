// <== IMPORTS ==>
import {
  getAccount,
  updateAccount,
  deleteAccount,
} from "../controllers/account.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET ACCOUNT INFO
router.get("/info", getAccount);
// UPDATE ACCOUNT
router.put("/update", updateAccount);
// DELETE ACCOUNT
router.delete("/delete", deleteAccount);

export default router;

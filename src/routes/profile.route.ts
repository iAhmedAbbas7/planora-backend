// <== IMPORTS ==>
import {
  getProfile,
  updateProfile,
} from "../controllers/profile.controller.js";
import multer from "multer";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== MULTER CONFIGURATION ==>
const upload = multer({ storage: multer.memoryStorage() });

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET USER PROFILE
router.get("/info", getProfile);
// UPDATE USER PROFILE
router.put("/update", upload.single("profilePic"), updateProfile);

export default router;

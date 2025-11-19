// <== IMPORTS ==>
import {
  signup,
  login,
  logout,
  refreshToken,
} from "../controllers/auth.controller.js";
import express from "express";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// USER LOGIN ROUTE
router.post("/login", login);
// USER SIGNUP ROUTE
router.post("/signup", signup);
// USER LOGOUT ROUTE
router.post("/logout", logout);
// REFRESH TOKEN ROUTE
router.post("/refresh", refreshToken);

export default router;

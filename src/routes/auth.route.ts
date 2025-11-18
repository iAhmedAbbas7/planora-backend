// <== IMPORTS ==>
import express from "express";
import { signup, login, logout } from "../controllers/auth.controller.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// USER LOGIN ROUTE
router.post("/login", login);
// USER SIGNUP ROUTE
router.post("/signup", signup);
// USER LOGOUT ROUTE
router.post("/logout", logout);

export default router;

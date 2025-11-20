// <== IMPORTS ==>
import {
  signup,
  login,
  logout,
  refreshToken,
  oauthCallback,
  getCurrentUser,
} from "../controllers/auth.controller.js";
import express from "express";
import passport from "../config/passport.js";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// GOOGLE OAUTH INITIATION
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);
// GOOGLE OAUTH CALLBACK
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/login?error=oauth_failed`
      : "http://localhost:5173/login?error=oauth_failed",
    session: false,
  }),
  oauthCallback
);
// GITHUB OAUTH INITIATION
router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email"],
  })
);
// GITHUB OAUTH CALLBACK
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/login?error=oauth_failed`
      : "http://localhost:5173/login?error=oauth_failed",
    session: false,
  }),
  oauthCallback
);
// USER LOGIN ROUTE
router.post("/login", login);
// USER SIGNUP ROUTE
router.post("/signup", signup);
// USER LOGOUT ROUTE
router.post("/logout", logout);
// REFRESH TOKEN ROUTE
router.post("/refresh", refreshToken);
// GET CURRENT USER ROUTE (REQUIRES AUTHENTICATION)
router.get("/me", isAuthenticated, getCurrentUser);

export default router;

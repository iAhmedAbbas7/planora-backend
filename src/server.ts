// <== IMPORTS ==>
import "./config/env.js";
import path from "path";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import cookieParser from "cookie-parser";
import passport from "./config/passport.js";
import rootRoute from "./routes/root.route.js";
import authRoute from "./routes/auth.route.js";
import taskRoute from "./routes/task.route.js";
import trashRoute from "./routes/trash.route.js";
import corsOptions from "./config/corsOptions.js";
import { logEvents } from "./middleware/logger.js";
import { getDirName } from "./utils/getDirName.js";
import { app, server } from "./services/socket.js";
import profileRoute from "./routes/profile.route.js";
import projectRoute from "./routes/project.route.js";
import accountRoute from "./routes/account.route.js";
import settingsRoute from "./routes/settings.route.js";
import securityRoute from "./routes/security.route.js";
import { initializeCronJobs } from "./jobs/cronJobs.js";
import { errorHandler } from "./middleware/errorHandler.js";
import notificationRoute from "./routes/notification.route.js";
import helmetMiddleware from "./middleware/helmetMiddleware.js";
import { connectDB, disconnectDB } from "./config/dbConnection.js";
import notificationSettingsRoute from "./routes/notificationSettings.route.js";
import { updateSessionActivityMiddleware } from "./middleware/sessionActivity.js";

// <== DATABASE CONNECTION ==>
connectDB();

// <== DIRNAME ==>
const __dirname = getDirName(import.meta.url);

// <== PORT ==>
const PORT = process.env.PORT || 7000;

// <== MIDDLEWARE ==>
// CORS MIDDLEWARE
app.use(cors(corsOptions));
// JSON MIDDLEWARE
app.use(express.json());
// FORM DATA MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
// COOKIE PARSER MIDDLEWARE
app.use(cookieParser());
// SESSION MIDDLEWARE (REQUIRED FOR PASSPORT)
app.use(
  session({
    // <==  SESSION SECRET ==>
    secret: process.env.SESSION_SECRET as string,
    // <== RESAVE SESSION ==>
    resave: false,
    // <== SAVE UNINITIALIZED SESSION ==>
    saveUninitialized: false,
    // <== COOKIE OPTIONS ==>
    cookie: {
      // <== SECURE ==>
      secure: process.env.NODE_ENV === "production",
      // <== HTTP ONLY ==>
      httpOnly: true,
      // <== MAX AGE ==>
      maxAge: 24 * 60 * 60 * 1000,
      // <== SAME SITE ==>
      sameSite: "lax",
    },
  })
);
// PASSPORT MIDDLEWARE
app.use(passport.initialize());
// PASSPORT SESSION MIDDLEWARE
app.use(passport.session());
// HELMET MIDDLEWARE
app.use(helmetMiddleware());
// STATIC MIDDLEWARE
app.use("/", express.static(path.join(__dirname, "..", "public")));

// <== ROUTES MIDDLEWARE ==>
// <== ROOT ROUTE ==>
app.use("/", rootRoute);
// <== AUTH ROUTE ==>
app.use("/api/v1/auth", authRoute);
// <== TASK ROUTE ==>
app.use("/api/v1/tasks", taskRoute);
// <== TRASH ROUTE ==>
app.use("/api/v1/trash", trashRoute);
// <== PROFILE ROUTE ==>
app.use("/api/v1/profile", profileRoute);
// <== ACCOUNT ROUTE ==>
app.use("/api/v1/account", accountRoute);
// <== PROJECT ROUTE ==>
app.use("/api/v1/projects", projectRoute);
// <== SECURITY ROUTE ==>
app.use("/api/v1/security", securityRoute);
// <== SETTINGS ROUTE ==>
app.use("/api/v1/settings", settingsRoute);
// <== NOTIFICATION ROUTE ==>
app.use("/api/v1/notifications", notificationRoute);
// <== NOTIFICATION SETTINGS ROUTE ==>
app.use("/api/v1/notifications/preferences", notificationSettingsRoute);

// <== SESSION ACTIVITY MIDDLEWARE ==>
// UPDATE SESSION ACTIVITY FOR AUTHENTICATED REQUESTS
app.use(updateSessionActivityMiddleware);

// <== MIDDLEWARE 404 RESPONSE ==>
app.all("*", (req, res) => {
  // SETTING STATUS
  res.status(404);
  // RESPONSE HANDLING
  if (req.accepts("html")) {
    // HTML RESPONSE
    res.sendFile(path.join(__dirname, "..", "views", "404.html"));
  } else if (req.accepts("json")) {
    // JSON RESPONSE
    res.json({ message: "404 : Page Not Found" });
  } else {
    // TEXT RESPONSE
    res.type("txt").send("404 : Page Not Found");
  }
});

// <== ERROR HANDLER ==>
app.use(errorHandler);

// <== INITIALIZE CRON JOBS ==>
initializeCronJobs(app);

// <== DATABASE & SERVER CONNECTION LISTENER ==>
mongoose.connection.once("open", () => {
  console.log("Database Connection Established Successfully");
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});

// <== DATABASE CONNECTION ERROR LISTENER ==>
mongoose.connection.on("error", (err) => {
  console.log(err);
  logEvents(
    `${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
    "mongoErrLog.log"
  );
});

// <== SHUTDOWN HANDLERS ==>
// <== SIGINT HANDLER ==>
process.on("SIGINT", async () => {
  // <== LOGGING SHUTDOWN MESSAGE ==>
  console.log("\nShutting Down Gracefully");
  // <== DISCONNECTING DATABASE ==>
  try {
    await disconnectDB();
    // <== CLOSING SERVER ==>
    server.close(() => {
      // <== LOGGING SUCCESS MESSAGE ==>
      console.log("Server Closed Successfully");
      // <== EXITING PROCESS ==>
      process.exit(0);
    });
  } catch (error: any) {
    // <== LOGGING ERROR ==>
    console.error("Error During Shutdown:", error);
    // <== EXITING PROCESS WITH ERROR ==>
    process.exit(1);
  }
});

// <== SIGTERM HANDLER ==>
process.on("SIGTERM", async () => {
  // <== LOGGING SHUTDOWN MESSAGE ==>
  console.log("\nSIGTERM Received. Shutting Down Gracefully");
  // <== DISCONNECTING DATABASE ==>
  try {
    await disconnectDB();
    // <== CLOSING SERVER ==>
    server.close(() => {
      // <== LOGGING SUCCESS MESSAGE ==>
      console.log("Server Closed Successfully");
      // <== EXITING PROCESS ==>
      process.exit(0);
    });
  } catch (error: any) {
    // <== LOGGING ERROR ==>
    console.error("Error During Shutdown:", error);
    // <== EXITING PROCESS WITH ERROR ==>
    process.exit(1);
  }
});

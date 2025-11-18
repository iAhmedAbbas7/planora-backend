// <== IMPORTS ==>
import http from "http";
import express from "express";
import { Server } from "socket.io";

// <== CREATING APP INSTANCE ==>
const app = express();

// <== CREATING SERVER ==>
const server = http.createServer(app);

// <== SOCKET SERVER INSTANCE ==>
const io = new Server(server, {
  // CORS OPTIONS
  cors: {
    // ORIGIN
    origin: ["http://localhost:5173", "http://localhost:5174"],
    // METHODS
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  },
});

// <== STORING IO INSTANCE IN APP ==>
app.set("io", io);

// <== SOCKET.IO CONNECTION HANDLER ==>
io.on("connection", (socket) => {
  // LOGGING USER CONNECTION
  console.log("🟢 User connected:", socket.id);
  // JOIN USER TO THEIR PERSONAL ROOM FOR NOTIFICATIONS
  socket.on("join-user-room", (userId: string) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined their notification room`);
  });
  // HANDLING DISCONNECTION
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// EXPORTING THE APP, SERVER AND IO
export { app, server, io };

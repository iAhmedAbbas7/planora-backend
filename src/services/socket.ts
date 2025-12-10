// <== IMPORTS ==>
import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";

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

/**
 * WORKSPACE PRESENCE STORE
 * Stores Online Members Per Workspace
 * Key: Workspace ID
 * Value: Map of User ID to Presence Data
 * Each Presence Entry Contains:
 * - userId: string
 * - socketId: string
 * - userName: string
 * - userAvatar: string | undefined
 * - status: "online" | "away" | "busy"
 * - currentTask?: string
 * - joinedAt: Date
 */
// <== WORKSPACE PRESENCE STORE ==>
const workspacePresence: Map<
  string,
  Map<
    string,
    {
      // <== USER ID ==>
      userId: string;
      // <== SOCKET ID ==>
      socketId: string;
      // <== USER NAME ==>
      userName: string;
      // <== USER AVATAR ==>
      userAvatar: string | undefined;
      // <== STATUS ==>
      status: "online" | "away" | "busy";
      // <== CURRENT TASK ==>
      currentTask?: string;
      // <== JOINED AT ==>
      joinedAt: Date;
    }
  >
> = new Map();

/**
 * WORKSPACE ACTIVITY STORE
 * Stores Recent Activities Per Workspace
 * Key: Workspace ID
 * Value: Array of Activity Objects (Last 50)
 * Each Activity Object Contains:
 * - id: string
 * - type: "member_joined" | "member_left" | "task_updated" | "repo_activity" | "message"
 * - userId: string
 * - userName: string
 * - userAvatar: string | undefined
 * - data: Record<string, unknown> - Additional Data for the Activity
 * - timestamp: Date (ISO String) - Current Timestamp
 */
// <== WORKSPACE ACTIVITY STORE ==>
const workspaceActivities: Map<
  string,
  Array<{
    // <== ID ==>
    id: string;
    // <== TYPE ==>
    type:
      | "member_joined"
      | "member_left"
      | "task_updated"
      | "repo_activity"
      | "message";
    // <== USER ID ==>
    userId: string;
    // <== USER NAME ==>
    userName: string;
    // <== USER AVATAR ==>
    userAvatar: string | undefined;
    // <== DATA ==>
    data: Record<string, unknown>;
    // <== TIMESTAMP ==>
    timestamp: Date;
  }>
> = new Map();

// <== GET WORKSPACE PRESENCE ==>
const getWorkspacePresence = (workspaceId: string) => {
  // GET PRESENCE MAP FOR WORKSPACE
  const presence = workspacePresence.get(workspaceId);
  // IF NO PRESENCE, RETURN EMPTY ARRAY
  if (!presence) return [];
  // RETURN ARRAY OF MEMBERS
  return Array.from(presence.values());
};

// <== GET WORKSPACE ACTIVITIES ==>
const getWorkspaceActivities = (workspaceId: string) => {
  // RETURN ACTIVITIES OR EMPTY ARRAY
  return workspaceActivities.get(workspaceId) || [];
};

// <== ADD WORKSPACE ACTIVITY ==>
const addWorkspaceActivity = (
  workspaceId: string,
  activity: {
    type:
      | "member_joined"
      | "member_left"
      | "task_updated"
      | "repo_activity"
      | "message";
    userId: string;
    userName: string;
    userAvatar: string | undefined;
    data: Record<string, unknown>;
  }
) => {
  // GET OR CREATE ACTIVITIES ARRAY
  let activities = workspaceActivities.get(workspaceId);
  // IF NO ACTIVITIES IN THE STORE, CREATE EMPTY ARRAY
  if (!activities) {
    // CREATE EMPTY ARRAY
    activities = [];
    // SET ACTIVITIES ARRAY
    workspaceActivities.set(workspaceId, activities);
  }
  // CREATE NEW ACTIVITY
  const newActivity = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...activity,
    timestamp: new Date(),
  };
  // ADD NEW ACTIVITY TO BEGINNING OF ARRAY
  activities.unshift(newActivity);
  // KEEP ONLY LAST 50 ACTIVITIES
  if (activities.length > 50) {
    // REMOVE THE LAST ACTIVITY FROM THE ARRAY
    activities.pop();
  }
  // RETURN THE NEW ACTIVITY
  return newActivity;
};

// <== SOCKET.IO CONNECTION HANDLER ==>
io.on("connection", (socket: Socket) => {
  // LOGGING USER CONNECTION
  console.log("🟢 User Connected:", socket.id);
  // TRACK USER'S WORKSPACE SUBSCRIPTIONS
  const userWorkspaces: Set<string> = new Set();
  // USER DATA
  let userData: {
    userId: string;
    userName: string;
    userAvatar: string | undefined;
  } | null = null;
  // <== JOIN USER ROOM FOR NOTIFICATIONS ==>
  socket.on("join-user-room", (userId: string) => {
    // JOIN USER ROOM
    socket.join(`user-${userId}`);
    // LOG
    console.log(`User ${userId} Joined Their Notification Room`);
  });
  // <== JOIN WORKSPACE ==>
  socket.on(
    "workspace:join",
    (data: {
      workspaceId: string;
      userId: string;
      userName: string;
      userAvatar?: string;
    }) => {
      // DESTRUCTURE DATA
      const { workspaceId, userId, userName, userAvatar } = data;
      // JOIN WORKSPACE ROOM
      socket.join(`workspace-${workspaceId}`);
      // TRACK USER'S WORKSPACE
      userWorkspaces.add(workspaceId);
      // STORE USER DATA
      userData = { userId: userId, userName, userAvatar };
      // GET OR CREATE PRESENCE MAP
      let presence = workspacePresence.get(workspaceId);
      // IF NO PRESENCE IN THE STORE, CREATE EMPTY MAP
      if (!presence) {
        // CREATE EMPTY MAP
        presence = new Map();
        // SET PRESENCE MAP
        workspacePresence.set(workspaceId, presence);
      }
      // ADD USER TO PRESENCE
      presence.set(userId, {
        userId: userId,
        socketId: socket.id,
        userName,
        userAvatar,
        status: "online",
        joinedAt: new Date(),
      });
      // CREATE ACTIVITY
      const activity = addWorkspaceActivity(workspaceId, {
        type: "member_joined",
        userId,
        userName,
        userAvatar,
        data: { action: "joined" },
      });
      // EMIT PRESENCE UPDATE TO WORKSPACE
      io.to(`workspace-${workspaceId}`).emit("presence:update", {
        workspaceId,
        members: getWorkspacePresence(workspaceId),
      });
      // EMIT ACTIVITY TO WORKSPACE
      io.to(`workspace-${workspaceId}`).emit("activity:new", {
        workspaceId,
        activity,
      });
      // LOG
      console.log(`User ${userName} Joined Workspace ${workspaceId}`);
    }
  );
  // <== LEAVE WORKSPACE ==>
  socket.on(
    "workspace:leave",
    (data: { workspaceId: string; userId: string }) => {
      // DESTRUCTURE DATA
      const { workspaceId, userId } = data;
      // LEAVE WORKSPACE ROOM
      socket.leave(`workspace-${workspaceId}`);
      // REMOVE FROM TRACKING
      userWorkspaces.delete(workspaceId);
      // GET PRESENCE MAP
      const presence = workspacePresence.get(workspaceId);
      // IF PRESENCE EXISTS
      if (presence) {
        // GET USER PRESENCE
        const userPresence = presence.get(userId);
        // IF USER PRESENCE EXISTS, REMOVE USER FROM PRESENCE
        presence.delete(userId);
        // IF USER WAS IN PRESENCE, CREATE ACTIVITY
        if (userPresence) {
          // CREATE NEW ACTIVITY
          const activity = addWorkspaceActivity(workspaceId, {
            type: "member_left",
            userId,
            userName: userPresence.userName,
            userAvatar: userPresence.userAvatar,
            data: { action: "left" },
          });
          // EMIT ACTIVITY TO WORKSPACE
          io.to(`workspace-${workspaceId}`).emit("activity:new", {
            workspaceId,
            activity,
          });
        }
        // EMIT PRESENCE UPDATE
        io.to(`workspace-${workspaceId}`).emit("presence:update", {
          workspaceId,
          members: getWorkspacePresence(workspaceId),
        });
      }
      // LOG
      console.log(`User ${userId} Left Workspace ${workspaceId}`);
    }
  );
  // <== UPDATE PRESENCE STATUS ==>
  socket.on(
    "presence:status",
    (data: {
      workspaceId: string;
      userId: string;
      status: "online" | "away" | "busy";
      currentTask?: string;
    }) => {
      // DESTRUCTURE DATA
      const { workspaceId, userId, status, currentTask } = data;
      // GET PRESENCE MAP
      const presence = workspacePresence.get(workspaceId);
      // IF PRESENCE EXISTS
      if (presence) {
        // GET USER PRESENCE
        const userPresence = presence.get(userId);
        // IF USER PRESENCE EXISTS
        if (userPresence) {
          // UPDATE STATUS
          userPresence.status = status;
          // UPDATE CURRENT TASK IF PROVIDED
          if (currentTask !== undefined) {
            // UPDATE CURRENT TASK
            userPresence.currentTask = currentTask;
          }
          // EMIT PRESENCE UPDATE TO WORKSPACE
          io.to(`workspace-${workspaceId}`).emit("presence:update", {
            workspaceId,
            members: getWorkspacePresence(workspaceId),
          });
        }
      }
    }
  );
  // <== GET WORKSPACE STATE ==>
  socket.on(
    "workspace:getState",
    (
      data: { workspaceId: string },
      callback: (response: {
        presence: ReturnType<typeof getWorkspacePresence>;
        activities: ReturnType<typeof getWorkspaceActivities>;
      }) => void
    ) => {
      // DESTRUCTURE DATA
      const { workspaceId } = data;
      // SEND CURRENT STATE
      callback({
        presence: getWorkspacePresence(workspaceId),
        activities: getWorkspaceActivities(workspaceId),
      });
    }
  );
  // <== SEND MESSAGE ==>
  socket.on(
    "workspace:message",
    (data: {
      workspaceId: string;
      userId: string;
      userName: string;
      userAvatar?: string;
      message: string;
    }) => {
      // DESTRUCTURE DATA
      const { workspaceId, userId, userName, userAvatar, message } = data;
      // CREATE NEW ACTIVITY
      const activity = addWorkspaceActivity(workspaceId, {
        type: "message",
        userId,
        userName,
        userAvatar,
        data: { message },
      });
      // EMIT NEW ACTIVITY TO WORKSPACE
      io.to(`workspace-${workspaceId}`).emit("activity:new", {
        workspaceId,
        activity,
      });
    }
  );
  // <== HANDLING DISCONNECTION ==>
  socket.on("disconnect", () => {
    // CLEAN UP USER FROM ALL WORKSPACES
    userWorkspaces.forEach((workspaceId) => {
      // GET PRESENCE MAP
      const presence = workspacePresence.get(workspaceId);
      // IF PRESENCE EXISTS AND USER DATA EXISTS
      if (presence && userData) {
        // FIND AND REMOVE USER BY SOCKET ID
        presence.forEach((member, userId) => {
          // IF MEMBER SOCKET ID EQUALS USER SOCKET ID
          if (member.socketId === socket.id) {
            // GET USER DATA
            const memberData = presence.get(userId);
            // REMOVE FROM PRESENCE
            presence.delete(userId);
            // IF MEMBER DATA EXISTS
            if (memberData) {
              // CREATE NEW ACTIVITY
              const activity = addWorkspaceActivity(workspaceId, {
                type: "member_left",
                userId: userId,
                userName: memberData.userName,
                userAvatar: memberData.userAvatar,
                data: { action: "disconnected" },
              });
              // EMIT NEW ACTIVITY TO WORKSPACE
              io.to(`workspace-${workspaceId}`).emit("activity:new", {
                workspaceId,
                activity,
              });
            }
            // EMIT PRESENCE UPDATE TO WORKSPACE
            io.to(`workspace-${workspaceId}`).emit("presence:update", {
              workspaceId,
              members: getWorkspacePresence(workspaceId),
            });
          }
        });
      }
    });
    // LOG
    console.log("🔴 User Disconnected:", socket.id);
  });
});

// <== BROADCAST WORKSPACE ACTIVITY (FOR USE BY CONTROLLERS) ==>
export const broadcastWorkspaceActivity = (
  workspaceId: string,
  activity: {
    type:
      | "member_joined"
      | "member_left"
      | "task_updated"
      | "repo_activity"
      | "message";
    userId: string;
    userName: string;
    userAvatar: string | undefined;
    data: Record<string, unknown>;
  }
) => {
  // ADD NEW ACTIVITY TO THE STORE
  const newActivity = addWorkspaceActivity(workspaceId, activity);
  // EMIT NEW ACTIVITY TO WORKSPACE
  io.to(`workspace-${workspaceId}`).emit("activity:new", {
    workspaceId,
    activity: newActivity,
  });
};

// <== BROADCAST TASK UPDATE ==>
export const broadcastTaskUpdate = (
  workspaceId: string,
  taskData: {
    taskId: string;
    changes: Record<string, unknown>;
    userId: string;
    userName: string;
    userAvatar: string | undefined;
  }
) => {
  // EMIT TASK UPDATE TO WORKSPACE
  io.to(`workspace-${workspaceId}`).emit("task:updated", {
    workspaceId,
    ...taskData,
  });
  // ALSO ADD AS NEW ACTIVITY TO THE STORE
  broadcastWorkspaceActivity(workspaceId, {
    type: "task_updated",
    userId: taskData.userId,
    userName: taskData.userName,
    userAvatar: taskData.userAvatar,
    data: { taskId: taskData.taskId, changes: taskData.changes },
  });
};

// EXPORTING THE APP, SERVER AND IO INSTANCE
export { app, server, io };

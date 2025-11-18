// <== IMPORTS ==>
import express from "express";
import { Server } from "socket.io";

/**
 * BROADCAST NOTIFICATION VIA SOCKET.IO
 * @param app - Express App Instance
 * @param userId - User ID
 * @param notification - Notification Object
 * @returns void
 */
// <== BROADCAST NOTIFICATION ==>
export const broadcastNotification = (
  app: express.Application,
  userId: string,
  notification: any
): void => {
  // GETTING IO INSTANCE FROM APP
  const ioInstance = app.get("io") as Server | undefined;
  // IF IO INSTANCE AVAILABLE
  if (ioInstance) {
    // EMITTING NOTIFICATION TO USER ROOM
    ioInstance.to(`user-${userId}`).emit("new-notification", notification);
  }
};

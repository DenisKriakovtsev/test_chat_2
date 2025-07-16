import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import onCall from "./socket-events/onCall.js";
import onWebrtcSignal from "./socket-events/onWebrtcSignal.js";
import onHangup from "./socket-events/onHangup.js";
import onChatMessage from "./socket-events/onChatMessage.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

export let io;

app.prepare().then(() => {
  const httpServer = createServer(handler);

  io = new Server(httpServer);

  let onlineUsers = [];
  let activeCalls = [];

  io.on("connection", (socket) => {
    // add user
    socket.on("addNewUser", (clerkUser) => {
      clerkUser &&
        !onlineUsers.some((user) => user?.userId === clerkUser.id) &&
        onlineUsers.push({
          userId: clerkUser.id,
          socketId: socket.id,
          profile: clerkUser,
        });

      // send active users
      io.emit("getUsers", onlineUsers);
    });

    // --- ДОБАВЛЕНО: обработка звонков ---
    socket.on("call", (participants) => {
      // Сохраняем звонок
      activeCalls.push({
        callerId: participants.caller.userId,
        receiverId: participants.receiver.userId,
        callerSocketId: participants.caller.socketId,
        receiverSocketId: participants.receiver.socketId,
      });
      onCall(participants);
    });

    socket.on("hangup", ({ ongoingCall, userHangingupId }) => {
      if (ongoingCall && ongoingCall.participants) {
        const { caller, receiver } = ongoingCall.participants;
        [caller.userId, receiver.userId].forEach(userId => {
          const user = onlineUsers.find(u => u.userId === userId);
          if (user) {
            io.to(user.socketId).emit("hangup");
          }
        });
        // Удаляем звонок из activeCalls
        activeCalls = activeCalls.filter(call =>
          !(
            (call.callerId === caller.userId && call.receiverId === receiver.userId) ||
            (call.callerId === receiver.userId && call.receiverId === caller.userId)
          )
        );
      }
    });

    // --- ДОБАВЛЕНО: сброс звонка при disconnect ---
    socket.on("disconnect", () => {
      // Найти пользователя
      const disconnectedUser = onlineUsers.find((user) => user.socketId === socket.id);
      // Найти звонки с этим пользователем
      const callsToRemove = activeCalls.filter(call => call.callerSocketId === socket.id || call.receiverSocketId === socket.id);
      callsToRemove.forEach(call => {
        // Найти socketId второго участника
        const otherSocketId = call.callerSocketId === socket.id ? call.receiverSocketId : call.callerSocketId;
        if (otherSocketId) {
          io.to(otherSocketId).emit("hangup");
        }
      });
      // Удалить звонки с этим пользователем
      activeCalls = activeCalls.filter(call => call.callerSocketId !== socket.id && call.receiverSocketId !== socket.id);
      // Удалить пользователя из onlineUsers
      onlineUsers = onlineUsers.filter((user) => user.socketId !== socket.id);
      // send active users
      io.emit("getUsers", onlineUsers);
    });

    // other events
    socket.on("webrtcSignal", onWebrtcSignal);
    onChatMessage(io, socket, () => onlineUsers);
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});

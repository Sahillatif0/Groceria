import http from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { isOriginAllowed } from "../config/corsConfig.js";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { attachChatServer, registerChatHandlers, userRoom } from "./chat.events.js";

let ioInstance = null;

const parseCookieHeader = (cookieHeader = "") => {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((accumulator, item) => {
      const [key, ...rest] = item.split("=");
      if (!key) {
        return accumulator;
      }
      accumulator[key] = decodeURIComponent(rest.join("="));
      return accumulator;
    }, {});
};

const authenticateSocket = async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies.token || cookies.sellerToken;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decoded?.id) {
      return next(new Error("Invalid token payload"));
    }

    const [userRecord] = await getDb()
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, decoded.id))
      .limit(1);

    if (!userRecord) {
      return next(new Error("Account not found"));
    }

    if (!userRecord.isActive) {
      return next(new Error("Account inactive"));
    }

    socket.data.user = {
      id: userRecord.id,
      role: userRecord.role,
    };

    next();
  } catch (error) {
    next(new Error("Authentication failed"));
  }
};

export const initSocketServer = (app) => {
  if (ioInstance) {
    return ioInstance;
  }

  const server = app instanceof http.Server ? app : http.createServer(app);

  ioInstance = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin ?? "")) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by the cors"));
        }
      },
      credentials: true,
    },
  });

  ioInstance.use(authenticateSocket);
  attachChatServer(ioInstance);

  ioInstance.on("connection", (socket) => {
    const currentUser = socket.data.user;
    if (currentUser?.id) {
      socket.join(userRoom(currentUser.id));
    }

    registerChatHandlers(socket);

    socket.emit("socket:connected");
  });

  return ioInstance;
};

export const getSocketServer = () => {
  if (!ioInstance) {
    throw new Error("Socket.io server has not been initialised");
  }

  return ioInstance;
};

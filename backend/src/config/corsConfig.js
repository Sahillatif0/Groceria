import cors from "cors";

const BASE_ORIGINS = ["http://localhost:5173", process.env.FRONTEND_URL];

export const getAllowedOrigins = () => BASE_ORIGINS.filter(Boolean);

export const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  const isGithubCodespace = origin.endsWith(".app.github.dev");
  return allowedOrigins.includes(origin) || isGithubCodespace;
};

export const configureCors = () => {
  return cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin ?? "")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by the cors"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept-version",
      "X-Requested-With",
    ],
    exposedHeaders: ["X-Total-Count", "Content-Range"],
    credentials: true,
    preflightContinue: false,
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
};

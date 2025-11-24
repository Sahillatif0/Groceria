import cors from "cors";

export const configureCors = () => {
  const baseOrigins = ["http://localhost:5173", process.env.FRONTEND_URL];

  return cors({
    origin: (origin, callback) => {
      const allowedOrigins = baseOrigins.filter(Boolean);
      const isGithubCodespace =
        origin && origin.endsWith(".app.github.dev");

      if (!origin || allowedOrigins.includes(origin) || isGithubCodespace) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by the cors"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

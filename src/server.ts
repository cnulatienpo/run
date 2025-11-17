import express from "express";
import path from "path";
import experienceRouter from "./routes/experience";
import profilesRouter from "./routes/profiles";
import runStatsRouter from "./routes/runStats";
import passportRouter from "./routes/passport";
import healthRouter from "./routes/health";
import clipsRouter from "./routes/clips";
import usersRouter from "./routes/users";
import { ensureDefaultUser } from "./services/userService";

const app = express();

app.use(express.json());

const rvAppPublicPath = path.resolve(__dirname, "..", "rv-app", "public");
app.use("/rv", express.static(rvAppPublicPath));
app.get("/rv/*", (_req, res) => {
  res.sendFile(path.join(rvAppPublicPath, "index.html"));
});

app.use(async (req, _res, next) => {
  try {
    const headerUserId = req.header("x-user-id");
    if (headerUserId) {
      req.userId = headerUserId;
      return next();
    }

    const defaultUser = await ensureDefaultUser();
    req.userId = defaultUser.id;
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api/health", healthRouter);
app.use("/api/experience", experienceRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/run", runStatsRouter);
app.use("/api/clips", clipsRouter);
app.use("/api/passport", passportRouter);
app.use("/api/users", usersRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RV backend listening on port ${PORT}`);
  });
}

export default app;

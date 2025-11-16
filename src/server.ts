import express from "express";
import experienceRouter from "./routes/experience";
import profilesRouter from "./routes/profiles";
import runStatsRouter from "./routes/runStats";
import passportRouter from "./routes/passport";
import healthRouter from "./routes/health";
import clipsRouter from "./routes/clips";

const app = express();

app.use(express.json());

app.use((req, _res, next) => {
  req.userId = req.header("x-user-id") || "demo-user";
  next();
});

app.use("/api/health", healthRouter);
app.use("/api/experience", experienceRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/run", runStatsRouter);
app.use("/api/clips", clipsRouter);
app.use("/api/passport", passportRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RV backend listening on port ${PORT}`);
  });
}

export default app;

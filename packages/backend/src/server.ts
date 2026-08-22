import "dotenv/config";
import express from "express";
import cors from "cors";
import { walletRouter } from "./routes/wallet.js";
import { transferRouter } from "./routes/transfer.js";
import { monitorRouter } from "./routes/monitor.js";
import { feedbackRouter } from "./routes/feedback.js";
import { startMonitoringJob } from "./jobs/monitor.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", walletRouter);
app.use("/api", transferRouter);
app.use("/api", feedbackRouter);
app.use("/api/monitor", monitorRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

app.listen(PORT, () => {
  console.log(`Sentra API listening on :${PORT}`);
  if (process.env.SENTRA_ENABLE_MONITORING !== "false") {
    startMonitoringJob();
  }
});
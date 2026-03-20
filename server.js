import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./services/env.js";
import apiRouter from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use("/api", apiRouter);
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "coursedna-production-polish-pack",
    env: env.nodeEnv
  });
});

app.get("/", (_req, res) => {
  res.redirect("/preview.html");
});

app.use((err, _req, res, _next) => {
  console.error("[server_error]", err?.message || err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`[coursedna] running on http://localhost:${env.port}`);
});
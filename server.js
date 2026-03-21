import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 🔴 TO MUSI BYĆ
app.use(express.json());

// 🔴 API NA POCZĄTKU
app.use("/api", apiRouter);

// 🔴 STATYCZNE PLIKI
app.use(express.static(__dirname));

// 🔴 TEST
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// 🔴 ROOT
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "preview.html"));
});

// 🔴 fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "preview.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});

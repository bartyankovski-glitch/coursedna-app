import express from "express";
import { createId, db } from "./db.js";
import { generateCovers } from "./openaiImageService.js";
import { recordEvent, getScoreState, getScoreHistory } from "./scoringService.js";

const router = express.Router();

router.post("/covers/generate", express.json(), async (req, res) => {
  const payload = {
    userId: req.body.userId || "user_001",
    authorName: req.body.authorName || "Dariusz Skraskowski",
    bookTitle: req.body.bookTitle || "Jak opanować stres, prowadzić lepsze rozmowy i działać skuteczniej",
    bookSubtitle: req.body.bookSubtitle || "Praktyczna psychologia rozmowy, działania i wpływu",
    primaryCategory: req.body.primaryCategory || "psychologia sprzedaży",
    tone: req.body.tone || "premium",
    emotionLevel: req.body.emotionLevel || "medium",
    language: req.body.language || "pl"
  };

  const result = await generateCovers(payload);
  res.json(result);
});

router.post("/cover-events", express.json(), (req, res) => {
  const event = {
    id: createId("evt"),
    userId: req.body.userId || "user_demo",
    cacheKey: req.body.cacheKey,
    eventType: req.body.eventType,
    createdAt: new Date().toISOString()
  };

  const state = recordEvent(event);
  res.json({ ok: true, state });
});

router.get("/cover-score/:cacheKey", (req, res) => {
  const state = getScoreState(req.params.cacheKey);
  if (!state) return res.status(404).json({ error: "Score state not found" });
  res.json(state);
});

router.get("/cover-score/:cacheKey/history", (req, res) => {
  res.json({
    cacheKey: req.params.cacheKey,
    history: getScoreHistory(req.params.cacheKey)
  });
});

export default router;

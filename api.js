import express from "express";
import { createId, db } from "../services/db.js";
import { generateCovers } from "../services/coverService.js";
import { recordEvent, getScoreState, getScoreHistory } from "../services/scoringService.js";
import { saveBrief, getBriefById, getBriefByCacheKey, processWorkflow, getWorkflowByBriefId, getWorkflowByUserId } from "../services/briefWorkflowService.js";

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
  res.json(await generateCovers(payload));
});

router.post("/cover-events", express.json(), (req, res) => {
  const event = {
    id: createId("evt"),
    userId: req.body.userId || "user_demo",
    sessionId: req.body.sessionId || null,
    cacheKey: req.body.cacheKey,
    eventType: req.body.eventType,
    styleId: req.body.styleId || null,
    pageId: req.body.pageId || null,
    ctaId: req.body.ctaId || null,
    briefId: req.body.briefId || null,
    metadata: req.body.metadata || {},
    createdAt: new Date().toISOString()
  };
  const state = recordEvent(event);
  res.json({ ok: true, eventId: event.id, state });
});

router.get("/cover-score/:cacheKey", (req, res) => {
  const state = getScoreState(req.params.cacheKey);
  if (!state) return res.status(404).json({ error: "Score state not found" });
  res.json(state);
});

router.get("/cover-score/:cacheKey/history", (req, res) => {
  res.json({ cacheKey: req.params.cacheKey, history: getScoreHistory(req.params.cacheKey) });
});

router.post("/briefs", express.json(), (req, res) => {
  const record = saveBrief(req.body || {});
  res.json({ ok: true, briefId: record.briefId, record });
});

router.get("/briefs/:briefId", (req, res) => {
  const brief = getBriefById(req.params.briefId);
  if (!brief) return res.status(404).json({ error: "Brief not found" });
  res.json(brief);
});

router.get("/briefs/by-cache/:cacheKey", (req, res) => {
  const brief = getBriefByCacheKey(req.params.cacheKey);
  if (!brief) return res.status(404).json({ error: "Brief not found" });
  res.json(brief);
});

router.post("/workflow/brief-completed", express.json(), (req, res) => {
  try {
    const workflow = processWorkflow({
      briefId: req.body.briefId || null,
      cacheKey: req.body.cacheKey || null,
      userId: req.body.userId || "user_demo",
      selectedStyleId: req.body.selectedStyleId || null
    });
    res.json({ ok: true, workflow });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

router.get("/workflow/brief/:briefId", (req, res) => {
  const workflow = getWorkflowByBriefId(req.params.briefId);
  if (!workflow) return res.status(404).json({ ok: false, error: "Workflow not found" });
  res.json({ ok: true, workflow });
});

router.get("/workflow/user/:userId", (req, res) => {
  res.json({ ok: true, workflows: getWorkflowByUserId(req.params.userId) });
});

export default router;
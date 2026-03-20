import { db, createId } from "./db.js";
import { getScoreState } from "./scoringService.js";

export function saveBrief(payload) {
  const existing = db.briefs.find(x => x.briefId === payload.briefId) || null;
  const record = {
    briefId: existing?.briefId || createId("brief"),
    userId: payload.userId || "user_demo",
    cacheKey: payload.cacheKey || null,
    path: payload.path || "with_us",
    authorName: payload.authorName || "",
    bookTitle: payload.bookTitle || "",
    goal: payload.goal || "",
    audience: payload.audience || "",
    language: payload.language || "pl",
    sources: payload.sources || "",
    tone: payload.tone || "premium",
    deadline: payload.deadline || "soon",
    email: payload.email || "",
    notes: payload.notes || "",
    selectedStyleId: payload.selectedStyleId || null,
    scoreSnapshot: payload.scoreSnapshot || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const idx = db.briefs.findIndex(x => x.briefId === record.briefId);
  if (idx >= 0) db.briefs[idx] = record;
  else db.briefs.push(record);
  return record;
}

export function getBriefById(briefId) {
  return db.briefs.find(x => x.briefId === briefId) || null;
}

export function getBriefByCacheKey(cacheKey) {
  return db.briefs.find(x => x.cacheKey === cacheKey) || null;
}

function deriveNextAction(segment, selectedPath) {
  if (selectedPath === "self") return "send_self_service_pack";
  if (segment === "VERY_HOT") return "priority_async_onboarding";
  if (segment === "HOT") return "assign_onboarding_queue";
  if (segment === "WARM") return "send_followup_email";
  return "light_nurture";
}

export function processWorkflow({ briefId = null, cacheKey = null, userId = "user_demo", selectedStyleId = null }) {
  const brief = briefId ? getBriefById(briefId) : getBriefByCacheKey(cacheKey);
  if (!brief) throw new Error("Brief not found");

  const scoreSnapshot = brief.scoreSnapshot || getScoreState(brief.cacheKey) || null;
  const segment = scoreSnapshot?.segment || "WARM";
  const score = scoreSnapshot?.finalScore ?? null;
  const nextAction = deriveNextAction(segment, brief.path);

  let crm = db.crm.find(x => x.userId === userId) || null;
  crm = {
    crmId: crm?.crmId || createId("crm"),
    userId,
    briefId: brief.briefId,
    cacheKey: brief.cacheKey,
    email: brief.email || crm?.email || null,
    authorName: brief.authorName,
    bookTitle: brief.bookTitle,
    selectedPath: brief.path,
    segment,
    nextAction,
    score,
    leadStage: segment === "VERY_HOT" ? "onboarding_ready" : segment === "HOT" ? "brief_completed_hot" : segment === "WARM" ? "nurture_after_brief" : "cold_brief_saved",
    createdAt: crm?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const crmIdx = db.crm.findIndex(x => x.crmId === crm.crmId);
  if (crmIdx >= 0) db.crm[crmIdx] = crm; else db.crm.push(crm);

  let cdna = db.coursedna.find(x => x.userId === userId) || null;
  cdna = {
    coursednaId: cdna?.coursednaId || createId("cdna"),
    userId,
    briefId: brief.briefId,
    cacheKey: brief.cacheKey,
    authorName: brief.authorName,
    bookTitle: brief.bookTitle,
    selectedPath: brief.path,
    selectedStyleId: selectedStyleId || brief.selectedStyleId || null,
    segment,
    score,
    decisionRoute: brief.path === "self" ? "self_path" : segment === "VERY_HOT" ? "with_us_priority" : segment === "HOT" ? "with_us_hot" : segment === "WARM" ? "with_us_warm" : "cold_path",
    nextAction,
    priority: brief.path === "self" ? 150 : segment === "VERY_HOT" ? 20 : segment === "HOT" ? 60 : segment === "WARM" ? 120 : 220,
    status: "pending",
    createdAt: cdna?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const cdnaIdx = db.coursedna.findIndex(x => x.coursednaId === cdna.coursednaId);
  if (cdnaIdx >= 0) db.coursedna[cdnaIdx] = cdna; else db.coursedna.push(cdna);

  const workflow = {
    workflowId: createId("wf"),
    userId,
    briefId: brief.briefId,
    cacheKey: brief.cacheKey,
    crmId: crm.crmId,
    coursednaId: cdna.coursednaId,
    authorName: brief.authorName,
    bookTitle: brief.bookTitle,
    selectedPath: brief.path,
    segment,
    score,
    nextAction,
    status: "ready",
    createdAt: new Date().toISOString()
  };
  db.workflows.push(workflow);
  return workflow;
}

export function getWorkflowByBriefId(briefId) {
  return db.workflows.find(x => x.briefId === briefId) || null;
}

export function getWorkflowByUserId(userId) {
  return db.workflows.filter(x => x.userId === userId);
}
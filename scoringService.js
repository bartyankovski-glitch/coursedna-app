import { db, createId } from "./db.js";

const SEGMENTS = [
  { id: "COLD", min: 0, max: 9.99, nextAction: "light_nurture" },
  { id: "WARM", min: 10, max: 24.99, nextAction: "send_followup_email" },
  { id: "HOT", min: 25, max: 49.99, nextAction: "assign_onboarding_queue" },
  { id: "VERY_HOT", min: 50, max: 999999, nextAction: "priority_async_onboarding" }
];

function getEvents(userId, cacheKey) {
  return db.coverEvents
    .filter(x => x.userId === userId && x.cacheKey === cacheKey)
    .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function hasEvent(events, type) { return events.some(e => e.eventType === type); }
function countEvent(events, type) { return events.filter(e => e.eventType === type).length; }
function lastSelectedStyle(events) { return [...events].reverse().find(e => e.eventType === "cover_selected" && e.styleId)?.styleId || null; }

function calcFeatures(events) {
  let engagementDepth = 0, conversionIntent = 0, identitySignal = 0, frictionSignal = 0;
  for (const event of events) {
    if (event.eventType === "preview_viewed") {
      engagementDepth += 3;
      const scroll = Number(event.metadata?.scrollDepth || 0);
      const time = Number(event.metadata?.timeOnPageSec || 0);
      if (scroll > 50) engagementDepth += 2;
      if (scroll > 75) engagementDepth += 3;
      if (time > 45) engagementDepth += 2;
      if (time > 90) engagementDepth += 3;
      if (scroll < 10) frictionSignal += 3;
    }
    if (event.eventType === "fragment_viewed") engagementDepth += 4;
    if (event.eventType === "cta_clicked") conversionIntent += 12;
    if (event.eventType === "email_submitted") conversionIntent += 10;
    if (event.eventType === "brief_started") conversionIntent += 20;
    if (event.eventType === "brief_completed") conversionIntent += 35;
    if (event.eventType === "cover_selected") {
      identitySignal += 6;
      if (event.styleId === "dark_premium") identitySignal += 5;
      if (event.styleId === "business_clean") identitySignal += 3;
      if (event.styleId === "performance") identitySignal += 4;
    }
  }
  if (countEvent(events, "preview_viewed") >= 2) {
    engagementDepth += 6;
    identitySignal += 4;
  }
  return { engagementDepth, conversionIntent, identitySignal, frictionSignal };
}

function score(features) {
  return features.engagementDepth * 0.25 +
    features.conversionIntent * 0.45 +
    features.identitySignal * 0.20 -
    features.frictionSignal * 0.10;
}

function rank(segment){ return {COLD:1,WARM:2,HOT:3,VERY_HOT:4}[segment] || 1; }
function maxSegment(a,b){ return rank(a) >= rank(b) ? a : b; }
function minSegment(a,b){ return rank(a) <= rank(b) ? a : b; }
function mapScore(raw){ return SEGMENTS.find(x => raw >= x.min && raw <= x.max)?.id || "COLD"; }

function applyHardRules(segment, events) {
  let result = segment;
  if (hasEvent(events, "brief_completed")) result = maxSegment(result, "VERY_HOT");
  else if (hasEvent(events, "brief_started")) result = maxSegment(result, "HOT");
  const darkSelected = events.some(e => e.eventType === "cover_selected" && e.styleId === "dark_premium");
  if (darkSelected && hasEvent(events, "cta_clicked")) result = maxSegment(result, "HOT");
  if (countEvent(events, "preview_viewed") >= 3 && !hasEvent(events, "cta_clicked")) result = minSegment(result, "WARM");
  return result;
}

function mapAction(segment, events) {
  if (countEvent(events, "preview_viewed") >= 3 && !hasEvent(events, "cover_selected") && !hasEvent(events, "brief_started")) {
    return "light_nurture";
  }
  return SEGMENTS.find(x => x.id === segment)?.nextAction || "light_nurture";
}

export function recordEvent(event) {
  db.coverEvents.push(event);
  const events = getEvents(event.userId, event.cacheKey);
  const previous = db.coverScoreState.find(x => x.cacheKey === event.cacheKey) || null;
  const features = calcFeatures(events);
  const raw = score(features);
  const segment = applyHardRules(mapScore(raw), events);
  const nextAction = mapAction(segment, events);

  const state = {
    id: previous?.id || createId("score"),
    userId: event.userId,
    sessionId: event.sessionId || null,
    cacheKey: event.cacheKey,
    selectedStyleId: lastSelectedStyle(events),
    engagementDepth: Number(features.engagementDepth.toFixed(2)),
    conversionIntent: Number(features.conversionIntent.toFixed(2)),
    identitySignal: Number(features.identitySignal.toFixed(2)),
    frictionSignal: Number(features.frictionSignal.toFixed(2)),
    finalScore: Number(raw.toFixed(2)),
    segment,
    nextAction,
    lastEventType: event.eventType,
    lastEventAt: event.createdAt,
    updatedAt: new Date().toISOString()
  };

  const idx = db.coverScoreState.findIndex(x => x.cacheKey === event.cacheKey);
  if (idx >= 0) db.coverScoreState[idx] = state;
  else db.coverScoreState.push(state);

  db.coverScoreHistory.push({
    id: createId("hist"),
    userId: event.userId,
    cacheKey: event.cacheKey,
    previousScore: previous?.finalScore ?? null,
    newScore: state.finalScore,
    previousSegment: previous?.segment ?? null,
    newSegment: state.segment,
    triggerEventId: event.id,
    calculationJson: { ...features, formulaVersion: "v1" },
    createdAt: new Date().toISOString()
  });

  return state;
}

export function getScoreState(cacheKey) {
  return db.coverScoreState.find(x => x.cacheKey === cacheKey) || null;
}

export function getScoreHistory(cacheKey) {
  return db.coverScoreHistory.filter(x => x.cacheKey === cacheKey);
}
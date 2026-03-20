import crypto from "crypto";

export const db = {
  coverEvents: [],
  coverScoreState: [],
  coverScoreHistory: [],
  coverSets: [],
  briefs: [],
  crm: [],
  coursedna: [],
  workflows: []
};

export function createId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the server/ package directory. */
export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.env.VERCEL
    ? "/tmp/protoforge" // serverless filesystem is read-only except /tmp
    : path.join(SERVER_DIR, "data");
export const SEED_DIR = path.join(SERVER_DIR, "seed");
export const WEB_DIST = path.resolve(SERVER_DIR, "..", "web", "dist");

export const PORT = Number(process.env.PORT) || 8787;

export const MODEL_HEAVY = process.env.MODEL_HEAVY || "claude-opus-5-5";
export const MODEL_FAST = process.env.MODEL_FAST || "claude-sonnet-5-5";

export type AgentKey =
  | "architect"
  | "cad"
  | "sourcing"
  | "electronics"
  | "firmware"
  | "integration"
  | "assembly"
  | "review";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const HEAVY_AGENTS: AgentKey[] = ["architect", "cad", "electronics", "firmware"];

/**
 * Model for an agent. HEAVY for the generative engineering stages, FAST for the rest.
 * Override per stage with MODEL_<STAGE> (e.g. MODEL_CAD=claude-sonnet-5-5).
 */
export function modelFor(agent: AgentKey): string {
  const override = process.env[`MODEL_${agent.toUpperCase()}`];
  if (override) return override;
  return HEAVY_AGENTS.includes(agent) ? MODEL_HEAVY : MODEL_FAST;
}

/**
 * Effort (thinking depth) per agent. Kept low/medium so a whole product finishes in a few minutes.
 * Override with EFFORT_<STAGE>=low|medium|high|xhigh|max.
 */
const DEFAULT_EFFORT: Record<AgentKey, Effort> = {
  architect: "low",
  cad: "low",
  sourcing: "low",
  electronics: "low",
  firmware: "low",
  integration: "low",
  assembly: "low",
  review: "low",
};

export function effortFor(agent: AgentKey): Effort {
  const v = (process.env[`EFFORT_${agent.toUpperCase()}`] || "").toLowerCase();
  if (v === "low" || v === "medium" || v === "high" || v === "xhigh" || v === "max") return v;
  return DEFAULT_EFFORT[agent];
}

export const LLM_CONCURRENCY = Math.max(1, Number(process.env.LLM_CONCURRENCY) || 8);
/** Running inside a serverless function (Vercel): pipelines are resumable and leased per invocation. */
export const SERVERLESS = Boolean(process.env.VERCEL) || process.env.PF_SERVERLESS === "1";
/** Wall-clock budget of one serverless invocation (Vercel Hobby = 300 s). */
export const FUNCTION_BUDGET_MS = (Number(process.env.PF_MAX_DURATION) || 300) * 1000;
export const LLM_TIMEOUT_MS = Math.max(60_000, Number(process.env.LLM_TIMEOUT_MS) || (SERVERLESS ? 280_000 : 9 * 60_000));

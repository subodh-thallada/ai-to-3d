import type { AgentRun, AgentStatus, BomItem, Project, StageId } from "@protoforge/shared";

export function bomCost(bom: BomItem[] | undefined | null): number {
  if (!bom) return 0;
  return bom.reduce((sum, b) => sum + (Number(b.qty) || 0) * (Number(b.unitPrice) || 0), 0);
}

export function bomMass(bom: BomItem[] | undefined | null): number {
  if (!bom) return 0;
  return bom.reduce((sum, b) => sum + (Number(b.qty) || 0) * (Number(b.massG) || 0), 0);
}

export interface HeadlineMetrics {
  parts: number | undefined;
  costUsd: number | undefined;
  massG: number | undefined;
  score: number | undefined;
}

export function headlineMetrics(p: Project): HeadlineMetrics {
  const parts = p.cad?.parts?.length ?? p.review?.metrics?.partCount;
  const costUsd = p.bom && p.bom.length ? bomCost(p.bom) : p.review?.metrics?.costUsd;
  let massG: number | undefined = p.review?.metrics?.massG;
  if (!massG) {
    const fromBom = bomMass(p.bom);
    const fromCad = p.cad?.parts?.reduce((s, part) => s + (Number(part.massG) || 0), 0) ?? 0;
    massG = fromBom || fromCad || undefined;
  }
  return { parts, costUsd, massG, score: p.review?.score };
}

export const STAGE_ORDER: StageId[] = ["architect", "cad", "sourcing", "electronics", "firmware", "assembly", "review"];

/** Aggregate status of a pipeline stage from its agents (sub-agents roll up into the stage). */
export function stageStatus(agents: AgentRun[] | undefined, stage: StageId): AgentStatus | undefined {
  const runs = (agents ?? []).filter((a) => a.stage === stage);
  if (runs.length === 0) return undefined;
  if (runs.some((a) => a.status === "running")) return "running";
  if (runs.some((a) => a.status === "error")) return "error";
  if (runs.some((a) => a.status === "pending")) return runs.some((a) => a.status === "done") ? "running" : "pending";
  if (runs.every((a) => a.status === "skipped")) return "skipped";
  return "done";
}

export function scoreColor(score: number | undefined): string {
  if (score === undefined || !Number.isFinite(score)) return "var(--color-ink-faint)";
  if (score >= 80) return "var(--color-ok)";
  if (score >= 60) return "var(--color-warn)";
  return "var(--color-bad)";
}
